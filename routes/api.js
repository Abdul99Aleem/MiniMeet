const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
// Import shared state
const { activeRooms } = require('../shared');

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};

// Get current user
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
        return res.status(400).json({ exists: false, message: 'Room ID is required' });
    }
    
    try {
        // Check if room is in active rooms list
        const exists = activeRooms.has(roomId);
        
        // Debug log to see what's happening
        console.log(`Checking if room ${roomId} exists: ${exists}`);
        console.log(`Active rooms: ${Array.from(activeRooms)}`);
        
        res.json({ exists });
    } catch (error) {
        console.error('Error checking room:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
