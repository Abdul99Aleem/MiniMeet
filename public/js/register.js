document.addEventListener('DOMContentLoaded', () => {
    const registerBtn = document.getElementById('register-btn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const registerError = document.getElementById('register-error');
    
    // Make the page visible
    document.documentElement.style.visibility = 'visible';
    document.documentElement.style.opacity = '1';
    
    // Focus on username input when page loads
    usernameInput.focus();
    
    // Handle register button click
    registerBtn.addEventListener('click', handleRegister);
    
    // Handle Enter key press
    confirmPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleRegister();
        }
    });
    
    // Registration function
    async function handleRegister() {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        // Basic validation
        if (!username || !password || !confirmPassword) {
            registerError.textContent = 'Please fill in all fields';
            return;
        }
        
        if (password !== confirmPassword) {
            registerError.textContent = 'Passwords do not match';
            return;
        }
        
        // Clear previous error
        registerError.textContent = '';
        
        // Disable button and show loading state
        registerBtn.disabled = true;
        registerBtn.textContent = 'Creating account...';
        
        try {
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Successful registration, redirect to login
                window.location.href = '/auth/login?registered=true';
            } else {
                // Show error message
                registerError.textContent = data.message || 'Registration failed';
                registerBtn.disabled = false;
                registerBtn.textContent = 'Create Account';
            }
        } catch (error) {
            console.error('Registration error:', error);
            registerError.textContent = 'An error occurred. Please try again.';
            registerBtn.disabled = false;
            registerBtn.textContent = 'Create Account';
        }
    }
});
