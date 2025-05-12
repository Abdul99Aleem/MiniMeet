// DOM elements
const usernameDisplay = document.getElementById('username-display');
const setupContainer = document.getElementById('setup-container');
const callContainer = document.getElementById('call-container');
const chatContainer = document.getElementById('chat-container');
const localPreview = document.getElementById('local-preview');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remoteVideoContainer = document.getElementById('remote-video-container');
const remoteUserName = document.getElementById('remote-user-name');
const startCameraBtn = document.getElementById('start-camera-btn');
const joinBtn = document.getElementById('join-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const leaveBtn = document.getElementById('leave-btn');
const roomIdInput = document.getElementById('room-id');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

// WebRTC variables
let localStream;
let remoteStream;
let peerConnection;
let roomId;
let username;
let socket = io();

// ICE servers configuration
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Get user info
async function getUserInfo() {
    try {
        const response = await fetch('/auth/check');
        const data = await response.json();
        
        if (data.authenticated) {
            username = data.user.username;
            usernameDisplay.textContent = username;
        } else {
            window.location.href = '/auth/login';
        }
    } catch (error) {
        console.error('Error checking authentication:', error);
        window.location.href = '/auth/login';
    }
}

// Initialize camera and microphone
async function initializeMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        localPreview.srcObject = localStream;
        localVideo.srcObject = localStream;
        
        joinBtn.disabled = false;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Failed to access camera and microphone. Please check permissions.');
    }
}

// Create peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);
    
    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                roomId
            });
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = event => {
        if (peerConnection.connectionState === 'connected') {
            console.log('Peers connected!');
        }
    };
    
    // Handle receiving remote tracks
    peerConnection.ontrack = event => {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
        remoteVideoContainer.classList.remove('hidden');
    };
}

// Create and send offer
async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            offer: peerConnection.localDescription,
            roomId
        });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Handle received offer
async function handleOffer(offer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            answer: peerConnection.localDescription,
            roomId
        });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

// Handle received answer
async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

// Handle received ICE candidate
async function handleIceCandidate(candidate) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

// Join a room
function joinRoom() {
    roomId = roomIdInput.value.trim();
    
    if (!roomId) {
        alert('Please enter a room name');
        return;
    }
    
    // Create peer connection
    createPeerConnection();
    
    // Join room
    socket.emit('join-room', {
        roomId,
        username
    });
    
    // Show call container
    setupContainer.classList.add('hidden');
    callContainer.classList.remove('hidden');
    chatContainer.classList.remove('hidden');
    
    // Request chat history
    socket.emit('get-history', { roomId });
}

// Leave the room
function leaveRoom() {
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Leave room
    socket.emit('leave-room', {
        roomId,
        username
    });
    
    // Reset UI
    remoteVideoContainer.classList.add('hidden');
    callContainer.classList.add('hidden');
    setupContainer.classList.remove('hidden');
    chatContainer.classList.add('hidden');
    messagesContainer.innerHTML = '';
    
    // Reinitialize media
    initializeMedia();
}

// Toggle video
function toggleVideo() {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    
    toggleVideoBtn.innerHTML = videoTrack.enabled ? 
        '<span class="material-icons">videocam</span>' : 
        '<span class="material-icons">videocam_off</span>';
}

// Toggle audio
function toggleAudio() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    
    toggleAudioBtn.innerHTML = audioTrack.enabled ? 
        '<span class="material-icons">mic</span>' : 
        '<span class="material-icons">mic_off</span>';
}

// Send chat message
function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    // Emit message to server
    socket.emit('chat-message', {
        message,
        roomId,
        sender: username
    });
    
    // Add message to UI
    addMessageToUI(message, username, true);
    
    // Clear input
    messageInput.value = '';
}

// Add message to UI
function addMessageToUI(message, sender, isSent = false) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(isSent ? 'sent' : 'received');
    
    const senderElement = document.createElement('div');
    senderElement.classList.add('sender');
    senderElement.textContent = sender;
    
    const contentElement = document.createElement('div');
    contentElement.classList.add('content');
    contentElement.textContent = message;
    
    messageElement.appendChild(senderElement);
    messageElement.appendChild(contentElement);
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Socket event handlers
socket.on('user-joined', (remoteUsername) => {
    console.log(`${remoteUsername} joined the room`);
    remoteUserName.textContent = remoteUsername;
    createOffer();
});

socket.on('user-left', (remoteUsername) => {
    console.log(`${remoteUsername} left the room`);
    remoteVideoContainer.classList.add('hidden');
});

socket.on('offer', handleOffer);
socket.on('answer', handleAnswer);
socket.on('ice-candidate', handleIceCandidate);

socket.on('chat-message', ({ message, sender }) => {
    addMessageToUI(message, sender);
});

socket.on('history-messages', (messages) => {
    messagesContainer.innerHTML = '';
    
    messages.forEach(msg => {
        addMessageToUI(msg.message, msg.sender, msg.sender === username);
    });
});

// Event listeners
startCameraBtn.addEventListener('click', initializeMedia);
joinBtn.addEventListener('click', joinRoom);
leaveBtn.addEventListener('click', leaveRoom);
toggleVideoBtn.addEventListener('click', toggleVideo);
toggleAudioBtn.addEventListener('click', toggleAudio);
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

// Initialize
getUserInfo();
