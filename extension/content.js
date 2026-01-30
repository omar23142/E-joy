// --- Mock Data Service ---
const MOCK_SUBTITLES = [
    { start: 0, end: 5, text: "Welcome to our advanced SQL tutorial.", translation: "أهلاً بكم في درس SQL المتقدم." },
    { start: 5, end: 10, text: "Today we will talk about indexing.", translation: "اليوم سنتحدث عن الفهرسة (Indexing)." },
    { start: 10, end: 15, text: "Indexing helps retrieve data faster.", translation: "تساعد الفهرسة في استرجاع البيانات بشكل أسرع." },
    { start: 15, end: 20, text: "Let's dive into the code.", translation: "دعونا نغوص في الكود." }
];

const MOCK_DICTIONARY = {
    "default": {
        slang: "General",
        translation: "ترجمة",
        definition: "A standard definition for the word you selected.",
        context: "This is a sample context sentence showing how the word is used.",
        synonyms: "example, sample, instance"
    },
    "sql": {
        slang: "Tech Term",
        translation: "إس كيو إل",
        definition: "Structured Query Language: A standard language for storing, manipulating and retrieving data in databases.",
        context: "I wrote a complex SQL query to join three tables.",
        synonyms: "database language, query language"
    },
    "indexing": {
        slang: "CS Concept",
        translation: "الفهرسة",
        definition: "A data structure technique to efficiently retrieve records from the database files based on some attributes.",
        context: "Proper indexing can reduce query time from minutes to milliseconds.",
        synonyms: "cataloging, organizing"
    }
};

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

        // Create Overlay with subtitle box wrapper
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

        // Draggable Subtitle Box
        const subtitleBox = overlay.querySelector('.ejoy-subtitle-box');
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
            const overlayRect = overlay.getBoundingClientRect();
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
                            showPopup(rect.left, rect.bottom + 5, cleanWord);
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

function showPopup(x, y, text, isFullscreen = false) {
    if (activePopup) activePopup.remove();

    const wordData = MOCK_DICTIONARY[text.toLowerCase()] || MOCK_DICTIONARY['default'];

    const popup = document.createElement('div');
    popup.className = 'ejoy-popup-card';

    // Always use fixed positioning since we're using viewport coordinates (getBoundingClientRect)
    popup.style.position = 'fixed';

    let leftPos = x;
    // Keep popup within viewport bounds
    if (leftPos + 320 > window.innerWidth) leftPos = window.innerWidth - 340;
    if (leftPos < 0) leftPos = 10;

    let topPos = y;
    // Ensure popup doesn't go off bottom of screen
    if (topPos + 400 > window.innerHeight) topPos = window.innerHeight - 420;
    if (topPos < 0) topPos = 10;

    popup.style.left = `${leftPos}px`;
    popup.style.top = `${topPos}px`;
    popup.style.zIndex = '2147483647'; // Ensure it's on top

    // Tabbed HTML Structure
    popup.innerHTML = `
    <div class="ejoy-popup-header">
      <div class="ejoy-word-title">${text}</div>
      <div class="ejoy-popup-close">✕</div>
    </div>
    
    <div class="ejoy-tabs-nav">
      <button class="ejoy-tab-btn active" data-tab="translation">Translation</button>
      <button class="ejoy-tab-btn" data-tab="definition">Definition</button>
      <button class="ejoy-tab-btn" data-tab="context">Context</button>
    </div>

    <div class="ejoy-tab-content">
      <!-- Tab 1: Translation -->
      <div class="ejoy-tab-pane active" id="tab-translation">
        <div class="ejoy-main-translation">${wordData.translation}</div>
        <div style="margin-top:10px;">
           <div class="ejoy-label-sm">Type</div>
           <div class="ejoy-text-content">${wordData.slang}</div>
        </div>
        <div style="margin-top:10px;">
           <div class="ejoy-label-sm">Synonyms</div>
           <div class="ejoy-text-content">${wordData.synonyms || '-'}</div>
        </div>
      </div>

      <!-- Tab 2: Definition -->
      <div class="ejoy-tab-pane" id="tab-definition">
        <div class="ejoy-text-content">${wordData.definition}</div>
      </div>

      <!-- Tab 3: Context -->
      <div class="ejoy-tab-pane" id="tab-context">
        <div class="ejoy-context-box">"${wordData.context}"</div>
      </div>
    </div>

    <div class="ejoy-actions">
        <button class="ejoy-add-btn">+ Add to List</button>
    </div>
  `;

    document.body.appendChild(popup);
    activePopup = popup;

    // Event Listeners for Popup elements

    // Popup hover - keep video paused while interacting
    popup.addEventListener('mouseenter', () => {
        if (currentVideoElement) {
            currentVideoElement.pause();
        }
    });

    // Close button - resume video (only if not manually paused)
    popup.querySelector('.ejoy-popup-close').addEventListener('click', () => {
        popup.remove();
        activePopup = null;
        // Resume video when popup closes (only if we paused it, not user)
        if (currentVideoElement && isHoverPaused && !wasManuallyPaused) {
            currentVideoElement.play();
        }
        isHoverPaused = false;
        currentVideoElement = null;
    });

    // Tabs Switching
    const tabs = popup.querySelectorAll('.ejoy-tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove active class from all tabs and panes
            popup.querySelectorAll('.ejoy-tab-btn').forEach(t => t.classList.remove('active'));
            popup.querySelectorAll('.ejoy-tab-pane').forEach(p => p.classList.remove('active'));

            // Activate clicked tab
            e.target.classList.add('active');
            const targetId = `tab-${e.target.dataset.tab}`;
            popup.querySelector(`#${targetId}`).classList.add('active');
        });
    });

    // Add Button
    popup.querySelector('.ejoy-add-btn').addEventListener('click', (e) => {
        const btn = e.target;
        btn.textContent = "Saved ✓";
        btn.style.background = "#95a5a6";
        btn.disabled = true;
        console.log(`Saved word: ${text}`);
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
