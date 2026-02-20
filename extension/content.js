// --- Mock Data Service ---
const MOCK_SUBTITLES = [
    { start: 0, end: 5, text: "Welcome to our advanced SQL tutorial.", translation: "أهلاً بكم في درس SQL المتقدم." },
    { start: 5, end: 10, text: "Today we will talk about indexing.", translation: "اليوم سنتحدث عن الفهرسة (Indexing)." },
    { start: 10, end: 15, text: "Indexing helps retrieve data faster.", translation: "تساعد الفهرسة في استرجاع البيانات بشكل أسرع." },
    { start: 15, end: 20, text: "Let's dive into the code.", translation: "دعونا نغوص في الكود." }
];

// Dictionary cache to avoid repeated API calls for same word
const dictionaryCache = {};

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

// --- Video Overlay Logic ---
let currentVideoElement = null; // Track the current video for popup pause
let wasManuallyPaused = false; // Track if user manually paused the video
let isHoverPaused = false; // Track if paused due to hover/popup
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
      <div class="ejoy-subtitle-box">
        <div class="ejoy-subtitle-original"></div>
        <div class="ejoy-subtitle-translated"></div>
      </div>
    `;

        // Initial parenting
        let parent = video.parentElement || document.body;
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        parent.appendChild(overlay);

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
                if (getComputedStyle(originalParent).position === 'static') originalParent.style.position = 'relative';
                originalParent.appendChild(overlay);
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

        video.addEventListener('play', () => {
            wasManuallyPaused = false;
            isHoverPaused = false;
        });

        // Subtitle visibility (simplified, always show both)
        const subtitleOriginal = overlay.querySelector('.ejoy-subtitle-original');
        const subtitleTranslated = overlay.querySelector('.ejoy-subtitle-translated');
        const subtitleBox = overlay.querySelector('.ejoy-subtitle-box');

        // Draggable Subtitle Box
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let customPosition = null; // Store custom position

        subtitleBox.addEventListener('mousedown', (e) => {
            // Only start drag if clicking on the box background, not on words
            if (e.target.classList.contains('ejoy-word-span')) return;

            isDragging = true;
            subtitleBox.classList.add('dragging');

            // Calculate offset from mouse to box top-left
            const rect = subtitleBox.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;

            e.preventDefault(); // Prevent text selection
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const overlayRect = overlay.getBoundingClientRect();

            // Calculate new position relative to overlay
            let newLeft = e.clientX - overlayRect.left - dragOffsetX;
            let newTop = e.clientY - overlayRect.top - dragOffsetY;

            // Constrain within overlay bounds
            const boxRect = subtitleBox.getBoundingClientRect();
            newLeft = Math.max(0, Math.min(newLeft, overlayRect.width - boxRect.width));
            newTop = Math.max(0, Math.min(newTop, overlayRect.height - boxRect.height));

            // Apply custom position
            customPosition = { left: newLeft, top: newTop };
            subtitleBox.style.position = 'absolute';
            subtitleBox.style.left = `${newLeft}px`;
            subtitleBox.style.top = `${newTop}px`;
            subtitleBox.style.transform = 'none'; // Override any centering
            subtitleBox.style.margin = '0'; // Remove margin
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                subtitleBox.classList.remove('dragging');
            }
        });

        // Subtitle Logic
        video.addEventListener('timeupdate', () => {
            const currentTime = video.currentTime;
            const sub = MOCK_SUBTITLES.find(s => currentTime >= s.start && currentTime < s.end);

            const originalEl = overlay.querySelector('.ejoy-subtitle-original');
            const translatedEl = overlay.querySelector('.ejoy-subtitle-translated');

            if (sub) {
                overlay.style.opacity = "1";

                if (originalEl.dataset.currentText !== sub.text) {
                    originalEl.innerHTML = '';
                    sub.text.split(' ').forEach(word => {
                        const span = document.createElement('span');
                        span.className = 'ejoy-word-span';
                        span.textContent = word + ' ';

                        // Hover -> Pause (only if video was playing)
                        span.addEventListener('mouseenter', () => {
                            if (!video.paused) {
                                isHoverPaused = true;
                                video.pause();
                            }
                            currentVideoElement = video; // Track current video
                        });

                        // Mouse Leave -> Resume (only if we paused it, not manually paused)
                        span.addEventListener('mouseleave', () => {
                            if (isHoverPaused && !wasManuallyPaused && !activePopup) {
                                video.play();
                                isHoverPaused = false;
                            }
                        });

                        // Click -> Popup
                        span.addEventListener('click', (e) => {
                            e.stopPropagation();
                            // Keep video paused while popup is open
                            isHoverPaused = true;
                            video.pause();
                            currentVideoElement = video; // Track for popup interaction

                            const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
                            const rect = span.getBoundingClientRect();

                            // Position popup below the word using viewport coordinates
                            // PASS SUBTITLE TEXT AS CONTEXT
                            showPopup(rect.left, rect.bottom + 5, cleanWord, sub.text);
                        });

                        originalEl.appendChild(span);
                    });
                    originalEl.dataset.currentText = sub.text;
                    translatedEl.textContent = sub.translation;
                }
            } else {
                originalEl.textContent = "";
                originalEl.dataset.currentText = "";
                translatedEl.textContent = "";
                overlay.style.opacity = "0";
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

    // Show loading popup first
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

    // Header helper
    const getHeaderHtml = (user = null) => `
    <div class="ejoy-popup-header">
      <div style="display:flex; flex-direction:column;">
        <div class="ejoy-word-title">${text}</div>
        ${user ? `<div class="ejoy-user-info">Hi, ${user.userName || user.email.split('@')[0]} | <span class="ejoy-logout-link" id="ejoy-logout">Logout</span></div>` : ''}
      </div>
      <div class="ejoy-popup-close">✕</div>
    </div>
    `;

    // 1. Check Authentication first
    const token = contentApiService.getToken();
    if (!token) {
        showAuthForm(popup, text, getHeaderHtml);
        document.body.appendChild(popup);
        activePopup = popup;
        return;
    }

    // Show loading state
    popup.innerHTML = `
    ${getHeaderHtml()}
    <div style="padding: 20px; text-align: center;">
      <div style="color: #666;">Loading translation...</div>
    </div>
  `;

    document.body.appendChild(popup);
    activePopup = popup;

    setupPopupEvents(popup);

    // Fetch word data and lists
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

    // Default selected translation
    let selectedTranslation = wordData.translation;

    // Default Save Mode: 'both' (List & Video)
    let saveMode = 'both';

    // Update popup with actual content
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

        <!-- NEW Unified Split Button -->
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

    // Sync dropdown text when list changes
    const listSelectEl = popup.querySelector('#ejoy-list-select');
    const targetListLabels = popup.querySelectorAll('.ejoy-target-list');
    if (listSelectEl) {
        listSelectEl.addEventListener('change', () => {
            const selectedName = listSelectEl.options[listSelectEl.selectedIndex].text;
            targetListLabels.forEach(label => label.textContent = selectedName);
        });
    }

    // Translation Selection Logic
    const translationItems = popup.querySelectorAll('.ejoy-main-translation');
    translationItems.forEach(item => {
        item.addEventListener('click', () => {
            translationItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedTranslation = item.textContent.trim();
        });
    });

    // Logout Listener
    const logoutBtn = popup.querySelector('#ejoy-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await contentApiService.logout();
            showPopup(x, y, text); // Re-render to show login
        });
    }

    // Dropdown Logic
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

            // Update UI based on mode
            if (saveMode === 'video') {
                listArea.style.opacity = '0.5';
                listArea.style.pointerEvents = 'none';
            } else {
                listArea.style.opacity = '1';
                listArea.style.pointerEvents = 'auto';
            }
        });
    });


    // Tabs Switching
    const tabs = popup.querySelectorAll('.ejoy-tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            popup.querySelectorAll('.ejoy-tab-btn').forEach(t => t.classList.remove('active'));
            popup.querySelectorAll('.ejoy-tab-pane').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            popup.querySelector(`#tab-${e.target.dataset.tab}`).classList.add('active');
        });
    });

    // List Management & Add Button
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
                // If it's video only, we might want to let backend handle list? 
                // In your backend, listId is used to findOne. 
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
                // Succession: Re-run showPopup
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

// Helper for Draggable Popups (Uses Event Delegation)
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

        // Prevent selection
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

    // Use delegation for all clicks and drags
    p.addEventListener('mousedown', (e) => {
        const header = e.target.closest('.ejoy-popup-header');
        if (!header) return;

        // Interactive elements inside header should not start a drag
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
        // Close Button
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

        // Logout Link
        const logoutBtn = e.target.closest('#ejoy-logout');
        if (logoutBtn) {
            e.stopPropagation();
            await contentApiService.logout();
            p.remove();
            activePopup = null;
            return;
        }
    });
}

// Plain Text Selection Listener
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
        // Resume video when popup closes (only if we paused it, not user)
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
        showBubblePopup(x, y, text); // Reuse or adapt logic ?? Using showPopup is fine
        bubble.remove();
        activeBubble = null;
    });
}

// Helper wrapper to ensure signature matches
function showBubblePopup(x, y, text) {
    showPopup(x, y, text);
}
