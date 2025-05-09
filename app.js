// Global variables
let localStream;
let remoteStream;
let peerConnection;
let roomId;
let socket;

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

// ICE servers configuration
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
        // For production, add TURN servers:
        // {
        //     urls: 'turn:your-turn-server.com:3478',
        //     username: 'username',
        //     credential: 'password'
        // }
    ]
};

// Connect to signaling server
function connectSignaling() {
    // In a real app, replace with your server URL
    socket = io('https://8e21-2405-201-c00d-c-5a56-102f-fd8-9711.ngrok-free.app');
    
    socket.on('connect', () => {
        console.log('Connected to signaling server');
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
    
    socket.on('user-joined', () => {
        console.log('Another user joined the room');
    });
    
    socket.on('user-left', () => {
        console.log('User left the room');
        remoteVideo.srcObject = null;
    });
    
    socket.on('chat-message', (data) => {
        addMessageToChat(data.message, false);
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
    
    if (!localStream) {
        const success = await initLocalStream();
        if (!success) return;
    }
    
    console.log(`Joining room: ${roomId}`);
    socket.emit('join-room', roomId);
    
    createPeerConnection();
    
    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { offer, roomId });
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
        socket.emit('leave-room', roomId);
    }
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
        socket.emit('chat-message', { message, roomId });
        addMessageToChat(message, true);
        chatInput.value = '';
    }
}

// Add message to chat
function addMessageToChat(message, isSent) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', isSent ? 'sent' : 'received');
    
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
        <div class="message-info">${isSent ? 'You' : 'Remote User'} - ${timeString}</div>
        <div class="message-text">${message}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

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

// Initialize connection to signaling server
connectSignaling();

// Handle page unload
window.addEventListener('beforeunload', hangup);
