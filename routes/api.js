const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};

// Get messages for a room
router.get('/messages/:roomId', isAuthenticated, async (req, res) => {
    try {
        const { roomId } = req.params;
        const messages = await Message.find({ roomId })
            .sort({ timestamp: 1 })
            .limit(100);
        
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
