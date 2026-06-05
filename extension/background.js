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

function fetchAndSend(targetUrl, videoId, isArabicProbe = false, senderTabId = null) {
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

            // If we know the exact tab (from content.js message), send directly
            if (senderTabId) {
                chrome.tabs.sendMessage(senderTabId, { type: 'EJOY_SUBTITLE_FOUND', payload });
                return;
            }

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

// Smart Arabic URL derivation — tries multiple patterns to find Arabic subtitle from English URL
function probeArabicVariants(url, videoId, senderTabId = null) {
    const lower = url.toLowerCase();
    const probeUrls = new Set();

    // --- YouTube: auto-translate via tlang=ar ---
    if (lower.includes('timedtext') || lower.includes('youtube.com') || lower.includes('googleapis.com')) {
        // Add tlang=ar for YouTube auto-translated Arabic (most reliable for YouTube)
        if (/[\?&]lang=en/i.test(url) && !/[\?&]tlang=/i.test(url)) {
            const separator = url.includes('?') ? '&' : '?';
            probeUrls.add(url + separator + 'tlang=ar');
        }
        // Also try native Arabic track (lang=ar)
        if (/[\?&]lang=en/i.test(url)) {
            probeUrls.add(url.replace(/([?&])lang=en/i, '$1lang=ar'));
        }
    }

    // --- VTT / Generic file path patterns ---
    // /en/ → /ar/
    if (/\/en\//i.test(url)) probeUrls.add(url.replace(/\/en\//i, '/ar/'));
    // /en. → /ar. (e.g. /en.vtt)
    if (/\/en\./i.test(url)) probeUrls.add(url.replace(/\/en\./i, '/ar.'));
    // _en. → _ar. (e.g. subtitle_en.vtt)
    if (/_en\./i.test(url)) probeUrls.add(url.replace(/_en\./i, '_ar.'));
    // -en. → -ar. (e.g. subtitle-en.vtt)
    if (/-en\./i.test(url)) probeUrls.add(url.replace(/-en\./i, '-ar.'));
    // .en. → .ar. (e.g. subtitle.en.vtt)
    if (/\.en\./i.test(url)) probeUrls.add(url.replace(/\.en\./i, '.ar.'));
    // en.vtt → ar.vtt (end of filename before query)
    if (/en\.vtt/i.test(url)) probeUrls.add(url.replace(/en\.vtt/i, 'ar.vtt'));
    // en.srt → ar.srt
    if (/en\.srt/i.test(url)) probeUrls.add(url.replace(/en\.srt/i, 'ar.srt'));

    // --- Query parameter patterns ---
    if (/[\?&]language=en/i.test(url)) probeUrls.add(url.replace(/language=en/i, 'language=ar'));
    if (/[\?&]lng=en/i.test(url)) probeUrls.add(url.replace(/lng=en/i, 'lng=ar'));
    if (/[\?&]locale=en/i.test(url)) probeUrls.add(url.replace(/locale=en/i, 'locale=ar'));
    if (/[\?&]lang=en/i.test(url) && !lower.includes('timedtext')) {
        probeUrls.add(url.replace(/lang=en/i, 'lang=ar'));
    }
    // subtitleLanguage or subLang patterns
    if (/[\?&]subtitleLanguage=en/i.test(url)) probeUrls.add(url.replace(/subtitleLanguage=en/i, 'subtitleLanguage=ar'));
    if (/[\?&]subLang=en/i.test(url)) probeUrls.add(url.replace(/subLang=en/i, 'subLang=ar'));

    // Remove original URL from probes
    probeUrls.delete(url);

    if (probeUrls.size > 0) {
        console.log(`[EJOY] 🔍 Probing ${probeUrls.size} Arabic variant(s) for:`, url);
        probeUrls.forEach(probeUrl => {
            console.log('[EJOY] 🔍 → Trying:', probeUrl);
            fetchAndSend(probeUrl, videoId, true, senderTabId);
        });
    } else {
        console.log('[EJOY] No Arabic URL variants could be derived from:', url);
    }

    return probeUrls.size;
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

        // Step 2: Smart probe for Arabic (native + auto-translate + VTT patterns)
        console.log('[EJOY] Case B: English detected — probing all Arabic variants...');
        probeArabicVariants(url, videoId);

    } else if (lang === 'ar') {
        // Case C: Direct Arabic URL
        fetchAndSend(url, videoId, true);

    } else {
        // Case D: Other formats (.vtt, .srt, etc.) — try as English first
        fetchAndSend(url, videoId, false);

        // Smart probe for Arabic using all known patterns
        console.log('[EJOY] Case D: Generic subtitle — probing Arabic variants...');
        probeArabicVariants(url, videoId);
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

        // If we just fetched English, also probe for Arabic automatically
        if (!isArabic) {
            console.log('[EJOY] Coursera English received — probing Arabic variants...');
            const tabId = sender.tab?.id || null;
            probeArabicVariants(url, videoId, tabId);
        }
    }

    // Handle Arabic probe requests from content.js
    if (message.type === 'EJOY_PROBE_ARABIC') {
        const { url } = message;
        if (!url) return;
        const videoId = extractVideoId(url) || extractVideoId(sender.tab?.url || '') || 'probe';
        const tabId = sender.tab?.id || null;
        console.log('[EJOY] 📩 Content.js requested Arabic probe for:', url);
        probeArabicVariants(url, videoId, tabId);
    }

    // Handle batch translation requests from content script
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
