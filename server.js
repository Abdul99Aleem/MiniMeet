const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Track active rooms
const activeRooms = new Set();

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/minimeet', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit if MongoDB connection fails
});

// Import models
const User = require('./models/User');
const Message = require('./models/Message');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Debug logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Session configuration
const sessionMiddleware = session({
    secret: 'minimeet_secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: 'mongodb://localhost:27017/minimeet',
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: { 
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        secure: false, // Set to true in production with HTTPS
        httpOnly: true
    }
});

app.use(sessionMiddleware);

// Share session with Socket.io
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Import routes
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

// Use routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Main route - check authentication and serve appropriate page
app.get('/', (req, res) => {
    try {
        const roomId = req.query.room;
        console.log(`Request to / with roomId: ${roomId}, user: ${req.session.user ? req.session.user.username : 'not logged in'}`);
        
        // If user is not authenticated, redirect to login
        if (!req.session.user) {
            // If there's a room ID, save it in the query params for redirect after login
            if (roomId) {
                return res.redirect(`/auth/login?redirect=/?room=${roomId}`);
            }
            return res.redirect('/auth/login');
        }
        
        // User is authenticated
        if (roomId) {
            // If room ID is provided, serve the video call page
            return res.sendFile(path.join(__dirname, 'views/videocall.html'));
        }
        
        // Otherwise serve the home page
        res.sendFile(path.join(__dirname, 'views/home.html'));
    } catch (error) {
        console.error('Error serving page:', error);
        res.status(500).send('Server error');
    }
});

// API endpoint to check if a room is active
app.get('/api/active-rooms', (req, res) => {
    res.json({ activeRooms: Array.from(activeRooms) });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    socket.on('join-room', async ({ roomId, username }) => {
        socket.join(roomId);
        console.log(`User ${username} (${socket.id}) joined room ${roomId}`);
        
        // Add room to active rooms
        activeRooms.add(roomId);
        
        // Store username in socket for future reference
        socket.username = username;
        
        // Get all users in the room
        const clients = io.sockets.adapter.rooms.get(roomId);
        
        // Notify the new user about all existing users in the room
        if (clients) {
            // Get all socket IDs in the room except the current user
            const existingUsers = Array.from(clients).filter(clientId => clientId !== socket.id);
            
            // For each existing user, get their username from their socket
            const usersInRoom = [];
            for (const clientId of existingUsers) {
                const clientSocket = io.sockets.sockets.get(clientId);
                if (clientSocket && clientSocket.username) {
                    usersInRoom.push({
                        peerId: clientId,
                        username: clientSocket.username
                    });
                }
            }
            
            // Send the list of existing users to the new user
            socket.emit('existing-users', usersInRoom);
        }
        
        // Notify other users in the room about the new user
        socket.to(roomId).emit('user-joined', { peerId: socket.id, username });
        
        // Send chat history
        try {
            const messages = await Message.find({ roomId })
                .sort({ timestamp: 1 })
                .limit(100);
            socket.emit('history-messages', messages);
        } catch (error) {
            console.error('Error fetching chat history:', error);
        }
    });
    
    socket.on('offer', ({ offer, roomId, peerId, username }) => {
        console.log(`Forwarding offer from ${username} to peer ${peerId} in room ${roomId}`);
        socket.to(peerId).emit('offer', { offer, peerId: socket.id, username });
    });
    
    socket.on('answer', ({ answer, roomId, peerId }) => {
        console.log(`Forwarding answer from ${socket.username} to peer ${peerId} in room ${roomId}`);
        socket.to(peerId).emit('answer', { answer, peerId: socket.id });
    });
    
    socket.on('ice-candidate', ({ candidate, roomId, peerId }) => {
        socket.to(peerId).emit('ice-candidate', { candidate, peerId: socket.id });
    });
    
    socket.on('chat-message', async ({ message, roomId, sender }) => {
        socket.to(roomId).emit('chat-message', { message, sender });
        
        try {
            const newMessage = new Message({
                roomId,
                sender,
                message,
                timestamp: new Date()
            });
            await newMessage.save();
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });
    
    socket.on('leave-room', ({ roomId, username }) => {
        socket.leave(roomId);
        socket.to(roomId).emit('user-left', { peerId: socket.id, username });
        
        // Check if this was the last user in the room
        const room = io.sockets.adapter.rooms.get(roomId);
        if (!room || room.size === 0) {
            activeRooms.delete(roomId);
            console.log(`Room ${roomId} is now inactive`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Find all rooms this socket was in
        const rooms = [];
        for (const [roomId, clients] of io.sockets.adapter.rooms.entries()) {
            if (typeof roomId === 'string' && roomId !== socket.id) {
                const room = io.sockets.adapter.rooms.get(roomId);
                if (room && !room.has(socket.id)) {
                    rooms.push(roomId);
                }
            }
        }
        
        // Notify other users in each room
        for (const roomId of rooms) {
            socket.to(roomId).emit('user-left', {
                peerId: socket.id,
                username: socket.username || 'Unknown User'
            });
            
            // Check if this was the last user in the room
            const room = io.sockets.adapter.rooms.get(roomId);
            if (!room || room.size === 0) {
                activeRooms.delete(roomId);
                console.log(`Room ${roomId} is now inactive`);
            }
        }
    });
});

// Create initial users if they don't exist
async function createInitialUsers() {
    try {
        const users = [
            { username: 'user1', password: 'password1' },
            { username: 'user2', password: 'password2' },
            { username: 'user3', password: 'password3' }
        ];
        
        for (const userData of users) { 
            // Check if user exists
            const existingUser = await User.findOne({ username: userData.username });
            if (!existingUser) {
                const user = new User(userData);
                await user.save();
                console.log(`Created user: ${userData.username}`);
            }
        }
        
        console.log('Initial users setup complete');
    } catch (error) {
        console.error('Error creating initial users:', error);
    }
}

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Create initial users after MongoDB connection is established
    if (mongoose.connection.readyState === 1) {
        createInitialUsers();
    } else {
        mongoose.connection.once('open', createInitialUsers);
    }
});

// Export the activeRooms set
module.exports = { activeRooms };
