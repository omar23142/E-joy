// --- Subtitle Management ---
let currentSubtitles = [];       // English/Main
let currentArabicSubtitles = []; // Arabic
let isSubtitlesLoaded = false;
let subtitlesSource = '';

// Dictionary cache to avoid repeated API calls for same word
const dictionaryCache = {};

// Drag Logic Globals
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let activeDragBox = null;

// Global Drag Handlers
document.addEventListener('mousemove', (e) => {
    if (!isDragging || !activeDragBox) return;
    const overlay = activeDragBox.parentElement;
    if (!overlay) return;

    const overlayRect = overlay.getBoundingClientRect();
    let newLeft = e.clientX - overlayRect.left - dragOffsetX;
    let newTop = e.clientY - overlayRect.top - dragOffsetY;
    const boxRect = activeDragBox.getBoundingClientRect();

    newLeft = Math.max(0, Math.min(newLeft, overlayRect.width - boxRect.width));
    newTop = Math.max(0, Math.min(newTop, overlayRect.height - boxRect.height));

    activeDragBox.style.left = `${newLeft}px`;
    activeDragBox.style.top = `${newTop}px`;
});

document.addEventListener('mouseup', () => {
    if (isDragging && activeDragBox) {
        activeDragBox.classList.remove('dragging');
        isDragging = false;
        activeDragBox = null;
    }
});

// API Service instance (loaded from api-service.js)
let contentApiService = null;

// Initialize content script
async function initContentScript() {
    // Create a new API service instance for content script
    contentApiService = new ApiService();
    await contentApiService.init();
}

// Call init on script load
initContentScript();

// Fetch word definition with support for different modes (full, fast, word)
async function getWordDefinition(word, contextSentence = '', mode = 'full') {
    const cacheKey = `${mode}:${word.toLowerCase()}:${contextSentence}`;

    if (dictionaryCache[cacheKey]) {
        return dictionaryCache[cacheKey];
    }

    try {
        let translations = [];
        // 1. Fetch translations from our backend
        if (mode === 'fast') {
            const fastRes = await contentApiService.fastTranslate(word, contextSentence).catch(() => null);
            // new API returns an array, parse it safely
            let fastArr = [];
            try {
                fastArr = typeof fastRes === 'string' ? JSON.parse(fastRes) : fastRes;
            } catch (e) {
                fastArr = [fastRes];
            }
            translations = Array.isArray(fastArr) ? fastArr : (fastArr ? [fastArr] : []);
        } else if (mode === 'word') {
            const wordRes = await contentApiService.fastTranslateForWord(word, contextSentence).catch(() => null);
            let wordArr = [];
            try {
                wordArr = typeof wordRes === 'string' ? JSON.parse(wordRes) : wordRes;
            } catch (e) {
                wordArr = [wordRes];
            }
            translations = Array.isArray(wordArr) ? wordArr : (wordArr ? [wordArr] : []);
        } else {
            // Default full translation (multiple suggestions)
            const translateResponse = await contentApiService.translate(word, contextSentence, 'en').catch(() => []);
            translations = Array.isArray(translateResponse) ? translateResponse : (translateResponse.translation ? [translateResponse.translation] : [word]);
        }

        if (translations.length === 0) {
            // Return empty if not found, don't fallback to heavy full mode automatically
            return {
                slang: 'Word',
                translation: word,
                translations: [],
                definition: 'Not found locally.',
                context: '',
                synonyms: '-'
            };
        }

        // 2. Fetch extra details from Free Dictionary API (only for full mode)
        let extraDetails = {
            definition: 'Definition not found.',
            synonyms: '-',
            context: contextSentence,
            slang: 'Word'
        };

        if (mode === 'full') {
            try {
                const dictResponse = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
                if (dictResponse.ok) {
                    const data = await dictResponse.json();
                    const entry = data[0];
                    if (entry) {
                        const firstMeaning = entry.meanings[0];
                        if (firstMeaning) {
                            extraDetails.definition = firstMeaning.definitions[0]?.definition || extraDetails.definition;
                            extraDetails.context = firstMeaning.definitions[0]?.example || '';
                            extraDetails.slang = firstMeaning.partOfSpeech || 'Word';
                            extraDetails.synonyms = firstMeaning.synonyms?.slice(0, 5).join(', ') || entry.meanings.flatMap(m => m.synonyms).slice(0, 5).join(', ') || '-';
                        }
                    }
                }
            } catch (e) {
                console.warn('External dictionary fetch failed', e);
            }
        }

        const wordData = {
            slang: extraDetails.slang,
            // Main translation is the first item in the array
            translation: translations[0] || word,
            translations: translations,
            definition: extraDetails.definition,
            context: extraDetails.context || `Example: This is how "${word}" is used.`,
            synonyms: extraDetails.synonyms
        };

        dictionaryCache[cacheKey] = wordData;
        return wordData;
    } catch (error) {
        console.error('Error in getWordDefinition:', error);
        return {
            slang: 'Word',
            translation: word,
            translations: [word],
            definition: 'Could not load definition.',
            context: '',
            synonyms: '-'
        };
    }
}

// --- Smart Mapping Helpers ---

// Normalize Arabic text by removing diacritics and common prefixes
function normalizeArabic(text) {
    if (!text) return '';
    return text
        .replace(/[\u064B-\u0652]/g, "") // Remove harakat (diacritics)
        .replace(/^(ال|وال|بال|فال|لل)/, "") // Remove common prefixes (Al-, Wa-, Bi-, Fa-, Li-)
        .replace(/[إأآا]/g, "ا") // Normalize Alef
        .replace(/ة\b/g, "ه") // Normalize Teh Marbuta
        .replace(/ى\b/g, "ي") // Normalize Alef Maksura
        .trim();
}

// Extract an approximate root for Arabic words by removing common affixes
function extractArabicRoot(text) {
    if (!text) return '';
    let root = normalizeArabic(text);

    // Remove common prefixes
    root = root.replace(/^(ال|وال|فال|بال|لل|ك|ب|س|يت|ي|ت|ن|ا|م)/, "");

    // Remove common suffixes
    root = root.replace(/(ها|هم|هن|كم|كن|نا|ني|ي|ك|ه|ون|ين|ات|ان|ة|ت)$/, "");

    // Fallback if we stripped too much (roots are usually 3 letters)
    if (root.length < 3) {
        return normalizeArabic(text);
    }
    return root.trim();
}

// Find the best matching Arabic word from a sentence based on candidate translations
function findContextualMatch(candidates, sentence) {
    if (!sentence || !candidates || candidates.length === 0) return null;

    // Clean and split sentence into words
    const sentenceWords = sentence.split(/\s+/).map(w => {
        const original = w.replace(/[^\u0621-\u064A]/g, ""); // Keep only Arabic letters for matching
        return {
            original: original,
            normalized: normalizeArabic(original),
            root: extractArabicRoot(original)
        };
    });

    const candidateObjs = candidates.map(c => {
        const firstWord = c.split(/[,;:]+/)[0].trim();
        return {
            original: firstWord,
            normalized: normalizeArabic(firstWord),
            root: extractArabicRoot(firstWord)
        };
    });

    // 1. Precise Match (Normalized)
    for (const candidate of candidateObjs) {
        if (!candidate.normalized) continue;
        const match = sentenceWords.find(sw => sw.normalized === candidate.normalized);
        if (match) return match.original;
    }

    // 2. Root Match 
    for (const candidate of candidateObjs) {
        if (!candidate.root || candidate.root.length < 3) continue;
        const match = sentenceWords.find(sw => sw.root === candidate.root || sw.root.includes(candidate.root) || candidate.root.includes(sw.root));
        if (match) return match.original;
    }

    // 3. Contains Match (Fuzzy)
    for (const candidate of candidateObjs) {
        if (!candidate.normalized || candidate.normalized.length < 3) continue;
        const match = sentenceWords.find(sw => sw.normalized.includes(candidate.normalized) || candidate.normalized.includes(sw.normalized));
        if (match) return match.original;
    }

    return null; // No good match found
}


