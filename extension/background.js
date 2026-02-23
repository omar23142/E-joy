// Network interceptor for subtitle files (MV3 service worker)

const SUBTITLE_EXTENSIONS = ['.vtt', '.srt', '.ttml', '.dfxp', '.xml'];

// Key = "videoId:lang" to allow both English AND Arabic for the same video
let recentUrlKeys = new Set();

function makeDedupeKey(urlString) {
    try {
        const u = new URL(urlString);
        const v = u.searchParams.get('v') || u.pathname;
        const lang = u.searchParams.get('lang') || 'unknown';
        const tlang = u.searchParams.get('tlang') || '';
        return `${v}:${lang}:${tlang}`;
    } catch {
        return urlString.split('?')[0];
    }
}

function isSubtitleUrl(url) {
    const lower = url.toLowerCase();
    if (SUBTITLE_EXTENSIONS.some(ext => lower.includes(ext))) return true;
    if (lower.includes('youtube.com/api/timedtext')) {
        // Only capture English and Arabic tracks
        const hasEn = lower.includes('lang=en');
        const hasAr = lower.includes('lang=ar');
        if (!hasEn && !hasAr) return false;

        // If a tlang is specified, it must be 'ar' or 'en' (ignore Vietnamese, etc.)
        const tlangMatch = lower.match(/[?&]tlang=([^&]+)/);
        if (tlangMatch) {
            const tlang = tlangMatch[1];
            if (tlang !== 'ar' && tlang !== 'en') return false; // Skip e.g. tlang=vi
        }

        return true;
    }
    const subtitleKeywords = ['subtitle', 'transcript', 'caption', 'cc', 'sub'];
    if (lower.includes('.json') && !lower.includes('subscribe')) {
        if (subtitleKeywords.some(kw => lower.includes(kw))) return true;
    }
    return false;
}

function extractVideoId(urlString) {
    try {
        const url = new URL(urlString);
        const v = url.searchParams.get('v');
        if (v) return v;
        if (url.hostname.includes('youtu.be')) return url.pathname.replace('/', '');
        return null;
    } catch {
        return null;
    }
}

function fetchAndSend(targetUrl, videoId, isArabicProbe = false) {
    const key = makeDedupeKey(targetUrl);
    if (recentUrlKeys.has(key)) {
        console.log(`[EJOY] Skipping duplicate: ${key}`);
        return;
    }
    recentUrlKeys.add(key);
    setTimeout(() => recentUrlKeys.delete(key), 10000);

    console.log(`[EJOY] Fetching ${isArabicProbe ? 'ARABIC (probe)' : 'ENGLISH'} subtitle:`, targetUrl);

    fetch(targetUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
        })
        .then(text => {
            if (!text || text.trim().length < 10) {
                console.warn(`[EJOY] Empty or tiny response for ${isArabicProbe ? 'Arabic' : 'English'} subtitle.`);
                return;
            }

            const payload = {
                url: targetUrl,
                videoId: videoId || null,
                text: text,
                time: Date.now(),
                isArabicProbe
            };

            console.log(`[EJOY] ✅ Sending ${isArabicProbe ? 'ARABIC' : 'ENGLISH'} subtitle to Content Script. Size: ${text.length} chars`);

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs && tabs[0];
                if (!tab || !tab.id) return;
                chrome.tabs.sendMessage(tab.id, { type: 'EJOY_SUBTITLE_FOUND', payload });
            });
        })
        .catch(err => {
            if (isArabicProbe) {
                console.log(`[EJOY] Arabic probe failed (normal if site has no Arabic): ${err.message}`);
            } else {
                console.error('[EJOY] Subtitle fetch failed:', err.message);
            }
        });
}

function onRequestFinished(details) {
    const url = details.url;
    if (!isSubtitleUrl(url)) return;

    const videoId = extractVideoId(details.initiator || '') || extractVideoId(url);

    // Parse URL params for smart routing
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return; }

    const lang = parsedUrl.searchParams.get('lang') || '';
    const tlang = parsedUrl.searchParams.get('tlang') || '';

    if (lang === 'en' && tlang === 'ar') {
        // Case A: YouTube is sending auto-translated Arabic (lang=en&tlang=ar)
        // Step 1: Fetch this URL as-is → it gives Arabic content for the bottom box
        console.log('[EJOY] Detected lang=en&tlang=ar — fetching as Arabic + probing pure English');
        fetchAndSend(url, videoId, true); // isArabicProbe=true so content.js treats it as Arabic

        // Step 2: Fetch the same URL WITHOUT tlang to get pure English for the top box
        const englishUrl = url.replace('&tlang=ar', '').replace('?tlang=ar&', '?');
        fetchAndSend(englishUrl, videoId, false); // isArabicProbe=false → English

    } else if (lang === 'en') {
        // Case B: Pure English URL (no tlang or tlang=en)
        // Step 1: Fetch as English
        fetchAndSend(url, videoId, false);

        // Step 2: Probe for Arabic by replacing lang=en with lang=ar
        const arabicUrl = url.replace('lang=en', 'lang=ar');
        if (arabicUrl !== url) {
            console.log('[EJOY] Probing for Arabic equivalent from English URL...');
            fetchAndSend(arabicUrl, videoId, true);
        }

    } else if (lang === 'ar') {
        // Case C: Direct Arabic URL
        fetchAndSend(url, videoId, true);

    } else {
        // Case D: Other formats (.vtt, .srt, etc.) — try as English first
        fetchAndSend(url, videoId, false);

        // Try generic Arabic probe patterns
        let arabicUrl = null;
        if (url.includes('/en/') || url.includes('/en.')) {
            arabicUrl = url.replace('/en/', '/ar/').replace('/en.', '/ar.');
        } else if (url.includes('_en.')) {
            arabicUrl = url.replace('_en.', '_ar.');
        }
        if (arabicUrl && arabicUrl !== url) fetchAndSend(arabicUrl, videoId, true);
    }
}

// Listen for completed requests
chrome.webRequest.onCompleted.addListener(
    onRequestFinished,
    { urls: ['<all_urls>'] },
    []
);
