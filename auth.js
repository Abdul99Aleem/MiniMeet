const express = require('express');
const router = express.Router();
const User = require('../models/User');
const path = require('path');

// Serve login page
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../views/login.html'));
});

// Handle login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Set session
    req.session.user = {
      id: user._id,
      username: user.username
    };
    
    res.json({ success: true, username: user.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Handle logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
});

// Check if user is authenticated
router.get('/check', (req, res) => {
  if (req.session.user) {
    return res.json({ 
      authenticated: true, 
      user: req.session.user 
    });
  }
  res.json({ authenticated: false });
});

module.exports = router;
