document.addEventListener('DOMContentLoaded', () => {
    // Make the page visible
    document.documentElement.style.visibility = 'visible';
    document.documentElement.style.opacity = '1';
});

// Debug mode
const DEBUG = true;

function debug(message) {
    if (DEBUG) {
        console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`);
    }
}

// Global variables
const socket = io({
    reconnectionAttempts: 5,
    timeout: 10000
});
let localStream;
let peerConnections = {};
let roomId;
let username;
let localVideoEnabled = true;
let localAudioEnabled = true;
let screenShareStream = null;
let isScreenSharing = false;

// DOM elements
const videoGrid = document.getElementById('video-grid');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleVideoBtn = document.getElementById('toggle-video');
const shareScreenBtn = document.getElementById('share-screen');
const toggleChatBtn = document.getElementById('toggle-chat');
const leaveRoomBtn = document.getElementById('leave-room');
const roomIdDisplay = document.getElementById('room-id-display');
const copyRoomIdBtn = document.getElementById('copy-room-id');
const usernameDisplay = document.getElementById('username-display');

// Socket connection events
socket.on('connect', () => {
    debug(`Connected to server with socket ID: ${socket.id}`);
});

socket.on('connect_error', (error) => {
    console.error('Socket.io connection error:', error);
    alert('Error connecting to the server. Please refresh the page and try again.');
});

// Initialize the application
async function init() {
    try {
        // Get username from session
        const response = await fetch('/api/user');
        const data = await response.json();
        
        if (data.user) {
            username = data.user.username;
            usernameDisplay.textContent = username;
        } else {
            window.location.href = '/auth/login';
            return;
        }
        
        // Generate or get room ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const isJoiningExistingRoom = urlParams.get('join') === 'true';
        roomId = urlParams.get('room') || generateRoomId();
        
        // Check if room exists only when explicitly joining an existing room
        if (isJoiningExistingRoom) {
            try {
                const roomCheckResponse = await fetch(`/api/check-room?roomId=${roomId}`);
                const roomData = await roomCheckResponse.json();
                
                console.log(`Room check response for ${roomId}:`, roomData);
                
                if (!roomData.exists) {
                    alert('This meeting has ended or does not exist.');
                    window.location.href = '/';
                    return;
                }
            } catch (error) {
                console.error('Error checking if room exists:', error);
                // Continue anyway to avoid blocking users if the check fails
            }
        }
        
        // Update URL if room ID was generated
        if (!urlParams.get('room')) {
            window.history.pushState({}, '', `?room=${roomId}`);
        }
        
        // Display room ID
        roomIdDisplay.textContent = roomId;
        
        // Setup media devices
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Create local video element
        addVideoStream('local', localStream, username + ' (You)');
        
        // Join room
        socket.emit('join-room', { roomId, username });
        
        // Setup event listeners
        setupSocketListeners();
        setupUIListeners();
        
    } catch (error) {
        console.error('Error initializing:', error);
        alert('Could not initialize the application. Please check permissions and try again.');
    }
}



// Generate a random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 7);
}

// Update the video grid layout based on participant count
function updateVideoGridLayout() {
    // Count the number of video containers
    const participantCount = videoGrid.querySelectorAll('.video-container').length;
    
    // Remove all participant classes
    videoGrid.className = 'video-grid';
    
    // Add the appropriate class based on participant count
    videoGrid.classList.add(`participants-${participantCount}`);
    
    debug(`Updated video grid layout for ${participantCount} participants`);
}

// Add a video stream to the grid
function addVideoStream(id, stream, label, muted = false) {
    // Check if video container already exists
    const existingContainer = document.getElementById(`video-container-${id}`);
    if (existingContainer) {
        debug(`Video container for ${label} already exists, updating stream`);
        const video = document.getElementById(`video-${id}`);
        video.srcObject = stream;
        return video;
    }
    
    debug(`Adding video stream for ${label}`);
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `video-container-${id}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.id = `video-${id}`;
    video.autoplay = true;
    video.playsInline = true;
    
    if (id === 'local') {
        video.muted = true; // Mute local video to prevent feedback
    }
    
    const userLabel = document.createElement('div');
    userLabel.className = 'user-label';
    userLabel.textContent = label;
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(userLabel);
    
    if (muted) {
        const mutedIndicator = document.createElement('div');
        mutedIndicator.className = 'muted-indicator';
        mutedIndicator.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        videoContainer.appendChild(mutedIndicator);
    }
    
    videoGrid.appendChild(videoContainer);
    
    // Update the grid layout
    updateVideoGridLayout();
    
    // Ensure video plays
    video.play().catch(error => {
        debug(`Error playing video: ${error.message}`);
        // Try playing again when user interacts with the page
        document.addEventListener('click', () => {
            video.play().catch(e => debug(`Still can't play video: ${e.message}`));
        }, { once: true });
    });
    
    return video;
}

// Setup WebRTC connection with a peer
async function setupPeerConnection(peerId, peerUsername) {
    // Check if connection already exists
    if (peerConnections[peerId]) {
        debug(`Peer connection with ${peerUsername} (${peerId}) already exists`);
        return peerConnections[peerId].connection;
    }
    
    debug(`Setting up peer connection with ${peerUsername} (${peerId})`);
    
    const peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ]
    });
    
    peerConnections[peerId] = {
        connection: peerConnection,
        username: peerUsername
    };
    
    // Add local tracks to the connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            debug(`Sending ICE candidate to ${peerUsername}`);
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                roomId,
                peerId
            });
        }
    };
    
    // Log ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        debug(`ICE connection state with ${peerUsername}: ${peerConnection.iceConnectionState}`);
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        debug(`Connection state with ${peerUsername} changed to: ${peerConnection.connectionState}`);
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'closed') {
            debug(`Connection with ${peerUsername} is ${peerConnection.connectionState}, attempting to reconnect...`);
            
            // Close the existing connection
            peerConnection.close();
            
            // Remove the video element
            const videoContainer = document.getElementById(`video-container-${peerId}`);
            if (videoContainer) {
                videoContainer.remove();
                updateVideoGridLayout();
            }
            
            // Create a new connection after a short delay
            setTimeout(async () => {
                delete peerConnections[peerId];
                
                // Only try to reconnect if we're still in the room
                if (document.getElementById('video-grid')) {
                    await setupPeerConnection(peerId, peerUsername);
                    
                    // Create and send a new offer
                    try {
                        const offer = await peerConnections[peerId].connection.createOffer();
                        await peerConnections[peerId].connection.setLocalDescription(offer);
                        
                        socket.emit('offer', {
                            offer,
                            roomId,
                            peerId,
                            username
                        });
                    } catch (error) {
                        console.error(`Error creating reconnection offer for peer ${peerId}:`, error);
                    }
                }
            }, 2000);
        }
    };
    
    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
        debug(`Received tracks from ${peerUsername}`);
        const stream = event.streams[0];
        
        // Check if we already have a video element for this peer
        if (!document.getElementById(`video-${peerId}`)) {
            debug(`Adding video stream for ${peerUsername}`);
            addVideoStream(peerId, stream, peerUsername);
        } else {
            // Update the existing video element
            debug(`Updating video stream for ${peerUsername}`);
            const video = document.getElementById(`video-${peerId}`);
            video.srcObject = stream;
        }
    };
    
    return peerConnection;
}

