const express = require('express');
const fs = require('fs');
const path = require('path');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { enrichPost, enrichPosts } = require('../utils/postHelpers');

const router = express.Router();

router.get('/home', protect, async (req, res) => {
  try {
    const posts = await Post.find({ author: { $ne: req.user._id } })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('author', 'username displayName avatar')
      .lean();

    res.json({
      posts: await enrichPosts(posts, req.user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/feed', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    const authorIds = [me._id, ...me.following];

    const posts = await Post.find({ author: { $in: authorIds } })
      .sort({ createdAt: -1 })
      .populate('author', 'username displayName avatar')
      .lean();

    res.json({
      posts: await enrichPosts(posts, req.user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, upload.single('image'), async (req, res) => {
  try {
    const content = (req.body.content || '').trim();
    const image = req.file ? `/uploads/${req.file.filename}` : '';

    if (!content && !image) {
      return res.status(400).json({ message: 'Post must include text or an image' });
    }

    const post = await Post.create({
      author: req.user._id,
      content,
      image,
    });

    await post.populate('author', 'username displayName avatar');
    const obj = post.toObject();
    res.status(201).json({
      post: enrichPost({ ...obj, commentsCount: 0 }, req.user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username displayName avatar')
      .lean();

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const [enriched] = await enrichPosts([post], req.user._id);
    res.json({ post: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (post.image) {
      const filePath = path.join(__dirname, '../../public', post.image);
      fs.unlink(filePath, () => {});
    }

    await Comment.deleteMany({ post: post._id });
    await post.deleteOne();
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/like', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const alreadyLiked = post.likes.some((id) => id.toString() === req.user._id.toString());
    if (!alreadyLiked) {
      post.likes.push(req.user._id);
      await post.save();

      if (post.author.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: post.author,
          sender: req.user._id,
          type: 'like',
          post: post._id,
        });
      }
    }

    res.json({
      liked: true,
      likesCount: post.likes.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id/like', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.likes = post.likes.filter((id) => id.toString() !== req.user._id.toString());
    await post.save();

    res.json({
      liked: false,
      likesCount: post.likes.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/comments', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comments = await Comment.find({ post: req.params.id })
      .sort({ createdAt: 1 })
      .populate('author', 'username displayName avatar')
      .lean();

    res.json({
      comments,
      commentsCount: comments.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