// Callback to trigger subtitle UI refresh from any video overlay
let ejoyForceUpdateCallback = null;
let courseraTranscriptObserver = null;
let courseraTranscriptPollTimer = null;
let lastCourseraTranscriptHash = '';

// --- Video Overlay Logic ---
let currentVideoElement = null; // Track the current video for popup pause
let wasManuallyPaused = false;  // Track if user manually paused the video
let isHoverPaused = false;      // Track if paused due to hover/popup
let currentFullscreenElement = null; // Track fullscreen element for popup positioning

function initVideoOverlay() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        if (video.dataset.ejoyAttached) return;
        video.dataset.ejoyAttached = "true";

        // Create Overlay with subtitle box wrapper (removed toggle buttons)
        const overlay = document.createElement('div');
        overlay.className = 'ejoy-video-overlay';
        if (window.location.href.includes('youtube.com')) {
            overlay.classList.add('ejoy-site-youtube');
        } else if (window.location.href.includes('coursera.org')) {
            overlay.classList.add('ejoy-site-coursera');
        }
        overlay.innerHTML = `
      <div class="ejoy-subtitle-box">
        <div class="ejoy-subtitle-original"></div>
        <div class="ejoy-subtitle-translated"></div>
      </div>
    `;

        // Initial parenting
        let parent = video.parentElement || document.body;
        if (parent && getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        parent?.appendChild(overlay);

        // Sync Position
        function syncOverlay() {
            // Check if video is visible
            if (video.offsetWidth === 0 || video.offsetHeight === 0) return;

            overlay.style.width = `${video.offsetWidth}px`;
            overlay.style.height = `${video.offsetHeight}px`;

            // If we are in fullscreen, we might need to adjust logic
            if (!document.fullscreenElement) {
                overlay.style.left = `${video.offsetLeft}px`;
                overlay.style.top = `${video.offsetTop}px`;
            } else {
                // In fullscreen, usually video consumes the whole screen
                // If overlay is child of the fullscreen element, top/left 0 is correct
                overlay.style.left = '0px';
                overlay.style.top = '0px';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
            }
        }
        syncOverlay();

        const resizeObserver = new ResizeObserver(() => syncOverlay());
        resizeObserver.observe(video);

        // Store original parent for restoration
        const originalParent = parent;

        // Fullscreen Handling - improved for YouTube and other sites
        const handleFullscreen = () => {
            const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
            if (fsElement) {
                currentFullscreenElement = fsElement; // Track for popup positioning
                // Video went fullscreen (or its parent)
                if (fsElement.contains(video) || fsElement === video) {
                    // Move overlay to fullscreen element
                    fsElement.appendChild(overlay);
                    overlay.style.position = 'fixed';
                    overlay.style.left = '0';
                    overlay.style.top = '0';
                    overlay.style.width = '100vw';
                    overlay.style.height = '100vh';
                    console.log('E-Joy: Moved overlay to fullscreen element');
                }
            } else {
                currentFullscreenElement = null; // Exited fullscreen
                // Exited fullscreen, move back to original parent
                if (originalParent) {
                    if (getComputedStyle(originalParent).position === 'static') originalParent.style.position = 'relative';
                    originalParent.appendChild(overlay);
                }
                overlay.style.position = 'absolute';
                syncOverlay();
            }
            // Force sync after a short delay for layout to settle
            setTimeout(syncOverlay, 150);
        };

        document.addEventListener('fullscreenchange', handleFullscreen);
        document.addEventListener('webkitfullscreenchange', handleFullscreen);

        // Track manual pause by user (not by hover)
        video.addEventListener('pause', () => {
            if (!isHoverPaused) {
                wasManuallyPaused = true;
            }
        });

        // Subtitle visibility (simplified, always show both)
        const originalEl = overlay.querySelector('.ejoy-subtitle-original');
        const translatedEl = overlay.querySelector('.ejoy-subtitle-translated');


        overlay.querySelectorAll('.ejoy-subtitle-box').forEach(box => {
            box.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('ejoy-word-span')) return;
                isDragging = true;
                activeDragBox = box;
                activeDragBox.classList.add('dragging');

                // Get absolute current position
                const rect = activeDragBox.getBoundingClientRect();
                const overlayRect = overlay.getBoundingClientRect();

                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;

                // Switch to absolute immediately to avoid flex-box interference
                activeDragBox.style.position = 'absolute';
                activeDragBox.style.left = `${rect.left - overlayRect.left}px`;
                activeDragBox.style.top = `${rect.top - overlayRect.top}px`;
                activeDragBox.style.margin = '0';
                activeDragBox.style.transform = 'none';

                e.preventDefault();
            });
        });



        // Subtitle Sync Logic using Index Tracking & Offset (Adaptive approach)
        let currentIndexEN = 0;
        let currentIndexAR = 0;
        // Adaptive Offset: keep Coursera at 0 to avoid EN/AR drift from differing cue timings
        const OFFSET = window.location.href.includes('coursera.org') ? 0 : (window.location.href.includes('youtube.com') ? 0.6 : 1.2);
        let syncAnimationFrame;

        const updateSubtitles = () => {
            if (currentSubtitles.length === 0 && currentArabicSubtitles.length === 0) {
                if (!video.paused && !video.ended) {
                    syncAnimationFrame = requestAnimationFrame(updateSubtitles);
                }
                return;
            }

            const t = video.currentTime + OFFSET;

            // --- 1. Lookup English ---
            if (currentSubtitles.length > 0) {
                while (currentIndexEN < currentSubtitles.length - 1 && t > currentSubtitles[currentIndexEN].end) currentIndexEN++;
                while (currentIndexEN > 0 && t < currentSubtitles[currentIndexEN].start) currentIndexEN--;
            }

            let displayEn = null;
            if (currentSubtitles.length > 0) {
                const subEn = currentSubtitles[currentIndexEN];
                if (subEn && t >= subEn.start && t <= subEn.end) displayEn = subEn;
                else if (subEn && t > subEn.end && t - subEn.end < 0.5) displayEn = subEn;
            }

            // --- 2. Lookup Arabic (aligned to same timing as English) ---
            if (currentArabicSubtitles.length > 0) {
                while (currentIndexAR < currentArabicSubtitles.length - 1 && t > currentArabicSubtitles[currentIndexAR].end) currentIndexAR++;
                while (currentIndexAR > 0 && t < currentArabicSubtitles[currentIndexAR].start) currentIndexAR--;
            }

            let displayAr = null;
            if (currentArabicSubtitles.length > 0) {
                const subAr = currentArabicSubtitles[currentIndexAR];
                if (subAr && t >= subAr.start && t <= subAr.end) displayAr = subAr;
                else if (subAr && t > subAr.end && t - subAr.end < 0.5) displayAr = subAr;
            }

            // --- 3. Update UI ---
            // Both boxes are driven by English display timing only — they appear/disappear together.
            if (displayEn) {
                overlay.style.opacity = "1";

                // English Box
                if (originalEl.dataset.currentText !== displayEn.text) {
                    originalEl.innerHTML = '';
                    const tokens = displayEn.text.match(/[\p{L}\p{N}'']+|[^\p{L}\p{N}\s]+|\s+/gu) || [];
                    tokens.forEach(token => {
                        if (/[\p{L}\p{N}'']+/u.test(token)) {
                            const span = document.createElement('span');
                            span.className = 'ejoy-word-span';
                            span.textContent = token;
                            span.addEventListener('mouseenter', async () => {
                                if (!video.paused) { isHoverPaused = true; video.pause(); }
                                currentVideoElement = video;

                                // Show smart quick translation on hover
                                if (displayAr && displayAr.text) {
                                    const cleanWord = token.replace(/[\p{P}\s]+/gu, "");

                                    // Trigger both requests simultaneously
                                    const localPromise = getWordDefinition(cleanWord, displayEn ? displayEn.text : '', 'word');
                                    const externalPromise = contentApiService.externalTranslate(cleanWord).catch(() => null);

                                    // Ensure capsule starts fresh
                                    const quickTranslate = document.createElement('div');
                                    quickTranslate.className = 'ejoy-quick-translate hover-capsule';
                                    quickTranslate.textContent = '...'; // loading state
                                    span.appendChild(quickTranslate);

                                    // 1. Initial Local Result
                                    const wordData = await localPromise;
                                    if (span.contains(quickTranslate)) { // prevent updating if user already hovered away
                                        const localMatch = findContextualMatch(wordData.translations, displayAr.text);
                                        quickTranslate.textContent = localMatch || wordData.translation;
                                    }

                                    // 2. Background External API Enrichment
                                    externalPromise.then(extTranslations => {
                                        if (extTranslations && Array.isArray(extTranslations) && extTranslations.length > 0) {
                                            if (span.contains(quickTranslate)) {
                                                const extMatch = findContextualMatch(extTranslations, displayAr.text);
                                                if (extMatch && extMatch !== quickTranslate.textContent) {
                                                    quickTranslate.textContent = extMatch;
                                                }
                                            }
                                        }
                                    });
                                }
                            }); span.addEventListener('mouseleave', () => {
                                if (isHoverPaused && !wasManuallyPaused && !activePopup) { video.play(); isHoverPaused = false; }
                                span.querySelectorAll('.hover-capsule').forEach(el => el.remove());
                            });
                            span.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                isHoverPaused = true; video.pause();
                                const cleanWord = token.replace(/[\p{P}\s]+/gu, "");
                                const quickTranslate = document.createElement('div');
                                quickTranslate.className = 'ejoy-quick-translate';
                                const cached = Object.keys(dictionaryCache).find(k => k.startsWith(cleanWord.toLowerCase() + ':'));
                                quickTranslate.textContent = cached ? (dictionaryCache[cached].translation || dictionaryCache[cached][0]) : (displayAr ? displayAr.text.split(' ').slice(0, 5).join(' ') + '...' : '...');
                                span.appendChild(quickTranslate);
                                setTimeout(() => quickTranslate.remove(), 2500);
                                const rect = span.getBoundingClientRect();
                                showPopup(rect.left, rect.bottom + 5, cleanWord, displayEn.text);
                            });
                            originalEl.appendChild(span);
                        } else {
                            originalEl.appendChild(document.createTextNode(token));
                        }
                    });
                    originalEl.dataset.currentText = displayEn.text;
                }

                // Arabic Box — shown together with English, hidden together with English
                translatedEl.style.display = 'block';
                if (displayAr && translatedEl.dataset.currentTranslation !== displayAr.text) {
                    translatedEl.textContent = displayAr.text;
                    translatedEl.dataset.currentTranslation = displayAr.text;
                }

            } else {
                // No English cue → hide BOTH boxes at the same time
                originalEl.textContent = "";
                originalEl.dataset.currentText = "";
                translatedEl.textContent = "";
                translatedEl.dataset.currentTranslation = "";
                translatedEl.style.display = 'none';
                overlay.style.opacity = "0";
            }

            // Only queue next frame if playing
            if (!video.paused && !video.ended) {
                syncAnimationFrame = requestAnimationFrame(updateSubtitles);
            }
        };

        video.addEventListener('play', () => {
            wasManuallyPaused = false;
            isHoverPaused = false;
            cancelAnimationFrame(syncAnimationFrame);
            syncAnimationFrame = requestAnimationFrame(updateSubtitles);
        });

        video.addEventListener('pause', () => {
            if (!isHoverPaused) {
                wasManuallyPaused = true;
            }
            cancelAnimationFrame(syncAnimationFrame);
            updateSubtitles(); // Final update to reflect state
        });

        // Initialize sync loop if video is already playing
        if (!video.paused) {
            syncAnimationFrame = requestAnimationFrame(updateSubtitles);
        }

        // Register a global callback so onMessage can trigger an update
        ejoyForceUpdateCallback = () => {
            cancelAnimationFrame(syncAnimationFrame);
            syncAnimationFrame = requestAnimationFrame(updateSubtitles);
        };

        // Suppress host subtitles periodically
        const suppressHostSubs = () => {
            const selectors = ['.ytp-caption-window-container', '.ytp-caption-segment', '.video-subtitles', '.player-timedtext', '.subtitle-overlay'];
            selectors.forEach(sel => {
                const el = document.querySelector(sel);
                if (el && el.style.display !== 'none') el.style.display = 'none';
            });
        };
        const suppressionInterval = setInterval(suppressHostSubs, 1000);
        suppressHostSubs();

        // Keep timeupdate as a fallback for seeking
        video.addEventListener('timeupdate', () => {
            if (window.location.href.includes('coursera.org') && subtitlesSource !== 'coursera-transcript') {
                loadCourseraTranscriptCues(video);
            }
            if (!isSubtitlesLoaded || currentSubtitles.length === 0) {
                parseTextTracks(video);
            }
            if (video.paused) updateSubtitles();
        });

        if (window.location.href.includes('coursera.org')) {
            initCourseraTranscriptSync(video);
        }

        // === Coursera: Eager textTracks activation ===
        // Try immediately, and also after a short delay for late-loading tracks
        parseTextTracks(video);
        setTimeout(() => parseTextTracks(video), 1500);
        setTimeout(() => parseTextTracks(video), 4000);

        // === Coursera / Generic: DOM Scraping for VTT URLs ===
        if (window.location.href.includes('coursera.org')) {
            // Eager scraping for Coursera
            scrapeCoursera();
            setTimeout(() => scrapeCoursera(), 2000);
            setTimeout(() => scrapeCoursera(), 5000); // Late loading
        }
    });
}

