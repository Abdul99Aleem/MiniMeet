const express = require('express');
const router = express.Router();
const path = require('path');
const User = require('../models/User');

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../views/login.html'));
});

// Login API
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }
        
        // Find user
        const user = await User.findOne({ username });
        
        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }
        
        // Set user in session
        req.session.user = {
            id: user._id,
            username: user.username
        };
        
        res.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Check authentication status
router.get('/check', (req, res) => {
    if (req.session.user) {
        return res.json({
            authenticated: true,
            user: req.session.user
        });
    }
    
    res.json({ authenticated: false });
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

module.exports = router;