// Setup socket event listeners
function setupSocketListeners() {
    // When receiving the list of existing users in the room
    socket.on('existing-users', async (users) => {
        debug(`Received list of ${users.length} existing users in room`);
        
        // Create peer connections with all existing users
        for (const user of users) {
            const { peerId, username: peerUsername } = user;
            debug(`Setting up connection with existing user ${peerUsername} (${peerId})`);
            
            // Create peer connection
            const peerConnection = await setupPeerConnection(peerId, peerUsername);
            
            // Create and send offer
            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                
                socket.emit('offer', {
                    offer,
                    roomId,
                    peerId,
                    username
                });
            } catch (error) {
                console.error(`Error creating offer for peer ${peerId}:`, error);
            }
        }
    });
    
    // When a new user joins
    socket.on('user-joined', async (data) => {
        const { peerId, username: peerUsername } = data;
        debug(`${peerUsername} joined the room with peerId: ${peerId}`);
        
        // Create peer connection if it doesn't exist
        if (!peerConnections[peerId]) {
            await setupPeerConnection(peerId, peerUsername);
            // Note: We don't create an offer here, we wait for the new user to create offers
        }
    });
    
    // When receiving an offer
    socket.on('offer', async (data) => {
        const { offer, peerId, username: peerUsername } = data;
        debug(`Received offer from ${peerUsername}`);
        
        // Create peer connection if it doesn't exist
        const peerConnection = peerConnections[peerId]?.connection || 
                              await setupPeerConnection(peerId, peerUsername);
        
        try {
            // Set remote description
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            socket.emit('answer', {
                answer,
                roomId,
                peerId
            });
        } catch (error) {
            console.error(`Error handling offer from ${peerUsername}:`, error);
        }
    });
    
    // When receiving an answer
    socket.on('answer', async (data) => {
        const { answer, peerId } = data;
        debug(`Received answer from peer ${peerId}`);
        
        if (peerConnections[peerId]) {
            try {
                await peerConnections[peerId].connection.setRemoteDescription(
                    new RTCSessionDescription(answer)
                );
            } catch (error) {
                console.error(`Error handling answer from peer ${peerId}:`, error);
            }
        }
    });
    
    // When receiving an ICE candidate
    socket.on('ice-candidate', (data) => {
        const { candidate, peerId } = data;
        debug(`Received ICE candidate from peer ${peerId}`);
        
        if (peerConnections[peerId]) {
            try {
                peerConnections[peerId].connection.addIceCandidate(
                    new RTCIceCandidate(candidate)
                );
            } catch (error) {
                console.error(`Error adding ICE candidate from peer ${peerId}:`, error);
            }
        }
    });
    
    // When a user leaves
    socket.on('user-left', (data) => {
        const { peerId, username: peerUsername } = data;
        debug(`${peerUsername} left the room`);
        
        // Remove video element
        const videoContainer = document.getElementById(`video-container-${peerId}`);
        if (videoContainer) {
            videoContainer.remove();
            
            // Update the grid layout
            updateVideoGridLayout();
        }
        
        // Close and remove peer connection
        if (peerConnections[peerId]) {
            peerConnections[peerId].connection.close();
            delete peerConnections[peerId];
        }
    });
    
    // When receiving a chat message
    socket.on('chat-message', (data) => {
        addMessageToChat(data.sender, data.message, false);
    });
    
    // When receiving chat history
    socket.on('history-messages', (messages) => {
        debug(`Received ${messages.length} chat history messages`);
        messages.forEach(msg => {
            addMessageToChat(msg.sender, msg.message, msg.sender === username);
        });
    });
    
    // When room doesn't exist or is closed
    socket.on('room-closed', () => {
        alert('This meeting has ended or does not exist.');
        window.location.href = '/';
    });
}

