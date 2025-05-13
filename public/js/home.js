document.addEventListener('DOMContentLoaded', () => {
    const newMeetingBtn = document.getElementById('new-meeting-btn');
    const joinMeetingBtn = document.getElementById('join-meeting-btn');
    const roomIdInput = document.getElementById('room-id-input');
    const userMenu = document.getElementById('user-menu');
    const loadingIndicator = document.getElementById('loading');
    
    // Make the page visible
    document.documentElement.style.visibility = 'visible';
    document.documentElement.style.opacity = '1';
    
    // Fetch user data
    async function fetchUserData() {
        try {
            const response = await fetch('/api/user');
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.user) {
                    // User is logged in, show username and sign out button
                    userMenu.innerHTML = `
                        <span id="username-display">${data.user.username}</span>
                        <a href="/auth/logout" class="logout-btn">Sign Out</a>
                    `;
                } else {
                    // User is not logged in, show sign in button
                    userMenu.innerHTML = `
                        <a href="/auth/login" class="login-btn">Sign In</a>
                    `;
                }
            } else {
                // Not authenticated, show sign in button
                userMenu.innerHTML = `
                    <a href="/auth/login" class="login-btn">Sign In</a>
                `;
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            // On error, show sign in button
            userMenu.innerHTML = `
                <a href="/auth/login" class="login-btn">Sign In</a>
            `;
        }
    }
    
    // Generate a random room ID
    function generateRoomId() {
        return Math.random().toString(36).substring(2, 7);
    }
    
    // Create a new meeting - Direct implementation
    function createNewMeeting() {
        console.log("New meeting button clicked");
        
        // Generate a room ID directly
        const roomId = generateRoomId();
        console.log("Generated room ID:", roomId);
        
        // Redirect to the room with create=true parameter
        window.location.href = `/?room=${roomId}&create=true`;
    }
    
    // Add click handler directly
    if (newMeetingBtn) {
        console.log("New meeting button found, adding click handler");
        newMeetingBtn.onclick = createNewMeeting;
    } else {
        console.error("New meeting button not found in the DOM");
    }
    
    // Join an existing meeting
    if (joinMeetingBtn) {
        joinMeetingBtn.addEventListener('click', joinMeeting);
    }
    
    if (roomIdInput) {
        roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinMeeting();
            }
        });
    }
    
    function joinMeeting() {
        const roomId = roomIdInput.value.trim();
        
        if (!roomId) {
            alert('Please enter a room code');
            return;
        }
        
        // Directly join the room with join=true parameter
        window.location.href = `/?room=${roomId}&join=true`;
    }
    
    // Initialize
    fetchUserData();
});
