const express = require('express');
const User = require('../models/User');
const Post = require('../models/Post');
const SearchHistory = require('../models/SearchHistory');
const { protect } = require('../middleware/auth');
const { enrichPosts } = require('../utils/postHelpers');

const router = express.Router();
const MAX_HISTORY = 15;

async function saveSearchHistory(userId, query) {
  const q = query.trim().slice(0, 100);
  if (!q) return;

  await SearchHistory.findOneAndUpdate(
    { user: userId, query: q },
    { user: userId, query: q },
    { upsert: true, new: true }
  );

  const count = await SearchHistory.countDocuments({ user: userId });
  if (count > MAX_HISTORY) {
    const oldest = await SearchHistory.find({ user: userId })
      .sort({ updatedAt: 1 })
      .limit(count - MAX_HISTORY)
      .select('_id');
    await SearchHistory.deleteMany({ _id: { $in: oldest.map((o) => o._id) } });
  }
}

router.get('/', protect, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [{ username: regex }, { displayName: regex }],
    })
      .limit(12)
      .lean();

    const userResults = users.map((u) => ({
      _id: u._id,
      username: u.username,
      displayName: u.displayName || u.username,
      avatar: u.avatar,
      bio: u.bio,
      followersCount: u.followers?.length ?? 0,
    }));

    const posts = await Post.find({ content: regex })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('author', 'username displayName avatar')
      .lean();

    await saveSearchHistory(req.user._id, q);

    res.json({
      query: q,
      users: userResults,
      posts: await enrichPosts(posts, req.user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/history', protect, async (req, res) => {
  try {
    const history = await SearchHistory.find({ user: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(MAX_HISTORY)
      .lean();

    res.json({ history: history.map((h) => ({ query: h.query, searchedAt: h.updatedAt })) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/history', protect, async (req, res) => {
  try {
    await SearchHistory.deleteMany({ user: req.user._id });
    res.json({ message: 'Search history cleared' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/history/:query', protect, async (req, res) => {
  try {
    await SearchHistory.deleteOne({ user: req.user._id, query: req.params.query });
    res.json({ message: 'Removed from history' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