const observer = new MutationObserver((mutations) => {
    initVideoOverlay();
});
observer.observe(document.body, { childList: true, subtree: true });

// --- SPA Navigation Handling (for Coursera/YouTube) ---
let lastUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('[E-Joy] Navigation detected (URL changed). Re-scanning for subtitles...');
        // Reset state for new video
        isSubtitlesLoaded = false;
        subtitlesSource = '';
        currentSubtitles = [];
        currentArabicSubtitles = [];
        currentIndexEN = 0;
        currentIndexAR = 0;
        lastCourseraTranscriptHash = '';
        // Re-run initialization
        initVideoOverlay();
    }
}, 2000);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVideoOverlay);
} else {
    initVideoOverlay();
}

// --- Popup & Bubble Logic ---
let activeBubble = null;
let activePopup = null;

async function showPopup(x, y, text, contextSentence = '', isFullscreen = false) {
    if (activePopup) activePopup.remove();

    const popup = document.createElement('div');
    popup.className = 'ejoy-popup-card';
    popup.style.position = 'fixed';

    let leftPos = x;
    if (leftPos + 320 > window.innerWidth) leftPos = window.innerWidth - 340;
    if (leftPos < 0) leftPos = 10;

    let topPos = y;
    if (topPos + 400 > window.innerHeight) topPos = window.innerHeight - 420;
    if (topPos < 0) topPos = 10;

    popup.style.left = `${leftPos}px`;
    popup.style.top = `${topPos}px`;
    popup.style.zIndex = '2147483647';

    const getHeaderHtml = (user = null) => `
    <div class="ejoy-popup-header">
      <div style="display:flex; flex-direction:column;">
        <div class="ejoy-word-title">${text}</div>
        ${user ? `<div class="ejoy-user-info">Hi, ${user.userName || user.email.split('@')[0]} | <span class="ejoy-logout-link" id="ejoy-logout">Logout</span></div>` : ''}
      </div>
      <div class="ejoy-popup-close">✕</div>
    </div>
    `;

    const token = contentApiService.getToken();
    if (!token) {
        showAuthForm(popup, text, getHeaderHtml);
        document.body.appendChild(popup);
        activePopup = popup;
        return;
    }

    // Simultaneously fetch fast and full translations
    const fastPromise = getWordDefinition(text, contextSentence, 'word');
    const fullPromise = getWordDefinition(text, contextSentence, 'full');
    const listsPromise = contentApiService.getLists().catch(() => []);
    const userPromise = contentApiService.getCurrentUser().catch(() => null);

    // Render loading state
    popup.innerHTML = `
        ${getHeaderHtml()}
        <div style="padding: 20px; text-align: center; color: #666;">
            Searching results...
        </div>
    `;
    document.body.appendChild(popup);
    activePopup = popup;
    setupPopupEvents(popup, x, y, text);

    // Initial render when fast data arrives
    const fastData = await fastPromise;
    if (activePopup !== popup) return;

    // Render with empty lists initially to show meaning ASAP
    renderPopupBody(popup, text, fastData, [], null, getHeaderHtml);

    // Background enrichment for User details and Lists
    Promise.all([listsPromise, userPromise]).then(([userLists, currentUser]) => {
        if (activePopup === popup) {
            const listSelect = popup.querySelector('#ejoy-list-select');
            if (listSelect) {
                listSelect.innerHTML = userLists.length ? userLists.map(l => `<option value="${l.id}">${l.name}</option>`).join('') : '<option value="1">General</option>';
            }
            const targetLists = popup.querySelectorAll('.ejoy-target-list');
            targetLists.forEach(el => el.textContent = userLists.length ? userLists[0].name : 'General');
        }
    });

    // Background enrichment for full translation data
    fullPromise.then(fullData => {
        if (activePopup === popup) {
            updatePopupContent(popup, fullData);
        }
    });
}

