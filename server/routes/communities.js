const express = require('express');
const Community = require('../models/Community');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET all communities (with search filter)
router.get('/', protect, async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
    }
    const communities = await Community.find(query).lean();
    
    // Add isJoined flag
    const enriched = communities.map(c => ({
      ...c,
      isJoined: c.members.some(m => m.toString() === req.user._id.toString()),
      memberCount: c.members.length
    }));
    
    res.json({ communities: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET joined communities
router.get('/joined', protect, async (req, res) => {
  try {
    const communities = await Community.find({ members: req.user._id }).lean();
    const enriched = communities.map(c => ({
      ...c,
      isJoined: true,
      memberCount: c.members.length
    }));
    res.json({ communities: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET trending communities
router.get('/trending', protect, async (req, res) => {
  try {
    const communities = await Community.find().lean();
    // Sort by member count descending
    communities.sort((a, b) => b.members.length - a.members.length);
    const enriched = communities.slice(0, 5).map(c => ({
      ...c,
      isJoined: c.members.some(m => m.toString() === req.user._id.toString()),
      memberCount: c.members.length
    }));
    res.json({ communities: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET recommended communities based on user interests
router.get('/recommendations', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const userInterests = user.interests || [];
    
    // Find communities where category matches user interests, or just get some
    // Map user interests (e.g. technology, art, music, sports, travel, food, fashion, gaming) to community categories:
    // Categories: ['Small business', 'Educational', 'Protest and activism', 'Donation drive', 'Shelter and volunteer', 'Environmental']
    let matchCategories = [];
    if (userInterests.includes('travel') || userInterests.includes('food')) matchCategories.push('Small business');
    if (userInterests.includes('technology')) matchCategories.push('Educational');
    if (userInterests.includes('art') || userInterests.includes('music')) matchCategories.push('Small business');
    
    let query = { members: { $ne: req.user._id } }; // recommend not joined
    if (matchCategories.length > 0) {
      query.category = { $in: matchCategories };
    }
    
    let recommended = await Community.find(query).limit(5).lean();
    
    if (recommended.length === 0) {
      // Fallback: just get any communities they haven't joined
      recommended = await Community.find({ members: { $ne: req.user._id } }).limit(5).lean();
    }
    
    const enriched = recommended.map(c => ({
      ...c,
      isJoined: false,
      memberCount: c.members.length
    }));
    
    res.json({ communities: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST Join Community
router.post('/:id/join', protect, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    const isMember = community.members.some(m => m.toString() === req.user._id.toString());
    if (isMember) {
      return res.status(400).json({ message: 'Already a member' });
    }
    
    community.members.push(req.user._id);
    await community.save();
    
    // Add to user joinedCommunities
    const user = await User.findById(req.user._id);
    if (!user.joinedCommunities.includes(community._id)) {
      user.joinedCommunities.push(community._id);
      await user.save();
    }
    
    res.json({ 
      message: 'Joined successfully', 
      memberCount: community.members.length,
      isJoined: true
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST Leave Community
router.post('/:id/leave', protect, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    community.members = community.members.filter(m => m.toString() !== req.user._id.toString());
    await community.save();
    
    // Remove from user joinedCommunities
    const user = await User.findById(req.user._id);
    user.joinedCommunities = user.joinedCommunities.filter(cId => cId.toString() !== community._id.toString());
    await user.save();
    
    res.json({ 
      message: 'Left successfully', 
      memberCount: community.members.length,
      isJoined: false
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST Add Announcement/Update to a Community
router.post('/:id/updates', protect, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content || !title.trim() || !content.trim()) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    const update = {
      title: title.trim(),
      content: content.trim(),
      createdAt: new Date()
    };
    
    community.updates.unshift(update); // Newest updates first
    await community.save();
    
    res.status(201).json({ message: 'Update added successfully', update });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
