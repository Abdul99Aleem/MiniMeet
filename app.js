// Global variables
let localStream;
let remoteStream;
let peerConnection;
let roomId;
let socket;
let currentUser = null;

// DOM elements
const startBtn = document.getElementById('startBtn');
const hangupBtn = document.getElementById('hangupBtn');
const videoToggle = document.getElementById('videoToggle');
const audioToggle = document.getElementById('audioToggle');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const currentUserElement = document.getElementById('currentUser');

// ICE servers configuration
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch('/auth/check');
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = '/auth/login';
            return false;
        }
        
        currentUser = data.user;
        currentUserElement.textContent = `Logged in as: ${currentUser.username}`;
        return true;
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/auth/login';
        return false;
    }
}

// Connect to signaling server
function connectSignaling() {
    console.log('Attempting to connect to signaling server...');
    
    // Connect to the server where the page is hosted
    socket = io('/', {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10
    });
    
    socket.on('connect', () => {
        console.log('Connected to signaling server successfully!');
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        alert('Failed to connect to the signaling server. Please check your connection.');
    });
    
    socket.on('offer', async (offer) => {
        if (!peerConnection) {
            createPeerConnection();
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { answer, roomId });
    });
    
    socket.on('answer', async (answer) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });
    
    socket.on('ice-candidate', async (candidate) => {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
    
    socket.on('user-joined', (username) => {
        console.log(`${username} joined the room`);
        addSystemMessage(`${username} joined the room`);
    });
    
    socket.on('user-left', (username) => {
        console.log(`${username} left the room`);
        addSystemMessage(`${username} left the room`);
        remoteVideo.srcObject = null;
    });
    
    socket.on('chat-message', (data) => {
        addMessageToChat(data.sender, data.message, false);
    });
    
    socket.on('history-messages', (messages) => {
        // Clear existing messages
        chatMessages.innerHTML = '';
        
        // Add all messages from history
        messages.forEach(msg => {
            const isSent = msg.sender === currentUser.username;
            addMessageToChat(msg.sender, msg.message, isSent);
        });
    });
}

// Initialize media stream
async function initLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: videoToggle.checked,
            audio: audioToggle.checked
        });
        localVideo.srcObject = localStream;
        startBtn.disabled = true;
        hangupBtn.disabled = false;
        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Error accessing camera or microphone. Please check permissions.');
        return false;
    }
}

// Create peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);
    
    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { candidate: event.candidate, roomId });
        }
    };
    
    peerConnection.onconnectionstatechange = (event) => {
        if (peerConnection.connectionState === 'connected') {
            console.log('Peers connected!');
            addSystemMessage('Connection established successfully');
        }
    };
}

// Join a room
async function joinRoom() {
    roomId = roomInput.value.trim();
    if (!roomId) {
        alert('Please enter a room name');
        return;
    }
    
    console.log(`Attempting to join room: ${roomId}`);
    
    if (!localStream) {
        console.log('Initializing local stream...');
        const success = await initLocalStream();
        if (!success) return;
    }
    
    if (!socket || !socket.connected) {
        console.error('Socket not connected! Attempting to reconnect...');
        connectSignaling();
        // Wait a bit for the connection
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!socket.connected) {
            alert('Cannot join room: Not connected to signaling server');
            return;
        }
    }
    
    console.log(`Emitting join-room event for room: ${roomId}`);
    socket.emit('join-room', { roomId, username: currentUser.username });
    
    // Load chat history for this room
    loadChatHistory(roomId);
    
    createPeerConnection();
    
    try {
        console.log('Creating offer...');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('Sending offer to signaling server...');
        socket.emit('offer', { offer, roomId });
    } catch (error) {
        console.error('Error creating or sending offer:', error);
        alert('Failed to create connection. Please try again.');
    }
}

// Load chat history
async function loadChatHistory(roomId) {
    try {
        const response = await fetch(`/api/messages/${roomId}`);
        if (response.ok) {
            const messages = await response.json();
            socket.emit('get-history', { roomId });
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// End call
function hangup() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        localVideo.srcObject = null;
    }
    
    remoteVideo.srcObject = null;
    startBtn.disabled = false;
    hangupBtn.disabled = true;
    
    if (socket && roomId) {
        socket.emit('leave-room', { roomId, username: currentUser.username });
        roomId = null;
    }
    
    addSystemMessage('Call ended');
}

// Toggle video
function toggleVideo() {
    if (localStream) {
        localStream.getVideoTracks().forEach(track => {
            track.enabled = videoToggle.checked;
        });
    }
}

// Toggle audio
function toggleAudio() {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = audioToggle.checked;
        });
    }
}

// Send chat message
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (message && socket && roomId) {
        socket.emit('chat-message', { 
            message, 
            roomId, 
            sender: currentUser.username 
        });
        addMessageToChat(currentUser.username, message, true);
        chatInput.value = '';
    }
}

// Add message to chat
function addMessageToChat(sender, message, isSent) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', isSent ? 'sent' : 'received');
    
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
        <div class="message-info">${sender} - ${timeString}</div>
        <div class="message-text">${message}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add system message
function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'system');
    
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
        <div class="message-info">System - ${timeString}</div>
        <div class="message-text">${message}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Initialize app
async function init() {
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;
    
    connectSignaling();
    
    // Event listeners
    startBtn.addEventListener('click', initLocalStream);
    hangupBtn.addEventListener('click', hangup);
    videoToggle.addEventListener('change', toggleVideo);
    audioToggle.addEventListener('change', toggleAudio);
    joinBtn.addEventListener('click', joinRoom);
    sendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}

// Handle page unload
window.addEventListener('beforeunload', hangup);

// Start the app
init();