function updatePopupContent(popup, wordData) {
    if (!popup) return;
    const updateElement = (selector, content) => {
        const el = popup.querySelector(selector);
        if (el) el.textContent = content;
    };

    // Update Quick Result if it was English or empty
    const quickVal = popup.querySelector('.ejoy-quick-val');
    if (quickVal && (quickVal.textContent === quickVal.dataset.originalWord || !/[ا-ي]/.test(quickVal.textContent))) {
        if (wordData.translation && /[ا-ي]/.test(wordData.translation)) {
            quickVal.textContent = wordData.translation;
        }
    }

    updateElement('#tab-synonyms .ejoy-text-content', wordData.synonyms || 'No synonyms found.');
    updateElement('#tab-definition .ejoy-text-content', wordData.definition || 'No definition found.');
    updateElement('#tab-slang .ejoy-text-content', wordData.slang || 'N/A');

    const exPane = popup.querySelector('#tab-examples .ejoy-context-box');
    if (exPane) exPane.textContent = `"${wordData.context || 'No examples available.'}"`;

    const list = popup.querySelector('.ejoy-translation-list');
    if (list) {
        if (Array.isArray(wordData.translations) && wordData.translations.length > 0) {
            list.innerHTML = wordData.translations.map((t, i) =>
                `<div class="ejoy-main-translation ${i === 0 ? 'selected' : ''}" data-index="${i}">${t}</div>`
            ).join('');
            setupTranslationClicks(popup);
        } else {
            list.innerHTML = `<div class="ejoy-loading-text">No detailed suggestions found.</div>`;
        }
    }
}

