// --- Subtitle Management ---
let currentSubtitles = [];       // English/Main
let currentArabicSubtitles = []; // Arabic
let isSubtitlesLoaded = false;

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

// Fetch word definition from backend and external dictionary
async function getWordDefinition(word, contextSentence = '') {
    const cacheKey = `${word.toLowerCase()}:${contextSentence}`;

    if (dictionaryCache[cacheKey]) {
        return dictionaryCache[cacheKey];
    }

    try {
        // 1. Fetch translations from our backend using context if available
        const translateResponse = await contentApiService.translate(word, contextSentence, 'en').catch(() => []);
        const translations = Array.isArray(translateResponse) ? translateResponse : (translateResponse.translation ? [translateResponse.translation] : [word]);

        // 2. Fetch extra details from Free Dictionary API
        let extraDetails = {
            definition: 'Definition not found.',
            synonyms: '-',
            context: contextSentence, // Default to our captured context
            slang: 'Word'
        };

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

        const wordData = {
            slang: extraDetails.slang,
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

// Callback to trigger subtitle UI refresh from any video overlay
let ejoyForceUpdateCallback = null;

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
        overlay.innerHTML = `
      <div class="ejoy-subtitle-box ejoy-en-box">
        <div class="ejoy-subtitle-original"></div>
      </div>
      <div class="ejoy-subtitle-box ejoy-ar-box">
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
        // Adaptive Offset: 1.5s for YouTube, 0.1s for other platforms
        const OFFSET = window.location.href.includes('youtube.com') ? 1.5 : 0.1;
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

            // --- 2. Lookup Arabic ---
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
            if (displayEn || displayAr) {
                overlay.style.opacity = "1";

                // English Box
                if (displayEn) {
                    if (originalEl.dataset.currentText !== displayEn.text) {
                        originalEl.innerHTML = '';
                        const tokens = displayEn.text.match(/[\p{L}\p{N}'’]+|[^\p{L}\p{N}\s]+|\s+/gu) || [];
                        tokens.forEach(token => {
                            if (/[\p{L}\p{N}'’]+/u.test(token)) {
                                const span = document.createElement('span');
                                span.className = 'ejoy-word-span';
                                span.textContent = token;
                                span.addEventListener('mouseenter', () => {
                                    if (!video.paused) { isHoverPaused = true; video.pause(); }
                                    currentVideoElement = video;
                                });
                                span.addEventListener('mouseleave', () => {
                                    if (isHoverPaused && !wasManuallyPaused && !activePopup) { video.play(); isHoverPaused = false; }
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
                } else {
                    originalEl.textContent = "";
                    originalEl.dataset.currentText = "";
                }

                // Arabic Box
                if (displayAr) {
                    overlay.querySelector('.ejoy-ar-box').style.display = 'block';
                    if (translatedEl.dataset.currentTranslation !== displayAr.text) {
                        translatedEl.textContent = displayAr.text;
                        translatedEl.dataset.currentTranslation = displayAr.text;
                    }
                } else {
                    translatedEl.textContent = "";
                    translatedEl.dataset.currentTranslation = "";
                    overlay.querySelector('.ejoy-ar-box').style.display = 'none';
                }
            } else {
                originalEl.textContent = "";
                originalEl.dataset.currentText = "";
                translatedEl.textContent = "";
                translatedEl.dataset.currentTranslation = "";
                overlay.style.opacity = "0";
                overlay.querySelector('.ejoy-ar-box').style.display = 'none';
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

        // Keep timeupdate as a fallback or for seeking
        video.addEventListener('timeupdate', () => {
            if (!isSubtitlesLoaded || currentSubtitles.length === 0) {
                parseTextTracks(video);
            }
            // If the loop isn't running (e.g. paused), force an update once
            if (video.paused) {
                updateSubtitles();
            }
        });
    });
}

const observer = new MutationObserver((mutations) => {
    initVideoOverlay();
});
observer.observe(document.body, { childList: true, subtree: true });
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

    popup.innerHTML = `
    ${getHeaderHtml()}
    <div style="padding: 20px; text-align: center;">
      <div style="color: #666;">Loading translation...</div>
    </div>
  `;

    document.body.appendChild(popup);
    activePopup = popup;

    setupPopupEvents(popup);

    let wordData, userLists, currentUser;
    try {
        [wordData, userLists, currentUser] = await Promise.all([
            getWordDefinition(text, contextSentence),
            contentApiService.getLists().catch(e => []),
            contentApiService.getCurrentUser().catch(e => null)
        ]);
    } catch (e) {
        console.error("Error fetching data", e);
        wordData = await getWordDefinition(text, contextSentence);
        userLists = [];
    }

    let selectedTranslation = wordData.translation;
    let saveMode = 'both';

    popup.innerHTML = `
    ${getHeaderHtml(currentUser)}
    
    <div class="ejoy-tabs-nav">
      <button class="ejoy-tab-btn active" data-tab="translation">Translation</button>
      <button class="ejoy-tab-btn" data-tab="synonyms">Synonyms</button>
      <button class="ejoy-tab-btn" data-tab="examples">Examples</button>
      <button class="ejoy-tab-btn" data-tab="definition">Definition</button>
      <button class="ejoy-tab-btn" data-tab="slang">Slang</button>
    </div>

    <div class="ejoy-tab-content">
      <div class="ejoy-tab-pane active" id="tab-translation">
        <div class="ejoy-translation-list">
            ${Array.isArray(wordData.translations) ? wordData.translations.map((t, i) => `<div class="ejoy-main-translation ${i === 0 ? 'selected' : ''}" data-index="${i}">${t}</div>`).join('') : `<div class="ejoy-main-translation selected" data-index="0">${wordData.translation}</div>`}
        </div>
      </div>

      <div class="ejoy-tab-pane" id="tab-synonyms">
        <div class="ejoy-text-content">${wordData.synonyms || 'No synonyms found.'}</div>
      </div>

      <div class="ejoy-tab-pane" id="tab-examples">
        <div class="ejoy-context-box">"${wordData.context || 'No examples available.'}"</div>
      </div>

      <div class="ejoy-tab-pane" id="tab-definition">
        <div class="ejoy-text-content">${wordData.definition || 'No definition found.'}</div>
      </div>

      <div class="ejoy-tab-pane" id="tab-slang">
        <div class="ejoy-text-content">${wordData.slang || 'N/A'}</div>
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
                    <input type="radio" name="save-mode"> Save with Video only
                </div>
            </div>
        </div>
    </div>
  `;

    const listSelectEl = popup.querySelector('#ejoy-list-select');
    const targetListLabels = popup.querySelectorAll('.ejoy-target-list');
    if (listSelectEl) {
        listSelectEl.addEventListener('change', () => {
            const selectedName = listSelectEl.options[listSelectEl.selectedIndex].text;
            targetListLabels.forEach(label => label.textContent = selectedName);
        });
    }

    const translationItems = popup.querySelectorAll('.ejoy-main-translation');
    translationItems.forEach(item => {
        item.addEventListener('click', () => {
            translationItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedTranslation = item.textContent.trim();
        });
    });

    const logoutBtn = popup.querySelector('#ejoy-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await contentApiService.logout();
            showPopup(x, y, text);
        });
    }

    const dropdownArrow = popup.querySelector('.ejoy-add-btn-arrow');
    const dropdownMenu = popup.querySelector('.ejoy-dropdown-menu');
    const dropdownItems = popup.querySelectorAll('.ejoy-dropdown-item');
    const listArea = popup.querySelector('#ejoy-list-area');

    dropdownArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (dropdownMenu && !dropdownMenu.contains(e.target)) {
            dropdownMenu.classList.remove('active');
        }
    });

    dropdownItems.forEach(item => {
        item.addEventListener('click', (e) => {
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

    const tabsButtons = popup.querySelectorAll('.ejoy-tab-btn');
    tabsButtons.forEach(tab => {
        tab.addEventListener('click', (e) => {
            popup.querySelectorAll('.ejoy-tab-btn').forEach(t => t.classList.remove('active'));
            popup.querySelectorAll('.ejoy-tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            popup.querySelector(`#tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    const listSelect = popup.querySelector('#ejoy-list-select');
    const newListBtn = popup.querySelector('#ejoy-new-list-btn');
    const createListForm = popup.querySelector('#ejoy-create-list-form');
    const saveListBtn = popup.querySelector('#ejoy-save-list-btn');
    const cancelListBtn = popup.querySelector('#ejoy-cancel-list-btn');
    const newListInput = popup.querySelector('#ejoy-new-list-input');

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
            } catch (e) { alert('Failed to create list'); }
        });
    }

    popup.querySelector('.ejoy-add-btn-main').addEventListener('click', async (e) => {
        const btn = e.target;
        const originalText = btn.textContent;
        btn.textContent = "Saving...";
        btn.disabled = true;

        try {
            let videoDetails = null;
            if (saveMode === 'both' || saveMode === 'video') {
                const videoElement = currentVideoElement || document.querySelector('video');
                if (videoElement) {
                    videoDetails = {
                        originalUrl: window.location.href,
                        platform: window.location.href.includes('youtube') ? 'youtube' : 'other',
                        title: document.title
                    };
                }
            }

            const vocabData = {
                word: text,
                selectedTranslate: selectedTranslation,
                language: 'en',
                contextSentence: contextSentence || wordData.context || '',
                timeStamp: (saveMode !== 'list' && currentVideoElement) ? Math.floor(currentVideoElement.currentTime) : 0,
                listId: saveMode === 'video' ? undefined : (listSelect ? parseInt(listSelect.value) : undefined),
                videoDetailes: videoDetails
            };

            await contentApiService.createVocabulary(vocabData);
            btn.textContent = "Saved ✓";
            btn.style.background = "#95a5a6";
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
                btn.style.background = "";
            }, 2000);
        } catch (error) {
            btn.textContent = "Error";
            btn.disabled = false;
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
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

function setupPopupEvents(p) {
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

function parseTextTracks(videoElement) {
    if (!videoElement || !videoElement.textTracks || videoElement.textTracks.length === 0) return;
    let enTrack = null;
    let arTrack = null;
    for (let i = 0; i < videoElement.textTracks.length; i++) {
        const track = videoElement.textTracks[i];
        if (track.language.startsWith('en') || track.label.toLowerCase().includes('english')) {
            enTrack = track;
        } else if (track.language.startsWith('ar') || track.label.toLowerCase().includes('arabic')) {
            arTrack = track;
        }
    }
    if (enTrack) {
        if (enTrack.mode === 'disabled') enTrack.mode = 'hidden';
        setTimeout(() => {
            if (enTrack.cues && enTrack.cues.length > 0 && !isSubtitlesLoaded) {
                const extractedSubs = [];
                for (let i = 0; i < enTrack.cues.length; i++) {
                    const cue = enTrack.cues[i];
                    extractedSubs.push({
                        start: cue.startTime,
                        end: cue.endTime,
                        text: cue.text,
                        translation: "جارٍ جلب الترجمة..."
                    });
                }
                if (arTrack) {
                    if (arTrack.mode === 'disabled') arTrack.mode = 'hidden';
                    setTimeout(() => {
                        if (arTrack.cues && arTrack.cues.length > 0) {
                            extractedSubs.forEach(sub => {
                                const match = Array.from(arTrack.cues).find(ac =>
                                    (ac.startTime >= sub.start && ac.startTime <= sub.end) ||
                                    (ac.endTime >= sub.start && ac.endTime <= sub.end) ||
                                    (sub.start >= ac.startTime && sub.start <= ac.endTime)
                                );
                                if (match) sub.translation = match.text;
                                else sub.translation = "---";
                            });
                        }
                    }, 100);
                }
                currentSubtitles = extractedSubs;
                isSubtitlesLoaded = true;
                console.log("[E-Joy] Step 1: Subtitles loaded from video.textTracks (Faster)");
            }
        }, 100);
    }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'EJOY_SUBTITLE_FOUND') {
        const subUrl = message.payload.url.toLowerCase();
        console.log("[E-Joy] Message Received. URL:", subUrl);
        try {
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
                    console.log("%c[E-Joy] ARABIC Subtitles Loaded ✅", "color: #00ff00; font-weight: bold;");
                    currentArabicSubtitles = parsedNewCues;
                } else {
                    console.log(`[E-Joy] English Subtitles Loaded (${parsedNewCues.length} cues)`);
                    currentSubtitles = parsedNewCues;
                    isSubtitlesLoaded = true;
                }
                console.log("[E-Joy] Step 2: Independent Sync UI Ready.");
                // Trigger update even if video is paused
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

