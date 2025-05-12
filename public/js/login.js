document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    
    // Make the page visible
    document.documentElement.style.visibility = 'visible';
    document.documentElement.style.opacity = '1';
    
    // Focus on username input when page loads
    usernameInput.focus();
    
    // Handle login button click
    loginBtn.addEventListener('click', handleLogin);
    
    // Handle Enter key press
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
    
    // Login function
    async function handleLogin() {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        
        // Basic validation
        if (!username || !password) {
            loginError.textContent = 'Please enter both username and password';
            return;
        }
        
        // Clear previous error
        loginError.textContent = '';
        
        // Disable button and show loading state
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
        
        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Check if there's a redirect URL in the query params
                const urlParams = new URLSearchParams(window.location.search);
                const redirectUrl = urlParams.get('redirect');
                
                // Redirect to the specified URL or home
                window.location.href = redirectUrl || '/';
            } else {
                // Show error message
                loginError.textContent = data.message || 'Invalid username or password';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In';
            }
        } catch (error) {
            console.error('Login error:', error);
            loginError.textContent = 'An error occurred. Please try again.';
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
        }
    }
});