function renderPopupBody(popup, text, wordData, userLists, currentUser, getHeaderHtml) {
    let selectedTranslation = wordData.translation;
    let saveMode = 'both';

    popup.innerHTML = `
    ${getHeaderHtml(currentUser)}
    
    <div class="ejoy-quick-result">
        <div class="ejoy-label-sm">Quick Result</div>
        <div class="ejoy-quick-val" data-original-word="${text}">${wordData.translation}</div>
    </div>

    <div class="ejoy-tabs-nav">
      <button class="ejoy-tab-btn active" data-tab="translation">Translation</button>
      <button class="ejoy-tab-btn" data-tab="synonyms">Synonyms</button>
      <button class="ejoy-tab-btn" data-tab="examples">Examples</button>
      <button class="ejoy-tab-btn" data-tab="definition">Definition</button>
      <button class="ejoy-tab-btn" data-tab="slang">Slang</button>
    </div>

    <div class="ejoy-tab-content">
      <div class="ejoy-tab-pane active" id="tab-translation">
        <div class="ejoy-label-sm">Detailed Suggestions</div>
        <div class="ejoy-translation-list">
            ${Array.isArray(wordData.translations) && wordData.translations.length > 0
            ? wordData.translations.map((t, i) => `<div class="ejoy-main-translation ${i === 0 ? 'selected' : ''}" data-index="${i}">${t}</div>`).join('')
            : `<div class="ejoy-loading-text">Loading detailed suggestions...</div>`}
        </div>
      </div>

      <div class="ejoy-tab-pane" id="tab-synonyms">
        <div class="ejoy-text-content">${wordData.synonyms || 'Loading synonyms...'}</div>
      </div>

      <div class="ejoy-tab-pane" id="tab-examples">
        <div class="ejoy-context-box">"${wordData.context || 'Loading examples...'}"</div>
      </div>

      <div class="ejoy-tab-pane" id="tab-definition">
        <div class="ejoy-text-content">${wordData.definition || 'Loading definition...'}</div>
      </div>

      <div class="ejoy-tab-pane" id="tab-slang">
        <div class="ejoy-text-content">${wordData.slang || '...'}</div>
      </div>
    </div>

    <div class="ejoy-actions">
        <div class="ejoy-list-container" id="ejoy-list-area">
            <select id="ejoy-list-select" class="ejoy-list-select">
                ${userLists.length ? userLists.map(l => `<option value="${l.id}">${l.name}</option>`).join('') : '<option value="1">General</option>'}
            </select>
            <button id="ejoy-new-list-btn" class="ejoy-new-list-btn-toggle" title="Create New List">+</button>
        </div>
        
        <div id="ejoy-create-list-form" class="ejoy-create-list-form">
            <input type="text" id="ejoy-new-list-input" class="ejoy-new-list-input" placeholder="List Name">
            <button id="ejoy-save-list-btn" class="ejoy-save-list-btn">✓</button>
            <button id="ejoy-cancel-list-btn" class="ejoy-cancel-list-btn">✕</button>
        </div>

        <div class="ejoy-split-btn-container">
            <button class="ejoy-add-btn-main">Add to Vocabulary</button>
            <button class="ejoy-add-btn-arrow">▼</button>
            <div class="ejoy-dropdown-menu">
                <div class="ejoy-dropdown-item" data-mode="both">
                    <input type="radio" name="save-mode" checked> Save to <span class="ejoy-target-list">${userLists.length ? userLists[0].name : 'General'}</span> + ${document.title.substring(0, 15)}...
                </div>
                <div class="ejoy-dropdown-item" data-mode="list">
                    <input type="radio" name="save-mode"> Save to <span class="ejoy-target-list">${userLists.length ? userLists[0].name : 'General'}</span> only
                </div>
                <div class="ejoy-dropdown-item" data-mode="video">
                    <input type="radio" name="save-mode"> Save Activity only
                </div>
            </div>
        </div>
    </div>
    `;

    setupTabEvents(popup);
    setupTranslationClicks(popup);
    setupVocabularyEvents(popup, text, wordData, userLists, selectedTranslation, saveMode);
}
function setupTabEvents(popup) {
    const tabsButtons = popup.querySelectorAll('.ejoy-tab-btn');
    tabsButtons.forEach(tab => {
        tab.addEventListener('click', () => {
            popup.querySelectorAll('.ejoy-tab-btn').forEach(t => t.classList.remove('active'));
            popup.querySelectorAll('.ejoy-tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const targetPane = popup.querySelector(`#tab-${tab.dataset.tab}`);
            if (targetPane) targetPane.classList.add('active');
        });
    });
}

function setupVocabularyEvents(popup, text, wordData, userLists, selectedTranslation, saveMode) {
    const listSelect = popup.querySelector('#ejoy-list-select');
    const targetListLabels = popup.querySelectorAll('.ejoy-target-list');
    const newListBtn = popup.querySelector('#ejoy-new-list-btn');
    const createListForm = popup.querySelector('#ejoy-create-list-form');
    const saveListBtn = popup.querySelector('#ejoy-save-list-btn');
    const cancelListBtn = popup.querySelector('#ejoy-cancel-list-btn');
    const newListInput = popup.querySelector('#ejoy-new-list-input');
    const dropdownArrow = popup.querySelector('.ejoy-add-btn-arrow');
    const dropdownMenu = popup.querySelector('.ejoy-dropdown-menu');
    const dropdownItems = popup.querySelectorAll('.ejoy-dropdown-item');
    const listArea = popup.querySelector('#ejoy-list-area');
    const addBtn = popup.querySelector('.ejoy-add-btn-main');

    if (listSelect) {
        listSelect.addEventListener('change', () => {
            const selectedName = listSelect.options[listSelect.selectedIndex].text;
            targetListLabels.forEach(label => label.textContent = selectedName);
        });
    }

    if (newListBtn) {
        newListBtn.addEventListener('click', () => createListForm.classList.add('active'));
        cancelListBtn.addEventListener('click', () => createListForm.classList.remove('active'));
        saveListBtn.addEventListener('click', async () => {
            const name = newListInput.value.trim();
            if (!name) return;
            try {
                const newList = await contentApiService.createList({ name });
                const option = document.createElement('option');
                option.value = newList.id;
                option.text = newList.name;
                option.selected = true;
                listSelect.add(option);
                createListForm.classList.remove('active');
                targetListLabels.forEach(label => label.textContent = newList.name);
            } catch (e) { alert('Failed to create list'); }
        });
    }

    if (dropdownArrow) {
        dropdownArrow.addEventListener('click', (e) => { e.stopPropagation(); dropdownMenu.classList.toggle('active'); });
        document.addEventListener('click', (e) => { if (dropdownMenu && !dropdownMenu.contains(e.target)) dropdownMenu.classList.remove('active'); });
    }

    dropdownItems.forEach(item => {
        item.addEventListener('click', () => {
            saveMode = item.dataset.mode;
            dropdownItems.forEach(i => i.querySelector('input').checked = false);
            item.querySelector('input').checked = true;
            dropdownMenu.classList.remove('active');
            if (saveMode === 'video') {
                listArea.style.opacity = '0.5';
                listArea.style.pointerEvents = 'none';
            } else {
                listArea.style.opacity = '1';
                listArea.style.pointerEvents = 'auto';
            }
        });
    });

    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const originalText = addBtn.textContent;
            addBtn.textContent = "Saving...";
            addBtn.disabled = true;

            try {
                const videoElement = currentVideoElement || document.querySelector('video');
                const vocabData = {
                    word: text,
                    selectedTranslate: popup.querySelector('.ejoy-main-translation.selected')?.textContent?.trim() || selectedTranslation,
                    language: 'en',
                    contextSentence: wordData.context || '',
                    timeStamp: (saveMode !== 'list' && videoElement) ? Math.floor(videoElement.currentTime) : 0,
                    listId: saveMode === 'video' ? undefined : (listSelect ? parseInt(listSelect.value) : undefined),
                    videoDetailes: (saveMode === 'both' || saveMode === 'video') ? {
                        originalUrl: window.location.href,
                        platform: window.location.href.includes('youtube') ? 'youtube' : 'other',
                        title: document.title
                    } : null
                };

                await contentApiService.createVocabulary(vocabData);
                addBtn.textContent = "Saved ✓";
                addBtn.style.background = "#95a5a6";
                setTimeout(() => { addBtn.textContent = originalText; addBtn.disabled = false; addBtn.style.background = ""; }, 2000);
            } catch (error) {
                addBtn.textContent = "Error";
                addBtn.disabled = false;
                setTimeout(() => { addBtn.textContent = originalText; }, 2000);
            }
        });
    }
}

function setupTranslationClicks(popup) {
    const translationItems = popup.querySelectorAll('.ejoy-main-translation');
    translationItems.forEach(item => {
        item.addEventListener('click', () => {
            translationItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        });
    });
}

function showAuthForm(popup, text, getHeaderHtml) {
    let mode = 'signin';
    const render = () => {
        popup.innerHTML = `
        ${getHeaderHtml()}
        <div class="ejoy-auth-container">
            <div class="ejoy-auth-title">${mode === 'signin' ? 'Sign In' : 'Create Account'}</div>
            <div id="ejoy-auth-error" class="ejoy-auth-error">Error message</div>
            <input type="email" id="ejoy-email" class="ejoy-auth-input" placeholder="Email">
            <input type="password" id="ejoy-password" class="ejoy-auth-input" placeholder="Password">
            <button id="ejoy-auth-submit" class="ejoy-auth-btn">${mode === 'signin' ? 'Login' : 'Signup'}</button>
            <div id="ejoy-auth-toggle" class="ejoy-auth-switch">
                ${mode === 'signin' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </div>
        </div>
        `;

        popup.querySelector('#ejoy-auth-toggle').addEventListener('click', () => {
            mode = mode === 'signin' ? 'signup' : 'signin';
            render();
        });

        popup.querySelector('#ejoy-auth-submit').addEventListener('click', async () => {
            const email = popup.querySelector('#ejoy-email').value;
            const password = popup.querySelector('#ejoy-password').value;
            const errorEl = popup.querySelector('#ejoy-auth-error');
            const btn = popup.querySelector('#ejoy-auth-submit');

            btn.disabled = true;
            btn.textContent = '...';
            errorEl.style.display = 'none';

            try {
                if (mode === 'signin') {
                    await contentApiService.signin(email, password);
                } else {
                    await contentApiService.signup({ email, password, userName: email.split('@')[0] });
                    alert('Signup successful! Please check your email to verify account, then login here.');
                    mode = 'signin';
                    render();
                    return;
                }
                const rect = { left: parseInt(popup.style.left), bottom: parseInt(popup.style.top) };
                showPopup(rect.left, rect.bottom, text);
            } catch (err) {
                errorEl.textContent = err.message || 'Authentication failed';
                errorEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = mode === 'signin' ? 'Login' : 'Signup';
            }
        });
    };
    render();
}

