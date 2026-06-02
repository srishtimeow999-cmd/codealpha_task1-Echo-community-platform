const express = require('express');
const Event = require('../models/Event');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET all events (supports category filter)
router.get('/', protect, async (req, res) => {
  try {
    const { category } = req.query;
    let query = {};
    
    if (category) {
      query.category = category;
    }
    
    const events = await Event.find(query).sort({ date: 1 }).lean();
    
    // Add RSVP flags for going & interested
    const enriched = events.map(e => ({
      ...e,
      isGoing: e.going ? e.going.some(id => id.toString() === req.user._id.toString()) : false,
      isInterested: e.interested ? e.interested.some(id => id.toString() === req.user._id.toString()) : false,
      goingCount: e.going ? e.going.length : 0,
      interestedCount: e.interested ? e.interested.length : 0
    }));
    
    res.json({ events: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET joined/RSVPed events
router.get('/joined', protect, async (req, res) => {
  try {
    const events = await Event.find({
      $or: [
        { going: req.user._id },
        { interested: req.user._id }
      ]
    }).sort({ date: 1 }).lean();
    
    const enriched = events.map(e => ({
      ...e,
      isGoing: e.going ? e.going.some(id => id.toString() === req.user._id.toString()) : false,
      isInterested: e.interested ? e.interested.some(id => id.toString() === req.user._id.toString()) : false,
      goingCount: e.going ? e.going.length : 0,
      interestedCount: e.interested ? e.interested.length : 0
    }));
    
    res.json({ events: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST RSVP: going or interested
router.post('/:id/rsvp', protect, async (req, res) => {
  try {
    const { type } = req.body; // 'going' or 'interested' or 'none' (cancel)
    if (!['going', 'interested', 'none'].includes(type)) {
      return res.status(400).json({ message: "RSVP type must be 'going', 'interested', or 'none'" });
    }
    
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    if (!event.going) event.going = [];
    if (!event.interested) event.interested = [];
    
    // Remove user from both arrays first to reset
    event.going = event.going.filter(id => id.toString() !== req.user._id.toString());
    event.interested = event.interested.filter(id => id.toString() !== req.user._id.toString());
    
    // Add user back to specific array if needed
    if (type === 'going') {
      event.going.push(req.user._id);
    } else if (type === 'interested') {
      event.interested.push(req.user._id);
    }
    
    await event.save();
    
    // Update User joinedEvents field
    const user = await User.findById(req.user._id);
    if (!user.joinedEvents) user.joinedEvents = [];
    
    // Filter out this event
    user.joinedEvents = user.joinedEvents.filter(eId => eId.toString() !== event._id.toString());
    
    // If going or interested, add to joinedEvents
    if (type === 'going' || type === 'interested') {
      user.joinedEvents.push(event._id);
    }
    await user.save();
    
    res.json({
      message: 'RSVP updated successfully',
      isGoing: type === 'going',
      isInterested: type === 'interested',
      goingCount: event.going.length,
      interestedCount: event.interested.length
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
