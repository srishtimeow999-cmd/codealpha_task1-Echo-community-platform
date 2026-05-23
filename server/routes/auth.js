const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName, interests } = req.body;
    const validInterests = [
      'technology', 'art', 'music', 'sports', 'travel', 'food', 'fashion', 'gaming',
    ];
    const userInterests = Array.isArray(interests)
      ? interests.filter((i) => validInterests.includes(i))
      : [];
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      return res.status(400).json({ message: 'Username or email already in use' });
    }

    const user = await User.create({
      username,
      email,
      password,
      displayName,
      interests: userInterests,
    });
    const token = signToken(user._id);

    res.status(201).json({
      token,
      user: user.toPublic(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({
      token: signToken(user._id),
      user: user.toPublic(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', protect, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

module.exports = router;
