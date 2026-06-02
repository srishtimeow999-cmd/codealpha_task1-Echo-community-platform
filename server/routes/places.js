const express = require('express');
const Place = require('../models/Place');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET all places (supports search, category, and underrated filters)
router.get('/', protect, async (req, res) => {
  try {
    const { search, category, underrated } = req.query;
    let query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (underrated === 'true') {
      // Underrated Nearby filter: isUnderrated: true, or rating high but fewer reviews
      // The dataset has isUnderrated explicitly defined, so we use it directly!
      query.isUnderrated = true;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    
    const places = await Place.find(query).lean();
    
    // Add isSaved flag
    const enriched = places.map(p => ({
      ...p,
      isSaved: p.savedBy ? p.savedBy.some(userId => userId.toString() === req.user._id.toString()) : false,
      reviewsCount: p.reviews ? p.reviews.length : 0
    }));
    
    res.json({ places: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET saved places
router.get('/saved', protect, async (req, res) => {
  try {
    const places = await Place.find({ savedBy: req.user._id }).lean();
    const enriched = places.map(p => ({
      ...p,
      isSaved: true,
      reviewsCount: p.reviews ? p.reviews.length : 0
    }));
    res.json({ places: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST Save/Bookmark a place
router.post('/:id/save', protect, async (req, res) => {
  try {
    const place = await Place.findById(req.params.id);
    if (!place) {
      return res.status(404).json({ message: 'Place not found' });
    }
    
    if (!place.savedBy) place.savedBy = [];
    
    const alreadySaved = place.savedBy.some(id => id.toString() === req.user._id.toString());
    if (alreadySaved) {
      return res.status(400).json({ message: 'Place already saved' });
    }
    
    place.savedBy.push(req.user._id);
    await place.save();
    
    // Add to User's savedPlaces array
    const user = await User.findById(req.user._id);
    if (!user.savedPlaces) user.savedPlaces = [];
    if (!user.savedPlaces.includes(place._id)) {
      user.savedPlaces.push(place._id);
      await user.save();
    }
    
    res.json({ message: 'Place saved successfully', isSaved: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE Save/Bookmark a place (Unsave)
router.delete('/:id/save', protect, async (req, res) => {
  try {
    const place = await Place.findById(req.params.id);
    if (!place) {
      return res.status(404).json({ message: 'Place not found' });
    }
    
    if (place.savedBy) {
      place.savedBy = place.savedBy.filter(id => id.toString() !== req.user._id.toString());
      await place.save();
    }
    
    // Remove from User's savedPlaces
    const user = await User.findById(req.user._id);
    if (user.savedPlaces) {
      user.savedPlaces = user.savedPlaces.filter(id => id.toString() !== place._id.toString());
      await user.save();
    }
    
    res.json({ message: 'Place removed from saved', isSaved: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST add a review to a place
router.post('/:id/review', protect, async (req, res) => {
  try {
    const { rating, content } = req.body;
    const ratingNum = Number(rating);
    
    if (!ratingNum || ratingNum < 1 || ratingNum > 5 || !content || !content.trim()) {
      return res.status(400).json({ message: 'Valid rating (1-5) and content are required' });
    }
    
    const place = await Place.findById(req.params.id);
    if (!place) {
      return res.status(404).json({ message: 'Place not found' });
    }
    
    const authorName = req.user.displayName || req.user.username;
    
    const newReview = {
      author: authorName,
      authorId: req.user._id,
      rating: ratingNum,
      content: content.trim()
    };
    
    if (!place.reviews) place.reviews = [];
    place.reviews.push(newReview);
    
    // Recalculate average rating
    const totalRating = place.reviews.reduce((sum, rev) => sum + rev.rating, 0);
    place.rating = Number((totalRating / place.reviews.length).toFixed(1));
    
    await place.save();
    
    res.status(201).json({ 
      message: 'Review added successfully', 
      review: newReview,
      averageRating: place.rating,
      reviewsCount: place.reviews.length
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
