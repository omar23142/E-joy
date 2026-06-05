# E-Joy Chrome Extension — Agent Knowledge Base

## Git: go back to old commit
```
git log --oneline          # find commit hash
git log main --oneline     # find commit hash
git checkout -b old-state <hash>  # safe: new branch at old state
```

---

## Project Overview
**E-Joy** is a Chrome Extension + NestJS backend for Arabic/English language learners.
It overlays dual subtitles (English + Arabic) on video platforms and allows users to click words to get translations, save vocabulary, and manage lists.

---

## Architecture

### Extension (`/extension/`)
| File | Role |
|------|------|
| `content.js` | Main logic: subtitle sync, word popup, drag, UI overlay |
| `background.js` | Service worker: network interceptor, batch translation via Google Translate |
| `api-service.js` | Centralized API calls to NestJS backend |
| `config.js` | API base URL + storage keys |
| `content.css` | Subtitle box + popup card styles |
| `manifest.json` | Chrome extension config |

### Backend (`/src/`)
| Module | Role |
|--------|------|
| `translate/` | Word translation via local DB + MyMemory API |
| `vocabulary/` | User vocab entries (word, translation, timestamp, video link) |
| `lists/` | User vocab lists management |
| `users/` | Auth, JWT, user profiles |
| `dictionary/` | Local English-Arabic dictionary DB |

---

## Key Subtitle Flow

### How subtitles are loaded (YouTube):
1. `background.js` intercepts network requests via `chrome.webRequest.onCompleted`
2. Detects subtitle URLs (`/api/timedtext`, `.vtt`, `.json`)
3. Fetches English (`lang=en`) and probes for Arabic (`lang=ar` or `tlang=ar`)
4. Sends to `content.js` via `chrome.tabs.sendMessage` as `EJOY_SUBTITLE_FOUND`
5. `content.js` parses the content:
   - JSON → `parseYouTubeJSON()`
   - VTT → `parseVTT()`
6. If no Arabic track found → `batchTranslateSubtitles()` calls background for Google Translate

### How subtitle timing works in `content.js`:
- `updateSubtitles()` runs on every `requestAnimationFrame`
- Uses `video.currentTime + OFFSET` where:
  ```js
  const OFFSET = window.location.href.includes('youtube.com') ? 1.5 : 0.1;
  ```
- Searches `currentSubtitles[]` and `currentArabicSubtitles[]` independently
- Both EN and AR use **the same OFFSET** — this is the root of the Arabic delay issue

### Arabic subtitle sources (in priority):
1. Direct `lang=ar` URL from YouTube (native Arabic)
2. `lang=en&tlang=ar` (YouTube machine translation)
3. `arTrack` from `textTracks` (Coursera etc.)
4. `batchTranslateSubtitles()` → Google Translate API (fallback)

---

## Known Issues / TODOs
- **Arabic subtitle timing lag**: Arabic subtitles appear late relative to English. Both use the same OFFSET (1.5s on YouTube), but Arabic translated cues (via `batchTranslateSubtitles` or `tlang=ar`) may have different timing structure than English cues. See section below.

---

## Tech Stack
- **Frontend**: Vanilla JS, CSS3, HTML5 (Chrome Extension MV3)
- **Backend**: NestJS, TypeScript, TypeORM, PostgreSQL
- **External APIs**: Google Translate (`translate.googleapis.com`), MyMemory, Free Dictionary API

---

## Run Commands
```bash
# Backend
npm install
npm run start:dev

# Extension: Load unpacked in chrome://extensions/ from /extension/ folder
```