function setupPopupEvents(p, x, y, text) {
    if (p.dataset.eventsInitialized) return;
    p.dataset.eventsInitialized = "true";

    let isDraggingPopup = false;
    let startX, startY, initialLeft, initialTop;

    const onMouseMove = (e) => {
        if (!isDraggingPopup) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        p.style.left = `${initialLeft + dx}px`;
        p.style.top = `${initialTop + dy}px`;
        p.style.transform = 'none';
        window.getSelection().removeAllRanges();
    };

    const onMouseUp = () => {
        if (isDraggingPopup) {
            isDraggingPopup = false;
            p.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    };

    p.addEventListener('mousedown', (e) => {
        const header = e.target.closest('.ejoy-popup-header');
        if (!header) return;
        if (e.target.closest('.ejoy-popup-close') || e.target.closest('.ejoy-logout-link') || e.target.closest('.ejoy-user-info')) return;
        isDraggingPopup = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = p.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        p.classList.add('dragging');
        document.body.style.userSelect = 'none';
        p.style.transform = 'none';
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    p.addEventListener('click', async (e) => {
        const closeBtn = e.target.closest('.ejoy-popup-close');
        if (closeBtn) {
            e.stopPropagation();
            p.remove();
            activePopup = null;
            if (currentVideoElement && isHoverPaused && !wasManuallyPaused) {
                currentVideoElement.play();
            }
            isHoverPaused = false;
            return;
        }
    });
}

document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (e.target.closest('.ejoy-video-overlay') || e.target.closest('.ejoy-popup-card')) return;
    if (activeBubble && !activeBubble.contains(e.target)) {
        activeBubble.remove();
        activeBubble = null;
    }
    if (activePopup && !activePopup.contains(e.target)) {
        activePopup.remove();
        activePopup = null;
        if (currentVideoElement && isHoverPaused && !wasManuallyPaused) {
            currentVideoElement.play();
        }
        isHoverPaused = false;
        currentVideoElement = null;
    }
    if (text.length > 0 && text.length < 50) {
        setTimeout(() => {
            if (window.getSelection().toString().trim() === text) {
                showBubble(e.pageX, e.pageY, text);
            }
        }, 10);
    }
});

function showBubble(x, y, text) {
    if (activeBubble) activeBubble.remove();
    const bubble = document.createElement('div');
    bubble.className = 'ejoy-bubble-btn';
    bubble.textContent = '+';
    bubble.style.left = `${x + 10}px`;
    bubble.style.top = `${y - 40}px`;
    document.body.appendChild(bubble);
    activeBubble = bubble;
    bubble.addEventListener('click', (e) => {
        e.stopPropagation();
        showPopup(x, y, text);
        bubble.remove();
        activeBubble = null;
    });
}

// === Batch Subtitle Translation ===
// Called after English subtitles are loaded, to auto-generate Arabic via backend
async function batchTranslateSubtitles(cues) {
    if (!cues || cues.length === 0) return;

    // 1. Deduplicate sentences
    const uniqueSentences = [...new Set(cues.map(c => c.text.trim()).filter(t => t.length > 0))];
    console.log(`[E-Joy] Requesting background translation for ${uniqueSentences.length} sentences...`);

    // 3. Send to background.js instead of local backend
    chrome.runtime.sendMessage({ type: 'EJOY_BATCH_TRANSLATE', sentences: uniqueSentences }, (response) => {
        if (!response || !response.success) {
            console.warn('[E-Joy] Background translation failed:', response?.error || 'No response');
            return;
        }

        const translated = response.translated; // [{original, translation}]

        // 4. Build lookup map: original → arabic
        const translationMap = {};
        translated.forEach(item => {
            if (item.original && item.translation) {
                translationMap[item.original.trim()] = item.translation.trim();
            }
        });

        // 5. Build Arabic cues array
        const arCues = cues.map(cue => ({
            start: cue.start,
            end: cue.end,
            text: translationMap[cue.text.trim()] || cue.text
        })).filter(c => c.text);

        currentArabicSubtitles = arCues;
        console.log(`%c[E-Joy] 🇸🇦 ARABIC loaded — Source: Batch Google Translation (${arCues.length} cues) — timings copied from English`, 'color: #81c784; font-weight: bold;');

        if (ejoyForceUpdateCallback) ejoyForceUpdateCallback();
    });
}

function parseTextTracks(videoElement) {
    if (window.location.href.includes('coursera.org') && subtitlesSource === 'coursera-transcript') return;
    if (!videoElement || !videoElement.textTracks || videoElement.textTracks.length === 0) return;
    let enTrack = null;
    let arTrack = null;
    const forceArFromEn = window.location.href.includes('coursera.org');
    for (let i = 0; i < videoElement.textTracks.length; i++) {
        const track = videoElement.textTracks[i];
        if (track.language.startsWith('en') || track.label.toLowerCase().includes('english')) {
            enTrack = track;
        } else if (track.language.startsWith('ar') || track.label.toLowerCase().includes('arabic')) {
            arTrack = track;
        }
    }
    if (enTrack) {
        // Force-enable English track so cues are populated
        if (enTrack.mode === 'disabled') enTrack.mode = 'hidden';
        const tryLoad = () => {
            if (enTrack.cues && enTrack.cues.length > 0 && !isSubtitlesLoaded) {
                const rawSubs = [];
                for (let i = 0; i < enTrack.cues.length; i++) {
                    const cue = enTrack.cues[i];
                    rawSubs.push({
                        start: cue.startTime,
                        end: cue.endTime,
                        text: cue.text.replace(/<[^>]+>/g, '').trim()
                    });
                }

                // Use original cues directly (no splitting)
                const extractedSubs = rawSubs;

                currentSubtitles = extractedSubs.map(s => ({ ...s, translation: '---' }));
                isSubtitlesLoaded = true;
                subtitlesSource = 'texttrack';
                console.log('%c[E-Joy] 🇬🇧 ENGLISH loaded — Source: TextTrack API (' + currentSubtitles.length + ' cues)', 'color: #4fc3f7; font-weight: bold;');
                if (ejoyForceUpdateCallback) ejoyForceUpdateCallback();

                if (!forceArFromEn && arTrack) {
                    // Try to load Arabic from textTracks (non-Coursera)
                    if (arTrack.mode === 'disabled') arTrack.mode = 'hidden';
                    setTimeout(() => {
                        if (arTrack.cues && arTrack.cues.length > 0) {
                            const arCues = [];
                            for (let j = 0; j < arTrack.cues.length; j++) {
                                const c = arTrack.cues[j];
                                arCues.push({ start: c.startTime, end: c.endTime, text: c.text.replace(/<[^>]+>/g, '').trim() });
                            }
                            currentArabicSubtitles = arCues;
                            console.log('%c[E-Joy] 🇸🇦 ARABIC loaded — Source: TextTrack API (' + arCues.length + ' cues)', 'color: #81c784; font-weight: bold;');
                            if (ejoyForceUpdateCallback) ejoyForceUpdateCallback();
                        } else {
                            // No Arabic track available → batch translate via backend
                            batchTranslateSubtitles(extractedSubs);
                        }
                    }, 300);
                } else {
                    // Coursera (or no Arabic track): keep Arabic timing identical to English
                    batchTranslateSubtitles(extractedSubs);
                }
            } else if (!isSubtitlesLoaded) {
                setTimeout(tryLoad, 500);
            }
        };
        setTimeout(tryLoad, 150);
    }
}

// === Coursera DOM Scraper ===
function scrapeCoursera() {
    console.log('[E-Joy] Scraping Coursera for subtitle URLs...');

    // Strategy 1: Search window object for initial state data
    const stateKeys = ['__NEXT_DATA__', '__INITIAL_STATE__', '__APOLLO_STATE__', 'CourseraApp'];
    for (const key of stateKeys) {
        if (window[key]) {
            const json = JSON.stringify(window[key]);
            extractVttUrlsFromJson(json);
        }
    }

    // Strategy 2: Search all <script> tags for subtitle JSON
    document.querySelectorAll('script').forEach(script => {
        const text = script.textContent || '';
        if (text.includes('.vtt') || text.includes('subtitle') || text.includes('caption')) {
            extractVttUrlsFromJson(text);
        }
    });

    // Strategy 3: Search <a> and <track> elements for .vtt hrefs
    document.querySelectorAll('track[kind="subtitles"], track[kind="captions"]').forEach(track => {
        const src = track.src;
        const lang = track.srclang || track.getAttribute('srclang') || '';
        const label = track.label || '';
        if (src && src.includes('.vtt')) {
            const isAr = lang.startsWith('ar') || label.toLowerCase().includes('arabic');
            console.log(`[E-Joy Coursera] Found <track>: ${label} (${lang}) → fetching as ${isAr ? 'Arabic' : 'English'}`);
            chrome.runtime.sendMessage({ type: 'EJOY_FETCH_SUBTITLE', url: src, isArabic: isAr });
        }
    });
}

function extractVttUrlsFromJson(text) {
    // Match .vtt URLs in JSON/script text
    const vttRegex = /https?:\/\/[^"'\s]+\.vtt[^"'\s]*/g;
    const matches = text.match(vttRegex);
    if (!matches) return;

    const seen = new Set();
    matches.forEach(url => {
        if (seen.has(url)) return;
        seen.add(url);
        const lower = url.toLowerCase();
        // Determine language from the URL path or query
        const isAr = lower.includes('/ar') || lower.includes('_ar') || lower.includes('lang=ar') ||
            lower.includes('arabic') || lower.includes('-ar.');
        const isEn = lower.includes('/en') || lower.includes('_en') || lower.includes('lang=en') ||
            lower.includes('english') || lower.includes('-en.');
        if (isAr) {
            console.log('[E-Joy Coursera] Found Arabic VTT:', url);
            chrome.runtime.sendMessage({ type: 'EJOY_FETCH_SUBTITLE', url, isArabic: true });
        } else if (isEn || !isAr) {
            // If can't determine, try as English
            console.log('[E-Joy Coursera] Found English VTT:', url);
            chrome.runtime.sendMessage({ type: 'EJOY_FETCH_SUBTITLE', url, isArabic: false });
        }
    });
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'EJOY_SUBTITLE_FOUND') {
        const subUrl = message.payload.url.toLowerCase();
        console.log("[E-Joy] Message Received. URL:", subUrl);
        try {
            const forceArFromEn = window.location.href.includes('coursera.org');
            // Smart Language Detection
            const urlParams = new URLSearchParams(subUrl.split('?')[1] || '');
            const lang = urlParams.get('lang') || '';
            const tlang = urlParams.get('tlang') || '';

            // Determine subtitle type
            // - Arabic: lang=ar, OR lang=en with tlang=ar (YouTube machine translation to Arabic)
            // - English: lang=en with no tlang, or tlang=en
            // - SKIP: any other tlang (e.g. tlang=vi = Vietnamese) to avoid wrong text in English box
            let isArabic = lang === 'ar' || (lang === 'en' && tlang === 'ar') || tlang === 'ar';
            let isEnglish = !isArabic && (lang === 'en' && (tlang === '' || tlang === 'en'));

            // Also handle non-YouTube patterns (.ar., _ar., etc.)
            if (!isArabic && !isEnglish) {
                if (subUrl.includes('.ar.') || subUrl.includes('_ar.')) isArabic = true;
                else if (subUrl.includes('.en.') || subUrl.includes('_en.')) isEnglish = true;
            }

            // Skip irrelevant languages
            if (!isArabic && !isEnglish) {
                console.log(`[E-Joy] Skipping irrelevant language: lang=${lang}, tlang=${tlang}`);
                return;
            }

            console.log(`[E-Joy] Identified as: ${isArabic ? 'ARABIC' : 'ENGLISH'} (lang=${lang}, tlang=${tlang})`);

            if (forceArFromEn && isArabic) {
                console.log('[E-Joy] Coursera: ignoring Arabic track to keep timing aligned with English');
                return;
            }
            if (forceArFromEn && isEnglish && subtitlesSource === 'coursera-transcript') {
                console.log('[E-Joy] Coursera: keeping transcript as primary timing source');
                return;
            }

            if (!message.payload.text) {
                console.warn("[E-Joy] Subtitle payload has no text.");
                return;
            }

            const text = message.payload.text;
            let parsedNewCues = [];

            if (subUrl.includes('.vtt') || text.includes('WEBVTT')) {
                parsedNewCues = parseVTT(text);
            } else if (subUrl.includes('.json') || subUrl.includes('timedtext')) {
                const jsonData = JSON.parse(text);
                parsedNewCues = parseYouTubeJSON(jsonData);
            }

            if (parsedNewCues.length > 0) {
                if (isArabic) {
                    console.log('%c[E-Joy] 🇸🇦 ARABIC loaded — Source: Background Network Intercept (YouTube track)', 'color: #81c784; font-weight: bold;');
                    // Align Arabic timestamps to English to ensure perfect sync.
                    // YouTube's Arabic auto-translated track has slightly different timestamps.
                    if (currentSubtitles.length > 0) {
                        // Build a map: for each Arabic cue, find the English cue that has the most overlap
                        const aligned = parsedNewCues.map(arCue => {
                            const midpoint = (arCue.start + arCue.end) / 2;
                            // Find English cue whose interval contains the midpoint of the Arabic cue
                            const enCue = currentSubtitles.find(en => midpoint >= en.start && midpoint <= en.end)
                                || currentSubtitles.reduce((best, en) => {
                                    const dist = Math.min(Math.abs(en.start - midpoint), Math.abs(en.end - midpoint));
                                    const bestDist = Math.min(Math.abs(best.start - midpoint), Math.abs(best.end - midpoint));
                                    return dist < bestDist ? en : best;
                                }, currentSubtitles[0]);
                            return { start: enCue.start, end: enCue.end, text: arCue.text };
                        });
                        currentArabicSubtitles = aligned;
                        console.log(`%c[E-Joy] 🔁 Arabic timestamps re-aligned to English (${aligned.length} cues synced)`, 'color: #ffd54f; font-weight: bold;');
                    } else {
                        // English not loaded yet — keep Arabic timing as-is, sync will apply when EN arrives
                        currentArabicSubtitles = parsedNewCues;
                    }
                } else {
                    // Use original cues directly (no splitting)
                    const splitSubs = parsedNewCues;
                    console.log(`%c[E-Joy] 🇬🇧 ENGLISH loaded — Source: Background Network Intercept (${splitSubs.length} cues)`, 'color: #4fc3f7; font-weight: bold;');
                    currentSubtitles = splitSubs.map(s => ({ ...s, translation: '---' }));
                    isSubtitlesLoaded = true;
                    subtitlesSource = 'external-track';
                    // If no Arabic subtitles yet, auto-translate via backend
                    if (currentArabicSubtitles.length === 0 || forceArFromEn) {
                        batchTranslateSubtitles(splitSubs);
                    }
                }
                console.log("[E-Joy] Step 2: Independent Sync UI Ready.");
                if (ejoyForceUpdateCallback) ejoyForceUpdateCallback();
            }
        } catch (error) {
            console.error('[E-Joy] Error processing subtitle message:', error);
        }
    }
});

