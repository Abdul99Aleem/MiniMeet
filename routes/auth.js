const express = require('express');
const router = express.Router();
const User = require('../models/User');
const path = require('path');

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../views/login.html'));
});

// Register page
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../views/register.html'));
});

// Login API
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Find user
        const user = await User.findOne({ username });
        
        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }
        
        // Set session
        req.session.user = {
            id: user._id,
            username: user.username
        };
        
        console.log(`User ${username} logged in successfully`);
        res.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Register API
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Check if username exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }
        
        // Create new user
        const user = new User({ username, password });
        await user.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

module.exports = router;
