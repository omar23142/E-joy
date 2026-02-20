# EJOY Clone Project

This project is a Chrome extension integrated with a NestJS backend, designed for language learners (specifically English to Arabic) to translate and save vocabulary while watching videos.

## Project Architecture

### 1. Chrome Extension (Frontend)
Located in the `extension/` directory.
- **`manifest.json`**: Configuration file for the extension.
- **`content.js`**: Main content script injected into video pages (YouTube, etc.). Handles video interaction, dual subtitle overlay, and the interactive word-click popup.
- **`content.css`**: Styles for the subtitle box, word spans, and the interactive popup card.
- **`api-service.js`**: A centralized service for communication with the NestJS backend.
- **`config.js`**: Environment configuration (API base URL, storage keys).

#### Key Features:
- **Dual Subtitles**: Integrated overlay for video players.
- **Interactive Popup**: Word definition, multi-translation selection, and advanced data (Synonyms, Examples, Definitions) fetched from the `Free Dictionary API`.
- **Integrated Auth**: Login and Signup forms directly within the popup.
- **Unified Save Button**: A split-button with a dropdown for choosing save destinations (List + Video, List Only, Video Only).

### 2. NestJS Backend (Backend)
Located in the `src/` directory.
- **`src/translate/`**: Handles word translation using a combination of local database matches and external APIs (MyMemory).
- **`src/vocabulary/`**: Manages user vocabulary entries, including audio, examples, and video associations.
- **`src/lists/`**: Manages user-created vocabulary lists.
- **`src/users/`**: Handles authentication, user profiles, and JWT-based security.
- **`src/dictionary/`**: Provides access to a specialized dictionary database.

#### Core Logic:
- **Context-Aware Translation**: Uses MD5 hashing of context sentences to provide specific translations for words based on their usage.
- **Automatic List/Video Registration**: Automatically creates or links lists and videos during the vocabulary creation process if they don't already exist.

## Tech Stack
- **Frontend**: Vanilla JavaScript, CSS3, HTML5 (Chrome Extension).
- **Backend**: NestJS (TypeScript), TypeORM, PostgreSQL.
- **External APIs**: MyMemory (Translation), Free Dictionary API (Definitions/Synonyms).

## How to Run

### Backend
1. Ensure PostgreSQL is running.
2. Run `npm install`.
3. Start the dev server: `npm run start:dev`.

### Extension
1. Open Chrome and go to `chrome://extensions/`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `extension/` folder.
4. Ensure the `API_BASE_URL` in `extension/config.js` points to your running backend.

## Advanced Vocabulary Logic
- **Context Hashing**: The property `contextSentenceHashed` is used to match words in specific sentences.
- **Split Pointers**: Vocabulary entries can point to both a `List` and a `Video`, or just one of them, depending on the user's choosing in the extension.
