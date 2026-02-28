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

// Listen for completed requests (network intercept)
chrome.webRequest.onCompleted.addListener(
    onRequestFinished,
    { urls: ['<all_urls>'] },
    []
);

// Listen for direct fetch requests from content script (Coursera DOM scraping)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EJOY_FETCH_SUBTITLE') {
        const { url, isArabic } = message;
        if (!url) return;

        const videoId = extractVideoId(url) || extractVideoId(sender.tab?.url || '') || 'coursera';
        const key = makeDedupeKey(url);

        if (recentUrlKeys.has(key)) {
            console.log(`[EJOY] Skipping duplicate Coursera fetch: ${key}`);
            return;
        }
        recentUrlKeys.add(key);
        setTimeout(() => recentUrlKeys.delete(key), 10000);

        console.log(`[EJOY] Fetching Coursera ${isArabic ? 'ARABIC' : 'ENGLISH'} VTT:`, url);

        fetch(url)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
            .then(text => {
                if (!text || text.trim().length < 10) return;
                const payload = { url, videoId, text, time: Date.now(), isArabicProbe: isArabic };
                console.log(`[EJOY] ✅ Coursera ${isArabic ? 'ARABIC' : 'ENGLISH'} VTT sent. Size: ${text.length} chars`);
                if (sender.tab && sender.tab.id) {
                    chrome.tabs.sendMessage(sender.tab.id, { type: 'EJOY_SUBTITLE_FOUND', payload });
                }
            })
            .catch(err => console.warn(`[EJOY] Coursera fetch failed: ${err.message}`));
    }

    // NEW: Handle batch translation requests from content script
    if (message.type === 'EJOY_BATCH_TRANSLATE') {
        const { sentences } = message;
        handleBatchTranslation(sentences).then(results => {
            sendResponse({ success: true, translated: results });
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true; // Keep channel open for async response
    }
});

async function handleBatchTranslation(sentences) {
    const CHUNK_SIZE = 50;
    const results = [];
    const GOOGLE_CLIENTS = ['gtx', 'dict-chrome-ex', 'webapp'];
    let currentClientIndex = 0;

    for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
        // Add a healthy delay between chunks for long videos to avoid Google 429
        if (i > 0) await new Promise(r => setTimeout(r, 800));

        const chunk = sentences.slice(i, i + CHUNK_SIZE);
        const joined = chunk.join('\n');
        let success = false;

        // Try alternating Google clients to bypass rate-limiting
        for (let attempt = 0; attempt < GOOGLE_CLIENTS.length; attempt++) {
            try {
                const client = GOOGLE_CLIENTS[currentClientIndex];
                const url = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=en&tl=ar&dt=t&q=${encodeURIComponent(joined)}`;
                const res = await fetch(url);

                if (!res.ok) {
                    if (res.status === 429) {
                        console.warn(`[EJOY] Rate limit hit on client '${client}', switching API...`);
                        currentClientIndex = (currentClientIndex + 1) % GOOGLE_CLIENTS.length;
                        await new Promise(r => setTimeout(r, 2000)); // Chill out before retrying
                        throw new Error(`Rate limit`);
                    }
                    throw new Error(`Google HTTP ${res.status}`);
                }

                const data = await res.json();
                const translatedJoined = data[0].map(item => item[0] || '').join('');
                const translatedLines = translatedJoined.split(/\r?\n/);

                chunk.forEach((original, idx) => {
                    results.push({ original, translation: translatedLines[idx]?.trim() || original });
                });

                success = true;
                break; // Break the fallback loop if successful

            } catch (err) {
                console.warn(`[EJOY] Translation attempt ${attempt + 1} failed:`, err.message);
            }
        }

        // If ALL bypasses fail (extremely rare), fallback to original English to keep video playing
        if (!success) {
            console.error('[EJOY] All Google API endpoints failed. Using original text as fallback.');
            chunk.forEach(s => results.push({ original: s, translation: s }));
        }
    }
    return results;
}
