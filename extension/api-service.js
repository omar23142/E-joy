// API Service for E-Joy Backend Communication

class ApiService {
    constructor() {
        this.baseURL = CONFIG.API_BASE_URL;
        this.token = null;
    }

    // Initialize token from storage
    async init() {
        return new Promise((resolve) => {
            chrome.storage.local.get([CONFIG.TOKEN_STORAGE_KEY], (result) => {
                this.token = result[CONFIG.TOKEN_STORAGE_KEY] || null;
                resolve();
            });
        });
    }

    // Store authentication token
    async setToken(token) {
        this.token = token;
        return new Promise((resolve) => {
            chrome.storage.local.set({ [CONFIG.TOKEN_STORAGE_KEY]: token }, () => {
                resolve();
            });
        });
    }

    // Remove authentication token
    async clearToken() {
        this.token = null;
        return new Promise((resolve) => {
            chrome.storage.local.remove([CONFIG.TOKEN_STORAGE_KEY, CONFIG.USER_STORAGE_KEY], () => {
                resolve();
            });
        });
    }

    // Get current token
    getToken() {
        return this.token;
    }

    // Helper method for API requests
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        // Add authorization header if token exists
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const config = {
            ...options,
            headers,
        };

        try {
            const response = await fetch(url, config);
            const contentType = response.headers.get("content-type");
            let data;
            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                throw new Error(data.message || data || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Authentication APIs
    async signup(userData) {
        const response = await this.request('/api/v1/users/auth/signup', {
            method: 'POST',
            body: JSON.stringify(userData),
        });

        // Note: signup requires email verification
        // No token is provided until email is verified
        // Response will contain { newUser, message }
        return response;
    }

    async signin(email, password) {
        const response = await this.request('/api/v1/users/auth/signin', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });

        // Check if email verification is required
        if (response.message) {
            // Email not verified - throw error with message
            throw new Error(response.message);
        }

        // Store token if login successful
        // Backend returns 'accessToken' not 'token'
        if (response.accessToken) {
            await this.setToken(response.accessToken);
            // Fetch and store user data
            try {
                const userData = await this.getCurrentUser();
                await new Promise((resolve) => {
                    chrome.storage.local.set({ [CONFIG.USER_STORAGE_KEY]: userData }, () => {
                        resolve();
                    });
                });
            } catch (error) {
                console.error('Error fetching user data:', error);
            }
        }

        return response;
    }

    async logout() {
        await this.clearToken();
    }

    // Translation API
    async translate(word, contextSentence = '', language = 'en') {
        return await this.request('/api/v1/translate', {
            method: 'POST',
            body: JSON.stringify({ word, contextSentence, language }),
        });
    }

    async fastTranslate(word, contextSentence = '', language = 'en') {
        return await this.request('/api/v1/translate/fast', {
            method: 'POST',
            body: JSON.stringify({ word, contextSentence, language }),
        });
    }

    async fastTranslateForWord(word, contextSentence = '', language = 'en') {
        return await this.request('/api/v1/translate/word', {
            method: 'POST',
            body: JSON.stringify({ word, contextSentence, language }),
        });
    }

    async externalTranslate(word, language = 'en') {
        return await this.request('/api/v1/translate/external', {
            method: 'POST',
            body: JSON.stringify({ word, language }),
        });
    }

    // Vocabulary APIs
    async createVocabulary(vocabData) {
        return await this.request('/api/v1/vocabulary', {
            method: 'POST',
            body: JSON.stringify(vocabData),
        });
    }

    async getVocabulary() {
        return await this.request('/api/v1/vocabulary', {
            method: 'GET',
        });
    }

    async updateVocabulary(wordId, updateData) {
        return await this.request(`/api/v1/vocabulary/${wordId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData),
        });
    }

    async deleteVocabulary(wordId) {
        return await this.request(`/api/v1/vocabulary/${wordId}`, {
            method: 'DELETE',
        });
    }

    // Lists APIs
    async getLists() {
        return await this.request('/api/v1/lists', {
            method: 'GET',
        });
    }

    async createList(listData) {
        return await this.request('/api/v1/lists', {
            method: 'POST',
            body: JSON.stringify(listData),
        });
    }

    async getList(listId) {
        return await this.request(`/api/v1/lists/${listId}`, {
            method: 'GET',
        });
    }

    // User API
    async getCurrentUser() {
        return await this.request('/api/v1/users/me', {
            method: 'GET',
        });
    }
}

// Create a singleton instance
const apiService = new ApiService();
