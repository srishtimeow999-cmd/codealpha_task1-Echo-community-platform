const express = require('express');
const User = require('../models/User');
const Post = require('../models/Post');
const { protect } = require('../middleware/auth');
const { enrichPosts } = require('../utils/postHelpers');

const router = express.Router();

const VALID_INTERESTS = [
  'technology', 'art', 'music', 'sports', 'travel', 'food', 'fashion', 'gaming',
];

router.get('/suggested', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    const followingIds = me.following.map((id) => id.toString());
    const exclude = new Set([me._id.toString(), ...followingIds]);

    let suggested = [];

    if (me.interests?.length) {
      suggested = await User.find({
        _id: { $ne: me._id, $nin: me.following },
        interests: { $in: me.interests },
      })
        .limit(8)
        .lean();
    }

    if (suggested.length < 4) {
      const more = await User.find({
        _id: { $ne: me._id, $nin: me.following },
      })
        .sort({ createdAt: -1 })
        .limit(8 - suggested.length)
        .lean();

      const seen = new Set(suggested.map((u) => u._id.toString()));
      for (const u of more) {
        if (!seen.has(u._id.toString())) suggested.push(u);
      }
    }

    const users = suggested
      .filter((u) => !exclude.has(u._id.toString()))
      .slice(0, 8)
      .map((u) => ({
        _id: u._id,
        username: u.username,
        displayName: u.displayName || u.username,
        avatar: u.avatar,
        bio: u.bio,
        interests: u.interests || [],
        sharedInterests: (u.interests || []).filter((i) => me.interests?.includes(i)),
        followersCount: u.followers?.length ?? 0,
        isFollowing: false,
      }));

    res.json({ suggested: users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:username', protect, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isFollowing = user.followers.some(
      (id) => id.toString() === req.user._id.toString()
    );

    res.json({
      user: user.toPublic(),
      isFollowing,
      isOwnProfile: user._id.toString() === req.user._id.toString(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/profile', protect, async (req, res) => {
  try {
    const { displayName, bio, avatar, interests } = req.body;
    const user = await User.findById(req.user._id);

    if (displayName !== undefined) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    if (interests !== undefined) {
      user.interests = interests.filter((i) => VALID_INTERESTS.includes(i));
    }

    await user.save();
    res.json({ user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/follow', protect, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (target._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    const alreadyFollowing = req.user.following.some(
      (id) => id.toString() === target._id.toString()
    );
    if (alreadyFollowing) {
      return res.status(400).json({ message: 'Already following' });
    }

    req.user.following.push(target._id);
    target.followers.push(req.user._id);
    await req.user.save();
    await target.save();

    res.json({
      message: 'Followed',
      followersCount: target.followers.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id/follow', protect, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.user.following = req.user.following.filter(
      (id) => id.toString() !== target._id.toString()
    );
    target.followers = target.followers.filter(
      (id) => id.toString() !== req.user._id.toString()
    );
    await req.user.save();
    await target.save();

    res.json({
      message: 'Unfollowed',
      followersCount: target.followers.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:username/posts', protect, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const posts = await Post.find({ author: user._id })
      .sort({ createdAt: -1 })
      .populate('author', 'username displayName avatar')
      .lean();

    res.json({ posts: await enrichPosts(posts, req.user._id) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
