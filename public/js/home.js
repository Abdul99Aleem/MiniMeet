document.addEventListener('DOMContentLoaded', () => {
    const newMeetingBtn = document.getElementById('new-meeting-btn');
    const joinMeetingBtn = document.getElementById('join-meeting-btn');
    const roomIdInput = document.getElementById('room-id-input');
    const userMenu = document.getElementById('user-menu');
    
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
    
    // Create a new meeting
    newMeetingBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        try {
            // Check if user is authenticated first
            const response = await fetch('/api/user');
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.user) {
                    // User is authenticated, create a new room
                    const roomId = generateRoomId();
                    window.location.href = `/?room=${roomId}`;
                } else {
                    // User is not authenticated, redirect to login
                    window.location.href = '/auth/login';
                }
            } else {
                // Not authenticated, redirect to login
                window.location.href = '/auth/login';
            }
        } catch (error) {
            console.error('Error checking authentication:', error);
            window.location.href = '/auth/login';
        }
    });
    
    // Join an existing meeting
    joinMeetingBtn.addEventListener('click', joinMeeting);
    roomIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinMeeting();
        }
    });
    
    async function joinMeeting() {
        const roomId = roomIdInput.value.trim();
        
        if (!roomId) {
            alert('Please enter a room code');
            return;
        }
        
        try {
            // Check if user is authenticated first
            const authResponse = await fetch('/api/user');
            
            if (!authResponse.ok) {
                // Not authenticated, redirect to login with the room ID
                window.location.href = `/auth/login?redirect=/?room=${roomId}`;
                return;
            }
            
            // User is authenticated, check if the room exists
            const roomResponse = await fetch(`/api/check-room?roomId=${roomId}`);
            const roomData = await roomResponse.json();
            
            if (roomResponse.ok && roomData.exists) {
                // Room exists, join it
                window.location.href = `/?room=${roomId}`;
            } else {
                // Room doesn't exist
                alert('No meeting found with this code');
            }
        } catch (error) {
            console.error('Error joining meeting:', error);
            alert('Error joining meeting. Please try again.');
        }
    }
    
    
    // Initialize
    fetchUserData();
});