function parseVTT(vttText) {
    const lines = vttText.split(/\r?\n/);
    const cues = [];
    let currentCue = null;
    const timeRegex = /(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})/;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line === 'WEBVTT') continue;
        const timeMatch = line.match(timeRegex);
        if (timeMatch) {
            currentCue = {
                start: parseTime(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]),
                end: parseTime(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]),
                text: "",
                translation: "جارٍ المعالجة..."
            };
            cues.push(currentCue);
        } else if (currentCue && !line.includes('-->')) {
            const cleanText = line.replace(/<[^>]+>/g, '');
            currentCue.text += (currentCue.text ? " " : "") + cleanText;
        }
    }
    return cues;
}

// === Subtitle Granularity: Split long cues into sentence-based chunks ===
function splitCuesBySentences(cues) {
    const newCues = [];
    cues.forEach(cue => {
        // Skip splitting for short cues to prevent flicker
        if (cue.text.length < 40) {
            newCues.push(cue);
            return;
        }

        // Improved Regex: Split on . ! ? only if followed by space or end of line
        const sentences = cue.text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g);

        if (!sentences || sentences.length <= 1) {
            newCues.push(cue);
            return;
        }

        // Clean and merge very short fragments (less than 5 chars) to avoid single-word flicker
        const cleanSentences = [];
        sentences.forEach(s => {
            const trim = s.trim();
            if (trim.length < 5 && cleanSentences.length > 0) {
                cleanSentences[cleanSentences.length - 1] += " " + trim;
            } else if (trim.length > 0) {
                cleanSentences.push(trim);
            }
        });

        if (cleanSentences.length <= 1) {
            newCues.push(cue);
            return;
        }

        const totalChars = cue.text.length;
        const duration = cue.end - cue.start;
        let runningStart = cue.start;

        cleanSentences.forEach(sentence => {
            const sentenceDuration = (sentence.length / totalChars) * duration;
            const end = Math.min(cue.end, runningStart + sentenceDuration);

            newCues.push({
                start: runningStart,
                end: end,
                text: sentence
            });
            runningStart = end;
        });
    });
    return newCues;
}

