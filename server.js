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

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/minimeet')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Import models
const User = require('./models/User');
const Message = require('./models/Message');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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
        maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
    }
});

app.use(sessionMiddleware);

// Import routes
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

// Use routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Main route - serve video call page if authenticated
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    res.sendFile(path.join(__dirname, 'views/videocall.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    socket.on('join-room', async ({ roomId, username }) => {
        socket.join(roomId);
        console.log(`User ${username} (${socket.id}) joined room ${roomId}`);
        
        // Notify other users in the room
        socket.to(roomId).emit('user-joined', username);
        
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
    
    socket.on('offer', ({ offer, roomId }) => {
        socket.to(roomId).emit('offer', offer);
    });
    
    socket.on('answer', ({ answer, roomId }) => {
        socket.to(roomId).emit('answer', answer);
    });
    
    socket.on('ice-candidate', ({ candidate, roomId }) => {
        socket.to(roomId).emit('ice-candidate', candidate);
    });
    
    socket.on('chat-message', async ({ message, roomId, sender }) => {
        socket.to(roomId).emit('chat-message', { message, sender });
        
        try {
            const newMessage = new Message({
                roomId,
                sender,
                message
            });
            await newMessage.save();
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });
    
    socket.on('leave-room', ({ roomId, username }) => {
        socket.leave(roomId);
        socket.to(roomId).emit('user-left', username);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
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
const PORT = 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Create initial users after MongoDB connection is established
    if (mongoose.connection.readyState === 1) {
        createInitialUsers();
    } else {
        mongoose.connection.once('open', createInitialUsers);
    }
});