// Setup UI event listeners
function setupUIListeners() {
        // Send chat message
        sendMessageBtn.addEventListener('click', sendChatMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    
        // Toggle microphone
        toggleMicBtn.addEventListener('click', () => {
            localAudioEnabled = !localAudioEnabled;
            localStream.getAudioTracks().forEach(track => {
                track.enabled = localAudioEnabled;
            });
            
            // Update UI
            if (localAudioEnabled) {
                toggleMicBtn.querySelector('i').className = 'fas fa-microphone';
                toggleMicBtn.classList.remove('active');
            } else {
                toggleMicBtn.querySelector('i').className = 'fas fa-microphone-slash';
                toggleMicBtn.classList.add('active');
            }
        });
    
        // Toggle video
        toggleVideoBtn.addEventListener('click', () => {
            localVideoEnabled = !localVideoEnabled;
            localStream.getVideoTracks().forEach(track => {
                track.enabled = localVideoEnabled;
            });
            
            // Update UI
            if (localVideoEnabled) {
                toggleVideoBtn.querySelector('i').className = 'fas fa-video';
                toggleVideoBtn.classList.remove('active');
            } else {
                toggleVideoBtn.querySelector('i').className = 'fas fa-video-slash';
                toggleVideoBtn.classList.add('active');
            }
        });
    
        // Share screen
        shareScreenBtn.addEventListener('click', async () => {
            if (!isScreenSharing) {
                try {
                    screenShareStream = await navigator.mediaDevices.getDisplayMedia({
                        video: true
                    });
                    
                    // Replace video track with screen share
                    const videoTrack = screenShareStream.getVideoTracks()[0];
                    
                    // Replace track in all peer connections
                    for (const peerId in peerConnections) {
                        const sender = peerConnections[peerId].connection
                            .getSenders()
                            .find(s => s.track.kind === 'video');
                        
                        if (sender) {
                            sender.replaceTrack(videoTrack);
                        }
                    }
                    
                    // Replace local video
                    const localVideo = document.getElementById('video-local');
                    localVideo.srcObject = screenShareStream;
                    
                    // Update UI
                    shareScreenBtn.querySelector('i').className = 'fas fa-stop';
                    shareScreenBtn.classList.add('active');
                    isScreenSharing = true;
                    
                    // Handle screen share ending
                    videoTrack.onended = () => {
                        stopScreenSharing();
                    };
                    
                } catch (error) {
                    console.error('Error sharing screen:', error);
                }
            } else {
                stopScreenSharing();
            }
        });
    
        // Toggle chat panel on mobile
toggleChatBtn.addEventListener('click', () => {
    const mainContent = document.querySelector('.main-content');
    const chatPanel = document.querySelector('.chat-panel');
    
    // Check if we're on mobile
    if (window.innerWidth <= 768) {
        chatPanel.classList.toggle('mobile-visible');
        toggleChatBtn.classList.toggle('active');
        
        // Create or remove overlay
        let overlay = document.querySelector('.chat-overlay');
        if (chatPanel.classList.contains('mobile-visible')) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'chat-overlay';
                document.body.appendChild(overlay);
                
                // Close chat when clicking overlay
                overlay.addEventListener('click', () => {
                    chatPanel.classList.remove('mobile-visible');
                    toggleChatBtn.classList.remove('active');
                    overlay.classList.remove('visible');
                });
            }
            overlay.classList.add('visible');
        } else if (overlay) {
            overlay.classList.remove('visible');
        }
    } else {
        // For desktop
        mainContent.classList.toggle('chat-hidden');
        toggleChatBtn.classList.toggle('active');
    }
});
    
        // Leave room
        leaveRoomBtn.addEventListener('click', () => {
            socket.emit('leave-room', { roomId, username });
            
            // Close all peer connections
            for (const peerId in peerConnections) {
                peerConnections[peerId].connection.close();
            }
            
            // Stop local stream
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            
            // Stop screen share if active
            if (screenShareStream) {
                screenShareStream.getTracks().forEach(track => track.stop());
            }
            
            // Redirect to home
            window.location.href = '/';
        });
    
        // Copy room ID
        copyRoomIdBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(roomId)
                .then(() => {
                    // Show copied notification
                    const originalText = copyRoomIdBtn.innerHTML;
                    copyRoomIdBtn.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => {
                        copyRoomIdBtn.innerHTML = originalText;
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy room ID:', err);
                });
        });
    }
    
    // Stop screen sharing
    function stopScreenSharing() {
        if (screenShareStream) {
            screenShareStream.getTracks().forEach(track => track.stop());
            
            // Restore video track from local stream
            const videoTrack = localStream.getVideoTracks()[0];
            
            // Replace track in all peer connections
            for (const peerId in peerConnections) {
                const sender = peerConnections[peerId].connection
                    .getSenders()
                    .find(s => s.track.kind === 'video');
                
                if (sender && videoTrack) {
                    sender.replaceTrack(videoTrack);
                }
            }
            
            // Restore local video
            const localVideo = document.getElementById('video-local');
            localVideo.srcObject = localStream;
            
            // Update UI
            shareScreenBtn.querySelector('i').className = 'fas fa-desktop';
            shareScreenBtn.classList.remove('active');
            isScreenSharing = false;
            screenShareStream = null;
        }
    }
    
    // Send a chat message
    function sendChatMessage() {
        const message = chatInput.value.trim();
    
        if (message) {
            // Send to server
            socket.emit('chat-message', {
                message,
                roomId,
                sender: username
            });
            
            // Add to local chat
            addMessageToChat(username, message, true);
            
            // Clear input
            chatInput.value = '';
        }
    }
    
    // Add a message to the chat
    function addMessageToChat(sender, message, isSent) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isSent ? 'sent' : ''}`;
    
        const senderElement = document.createElement('div');
        senderElement.className = 'message-sender';
        senderElement.textContent = sender;
    
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        contentElement.textContent = message;
    
        messageElement.appendChild(senderElement);
        messageElement.appendChild(contentElement);
    
        chatMessages.appendChild(messageElement);
    
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Handle errors
    function handleError(error, message) {
        console.error(message, error);
        alert(`${message}: ${error.message || 'Unknown error'}`);
    }
    
    // Add CSS for different participant counts
    function addVideoGridStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .video-grid.participants-1 {
                grid-template-columns: 1fr;
            }
            
            .video-grid.participants-2 {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .video-grid.participants-3, .video-grid.participants-4 {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .video-grid.participants-5, .video-grid.participants-6 {
                grid-template-columns: repeat(3, 1fr);
            }
            
            .video-grid.participants-7, .video-grid.participants-8, .video-grid.participants-9 {
                grid-template-columns: repeat(3, 1fr);
            }
            
            @media (max-width: 768px) {
                .video-grid {
                    grid-template-columns: 1fr !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Check browser compatibility
    function checkBrowserCompatibility() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Your browser does not support video calls. Please use a modern browser like Chrome, Firefox, or Safari.');
            return false;
        }
        return true;
    }
    
    // Initialize the application when the page loads
    window.addEventListener('load', () => {
        if (checkBrowserCompatibility()) {
            addVideoGridStyles();
            init().catch(error => {
                handleError(error, 'Failed to initialize the application');
            });
        }
    });
    
    // Handle page unload to properly leave the room
    window.addEventListener('beforeunload', () => {
        if (roomId && username) {
            socket.emit('leave-room', { roomId, username });
            
            // Close all peer connections
            for (const peerId in peerConnections) {
                peerConnections[peerId].connection.close();
            }
            
            // Stop local stream
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            
            // Stop screen share if active
            if (screenShareStream) {
                screenShareStream.getTracks().forEach(track => track.stop());
            }
        }
    });
    // Update chat toggle behavior when window is resized
window.addEventListener('resize', () => {
    const mainContent = document.querySelector('.main-content');
    const chatPanel = document.querySelector('.chat-panel');
    const overlay = document.querySelector('.chat-overlay');
    
    // Reset everything when switching between mobile and desktop
    if (window.innerWidth > 768) {
        chatPanel.classList.remove('mobile-visible');
        if (overlay) overlay.classList.remove('visible');
        
        // Only toggle desktop view if the chat button is active
        if (toggleChatBtn.classList.contains('active')) {
            mainContent.classList.remove('chat-hidden');
        } else {
            mainContent.classList.add('chat-hidden');
        }
    } else {
        mainContent.classList.remove('chat-hidden');
        
        // Only show mobile chat if the button is active
        if (toggleChatBtn.classList.contains('active')) {
            chatPanel.classList.add('mobile-visible');
            if (overlay) overlay.classList.add('visible');
        }
    }
});

