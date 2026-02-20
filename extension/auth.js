// Authentication page logic
document.addEventListener('DOMContentLoaded', async () => {
    await apiService.init();

    // Check if already logged in
    const token = apiService.getToken();
    if (token) {
        // Redirect to popup
        window.location.href = 'popup.html';
        return;
    }

    // Tab switching
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');

    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        loginView.classList.add('active');
        signupView.classList.remove('active');
        clearMessages();
    });

    tabSignup.addEventListener('click', () => {
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
        signupView.classList.add('active');
        loginView.classList.remove('active');
        clearMessages();
    });

    // Login form
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-btn');
    const loginLoader = document.getElementById('login-loader');
    const loginError = document.getElementById('login-error');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            showError('login', 'Please fill in all fields');
            return;
        }

        setLoading('login', true);
        clearMessages();

        try {
            const response = await apiService.signin(email, password);
            console.log('Login successful:', response);

            // Redirect to popup
            window.location.href = 'popup.html';
        } catch (error) {
            console.error('Login error:', error);
            showError('login', error.message || 'Login failed. Please check your credentials.');
        } finally {
            setLoading('login', false);
        }
    });

    // Signup form
    const signupForm = document.getElementById('signup-form');
    const signupBtn = document.getElementById('signup-btn');
    const signupLoader = document.getElementById('signup-loader');
    const signupError = document.getElementById('signup-error');
    const signupSuccess = document.getElementById('signup-success');

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const userName = document.getElementById('signup-username').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const passwordConf = document.getElementById('signup-password-conf').value;
        const nativeLanguage = document.getElementById('native-language').value;
        const targetLanguage = document.getElementById('target-language').value;

        // Validation
        if (!userName || !email || !password || !passwordConf) {
            showError('signup', 'Please fill in all fields');
            return;
        }

        if (password.length < 8) {
            showError('signup', 'Password must be at least 8 characters');
            return;
        }

        if (password !== passwordConf) {
            showError('signup', 'Passwords do not match');
            return;
        }

        setLoading('signup', true);
        clearMessages();

        try {
            const userData = {
                userName,
                email,
                password,
                passwordConf,
                nativeLanguage,
                targetLanguage,
            };

            const response = await apiService.signup(userData);
            console.log('Signup successful:', response);

            showSuccess('signup', 'Account created successfully! Redirecting...');

            // Redirect to popup after a short delay
            setTimeout(() => {
                window.location.href = 'popup.html';
            }, 1500);
        } catch (error) {
            console.error('Signup error:', error);
            showError('signup', error.message || 'Signup failed. Please try again.');
        } finally {
            setLoading('signup', false);
        }
    });

    // Helper functions
    function setLoading(form, isLoading) {
        const btn = form === 'login' ? loginBtn : signupBtn;
        const loader = form === 'login' ? loginLoader : signupLoader;
        const btnText = btn.querySelector('.btn-text');

        if (isLoading) {
            btnText.style.display = 'none';
            loader.style.display = 'block';
            btn.disabled = true;
        } else {
            btnText.style.display = 'block';
            loader.style.display = 'none';
            btn.disabled = false;
        }
    }

    function showError(form, message) {
        const errorEl = form === 'login' ? loginError : signupError;
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    function showSuccess(form, message) {
        if (form === 'signup') {
            signupSuccess.textContent = message;
            signupSuccess.style.display = 'block';
        }
    }

    function clearMessages() {
        loginError.style.display = 'none';
        signupError.style.display = 'none';
        signupSuccess.style.display = 'none';
    }
});
