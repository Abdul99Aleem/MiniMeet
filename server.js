const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
        
        // Notify other users in the room
        socket.to(roomId).emit('user-joined', socket.id);
    });
    
    socket.on('offer', ({ offer, roomId }) => {
        console.log(`Offer from ${socket.id} in room ${roomId}`);
        socket.to(roomId).emit('offer', offer);
    });
    
    socket.on('answer', ({ answer, roomId }) => {
        console.log(`Answer from ${socket.id} in room ${roomId}`);
        socket.to(roomId).emit('answer', answer);
    });
    
    socket.on('ice-candidate', ({ candidate, roomId }) => {
        socket.to(roomId).emit('ice-candidate', candidate);
    });
    
    socket.on('chat-message', ({ message, roomId }) => {
        socket.to(roomId).emit('chat-message', { message, sender: socket.id });
    });
    
    socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        console.log(`User ${socket.id} left room ${roomId}`);
        socket.to(roomId).emit('user-left', socket.id);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Notify all rooms this user was in
        io.emit('user-disconnected', socket.id);
    });
});

// Route for the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
