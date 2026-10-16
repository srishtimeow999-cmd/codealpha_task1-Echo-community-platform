/**
 * /api/footprint — Echo Digital Footprint
 *
 * All endpoints require a valid JWT (protect middleware).
 * Only the signed-in user's own data is returned or mutated.
 * Passwords, JWT secrets and other sensitive fields are never exposed.
 */

const express = require('express');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Community = require('../models/Community');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ── Stage 1: Dashboard summary ─────────────────────────────────────────────

/**
 * GET /api/footprint/summary
 * Returns a single JSON object with all dashboard data for the signed-in user.
 * Includes: profile, own posts (with comment counts), own comments,
 * joined communities, follower/following counts, saved-post count.
 */
router.get('/summary', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Own posts, newest first, limited to 20 for the dashboard
    const posts = await Post.find({ author: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Attach comment counts to each post
    const postsWithCounts = await Promise.all(
      posts.map(async (p) => {
        const commentsCount = await Comment.countDocuments({ post: p._id });
        return {
          _id: p._id,
          content: p.content,
          image: p.image,
          likesCount: p.likes?.length ?? 0,
          commentsCount,
          createdAt: p.createdAt,
        };
      })
    );

    // Own comments, newest first, limited to 20
    const comments = await Comment.find({ author: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('post', 'content author')
      .lean();

    const commentsClean = comments.map((c) => ({
      _id: c._id,
      content: c.content,
      createdAt: c.createdAt,
      postId: c.post?._id ?? null,
      postSnippet: c.post?.content
        ? c.post.content.slice(0, 80) + (c.post.content.length > 80 ? '…' : '')
        : null,
    }));

    // Joined communities
    const communities = await Community.find({ members: user._id })
      .select('name category description image')
      .lean();

    res.json({
      profile: user.toPrivate(),
      stats: {
        postsCount: await Post.countDocuments({ author: user._id }),
        commentsCount: await Comment.countDocuments({ author: user._id }),
        followersCount: user.followers.length,
        followingCount: user.following.length,
        joinedCommunitiesCount: communities.length,
        savedPostsCount: user.savedPosts?.length ?? 0,
      },
      recentPosts: postsWithCounts,
      recentComments: commentsClean,
      joinedCommunities: communities,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Stage 2: Privacy & Security settings ───────────────────────────────────

/**
 * GET /api/footprint/privacy
 * Returns the current privacy settings for the signed-in user.
 */
router.get('/privacy', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      privacy: user.privacy || { profileVisibility: 'public', messagingPermission: 'everyone' },
      blockedUsersCount: user.blockedUsers?.length ?? 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/footprint/privacy
 * Updates profileVisibility and/or messagingPermission.
 * Body: { profileVisibility?, messagingPermission? }
 */
router.put('/privacy', protect, async (req, res) => {
  try {
    const { profileVisibility, messagingPermission } = req.body;

    const VALID_VISIBILITY = ['public', 'followers', 'private'];
    const VALID_MSG_PERM = ['everyone', 'followers', 'none'];

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.privacy) user.privacy = {};

    if (profileVisibility !== undefined) {
      if (!VALID_VISIBILITY.includes(profileVisibility)) {
        return res.status(400).json({ message: 'Invalid profileVisibility value' });
      }
      user.privacy.profileVisibility = profileVisibility;
    }

    if (messagingPermission !== undefined) {
      if (!VALID_MSG_PERM.includes(messagingPermission)) {
        return res.status(400).json({ message: 'Invalid messagingPermission value' });
      }
      user.privacy.messagingPermission = messagingPermission;
    }

    user.markModified('privacy');
    await user.save();

    res.json({
      message: 'Privacy settings updated',
      privacy: user.privacy,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/footprint/blocked
 * Returns the list of users blocked by the signed-in user (id, username, displayName, avatar).
 */
router.get('/blocked', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('blockedUsers', 'username displayName avatar')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    const blocked = (user.blockedUsers || []).map((u) => ({
      _id: u._id,
      username: u.username,
      displayName: u.displayName || u.username,
      avatar: u.avatar,
    }));

    res.json({ blocked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/footprint/blocked/:userId
 * Block a user. Cannot block yourself.
 */
router.post('/blocked/:userId', protect, async (req, res) => {
  try {
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot block yourself' });
    }

    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ message: 'User not found' });

    const user = await User.findById(req.user._id);

    const alreadyBlocked = user.blockedUsers?.some(
      (id) => id.toString() === req.params.userId
    );
    if (alreadyBlocked) {
      return res.status(400).json({ message: 'User already blocked' });
    }

    user.blockedUsers.push(target._id);
    // Also unfollow / remove from followers both ways
    user.following = user.following.filter((id) => id.toString() !== target._id.toString());
    user.followers = user.followers.filter((id) => id.toString() !== target._id.toString());
    await user.save();

    // Remove this user from the target's followers/following too
    target.following = target.following.filter((id) => id.toString() !== user._id.toString());
    target.followers = target.followers.filter((id) => id.toString() !== user._id.toString());
    await target.save();

    res.json({ message: 'User blocked', blockedUsersCount: user.blockedUsers.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/footprint/blocked/:userId
 * Unblock a user.
 */
router.delete('/blocked/:userId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const before = user.blockedUsers?.length ?? 0;
    user.blockedUsers = (user.blockedUsers || []).filter(
      (id) => id.toString() !== req.params.userId
    );

    if (user.blockedUsers.length === before) {
      return res.status(404).json({ message: 'User was not in blocked list' });
    }

    await user.save();
    res.json({ message: 'User unblocked', blockedUsersCount: user.blockedUsers.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/footprint/security
 * Returns observable security information — what is actually implemented,
 * without false claims (e.g. no session management claims).
 */
router.get('/security', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      security: {
        passwordHashed: true,           // bcryptjs is used — always true
        jwtAuth: true,                  // JWT is in use — always true
        tokenExpiry: '7 days',          // as configured in auth.js
        // The following are NOT implemented in this version:
        emailVerified: false,           // no email verification flow exists
        twoFactorEnabled: false,        // no 2FA flow exists
        activeSessions: null,           // no server-side session store exists
      },
      accountCreatedAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/footprint/posts/:id
 * Delete one of the signed-in user's own posts (ownership enforced server-side).
 */
router.delete('/posts/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }

    await Comment.deleteMany({ post: post._id });
    await post.deleteOne();
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/footprint/comments/:id
 * Delete one of the signed-in user's own comments (ownership enforced server-side).
 */
router.delete('/comments/:id', protect, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    await comment.deleteOne();
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
