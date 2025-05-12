const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { activeRooms } = require('../server');

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};



// Get messages for a room
router.get('/user', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    
    res.json({ user: req.session.user });
});

// Check if a room exists
router.get('/check-room', async (req, res) => {
    const { roomId } = req.query;
    
    if (!roomId) {
        return res.status(400).json({ message: 'Room ID is required' });
    }
    
    try {
        // Check if there are any messages in this room
        const messages = await Message.find({ roomId }).limit(1);
        
        // A room exists if it's in the active rooms list or if there are messages for it
        const exists = activeRooms.has(roomId) || messages.length > 0;
        
        res.json({ exists });
    } catch (error) {
        console.error('Error checking room:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;
