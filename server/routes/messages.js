const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

function otherParticipant(conversation, userId) {
  return conversation.participants.find((id) => id.toString() !== userId.toString());
}

async function findOrCreateConversation(userId, otherUserId) {
  let conversation = await Conversation.findOne({
    participants: { $all: [userId, otherUserId], $size: 2 },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userId, otherUserId],
      lastMessage: '',
      lastMessageAt: new Date(),
    });
  }

  return conversation;
}

router.get('/', protect, async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .sort({ lastMessageAt: -1 })
      .lean();

    const list = await Promise.all(
      conversations.map(async (conv) => {
        const otherId = otherParticipant(conv, req.user._id);
        const user = await User.findById(otherId).select('username displayName avatar');
        if (!user) return null;

        return {
          _id: conv._id,
          otherUser: {
            _id: user._id,
            username: user.username,
            displayName: user.displayName || user.username,
            avatar: user.avatar,
          },
          lastMessage: conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
        };
      })
    );

    res.json({ conversations: list.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/with/:userId', protect, async (req, res) => {
  try {
    const other = await User.findById(req.params.userId);
    if (!other) {
      return res.status(404).json({ message: 'User not found' });
    }

    const conversation = await findOrCreateConversation(req.user._id, other._id);
    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .populate('sender', 'username displayName avatar')
      .lean();

    res.json({
      conversation: {
        _id: conversation._id,
        otherUser: {
          _id: other._id,
          username: other.username,
          displayName: other.displayName || other.username,
          avatar: other.avatar,
        },
      },
      messages,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/with/:userId', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const other = await User.findById(req.params.userId);
    if (!other) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (other._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot message yourself' });
    }

    const conversation = await findOrCreateConversation(req.user._id, other._id);
    const trimmed = text.trim();

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      text: trimmed,
    });

    conversation.lastMessage = trimmed;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    await message.populate('sender', 'username displayName avatar');

    res.status(201).json({ message });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