function parseTime(hours, minutes, seconds, milliseconds) {
    let totalSeconds = 0;
    if (hours) totalSeconds += parseInt(hours) * 3600;
    totalSeconds += parseInt(minutes) * 60;
    totalSeconds += parseInt(seconds);
    totalSeconds += parseInt(milliseconds) / 1000;
    return totalSeconds;
}

function parseYouTubeJSON(jsonData) {
    const cues = [];
    if (!jsonData || !jsonData.events) return cues;
    jsonData.events.forEach(event => {
        if (!event.segs || event.segs.length === 0) return;
        const eventStart = (event.tStartMs || 0) / 1000;
        const eventDuration = (event.dDurationMs || 2000) / 1000;
        const eventEnd = eventStart + eventDuration;
        const hasOffsets = event.segs.some(s => s.tOffsetMs !== undefined && s.tOffsetMs > 0);
        if (hasOffsets) {
            let accumulatedText = "";
            event.segs.forEach((seg, index) => {
                const segText = seg.utf8 || "";
                accumulatedText += segText;
                const cleanText = accumulatedText.replace(/\n+/g, ' ').trim();
                if (!cleanText) return;
                let subStart = eventStart + (seg.tOffsetMs || 0) / 1000;
                let subEnd = eventEnd;
                if (index < event.segs.length - 1) {
                    const nextSeg = event.segs[index + 1];
                    if (nextSeg.tOffsetMs !== undefined) subEnd = eventStart + (nextSeg.tOffsetMs / 1000);
                }
                cues.push({ start: subStart, end: Math.max(subStart + 0.1, subEnd), text: cleanText, translation: "جارٍ المعالجة..." });
            });
        } else {
            let fullText = event.segs.map(s => s.utf8 || "").join('').trim();
            if (fullText) {
                cues.push({ start: eventStart, end: eventEnd, text: fullText, translation: "جارٍ المعالجة..." });
            }
        }
    });
    return cues.sort((a, b) => a.start - b.start);
}

function initCourseraTranscriptSync(videoElement) {
    if (!window.location.href.includes('coursera.org')) return;

    loadCourseraTranscriptCues(videoElement);

    if (courseraTranscriptObserver) {
        courseraTranscriptObserver.disconnect();
    }
    courseraTranscriptObserver = new MutationObserver(() => {
        if (subtitlesSource !== 'coursera-transcript') {
            loadCourseraTranscriptCues(videoElement);
        }
    });
    courseraTranscriptObserver.observe(document.body, { childList: true, subtree: true });

    if (courseraTranscriptPollTimer) clearInterval(courseraTranscriptPollTimer);
    courseraTranscriptPollTimer = setInterval(() => {
        if (subtitlesSource !== 'coursera-transcript') {
            loadCourseraTranscriptCues(videoElement);
        }
    }, 1500);
}

function loadCourseraTranscriptCues(videoElement) {
    const cues = extractCourseraTranscriptCues(videoElement);
    if (!cues || cues.length < 3) return false;

    const hash = cues.length + ':' + cues.slice(0, 12).map(c => `${c.start.toFixed(2)}|${c.text}`).join('||');
    if (hash === lastCourseraTranscriptHash) return true;
    lastCourseraTranscriptHash = hash;

    currentSubtitles = cues.map(c => ({ ...c, translation: '---' }));
    isSubtitlesLoaded = true;
    subtitlesSource = 'coursera-transcript';
    currentArabicSubtitles = [];
    console.log(`[E-Joy] Coursera transcript loaded (${cues.length} cues)`);
    batchTranslateSubtitles(cues);
    if (ejoyForceUpdateCallback) ejoyForceUpdateCallback();
    return true;
}

function extractCourseraTranscriptCues(videoElement) {
    const roots = findCourseraTranscriptRoots();
    if (roots.length === 0) return [];

    const cues = [];
    const seen = new Set();
    for (const root of roots) {
        const rows = root.querySelectorAll('button, [role="button"], li, [data-start], [data-start-time], [data-testid*="line"], [class*="line"], [class*="Line"]');
        rows.forEach(row => {
            const cue = parseCourseraTranscriptRow(row);
            if (!cue) return;
            const key = `${cue.start}|${cue.text}`;
            if (seen.has(key)) return;
            seen.add(key);
            cues.push(cue);
        });
    }

    cues.sort((a, b) => a.start - b.start);
    if (cues.length < 3) return [];

    const hasEnglishLikeContent = cues.some(c => /[A-Za-z]/.test(c.text));
    if (!hasEnglishLikeContent) return [];

    const duration = (videoElement && Number.isFinite(videoElement.duration)) ? videoElement.duration : null;
    for (let i = 0; i < cues.length; i++) {
        const next = cues[i + 1];
        const fallbackEnd = duration ? duration : cues[i].start + 2;
        cues[i].end = next ? Math.max(cues[i].start + 0.2, next.start) : Math.max(cues[i].start + 0.5, fallbackEnd);
    }
    return cues;
}

function findCourseraTranscriptRoots() {
    const selectors = [
        '[data-testid*="transcript"]',
        '[class*="transcript"]',
        '[class*="Transcript"]',
        '[aria-label*="transcript" i]'
    ];
    const roots = [];
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            const text = (el.textContent || '').trim();
            if (!text) return;
            if (!text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)) return;
            roots.push(el);
        });
    });
    return roots;
}

function parseCourseraTranscriptRow(row) {
    if (!row) return null;

    const attrStart = row.getAttribute('data-start') || row.getAttribute('data-start-time') || row.dataset?.start || row.dataset?.startTime;
    let start = attrStart !== null && attrStart !== undefined && attrStart !== '' ? Number(attrStart) : null;
    if (!Number.isFinite(start)) start = null;

    const raw = (row.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;

    const timeMatch = raw.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    if (start === null && timeMatch) {
        start = parseTranscriptTimeToSeconds(timeMatch[1]);
    }
    if (start === null || !Number.isFinite(start)) return null;

    const text = raw.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/, '').trim();
    if (!text) return null;

    return { start, end: start + 1, text };
}

function parseTranscriptTimeToSeconds(timeString) {
    if (!timeString) return null;
    const parts = timeString.split(':').map(p => parseInt(p, 10));
    if (parts.some(Number.isNaN)) return null;
    if (parts.length === 2) {
        return (parts[0] * 60) + parts[1];
    }
    if (parts.length === 3) {
        return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    }
    return null;
}

