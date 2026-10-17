const express = require('express');
const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const jwt = require('jsonwebtoken');

const router = express.Router();

const VALID_CATEGORIES = [
  'Electronics',
  'Vehicles',
  'Home & Garden',
  'Clothing & Accessories',
  'Furniture',
  'Books & Hobbies',
  'Toys & Games',
  'Free Stuff',
  'Other',
];

const VALID_CONDITIONS = ['New', 'Like New', 'Good', 'Fair'];
const VALID_STATUSES = ['Available', 'Pending', 'Sold'];
const VALID_DELIVERY_TYPES = [
  'Local pickup',
  'Public meetup',
  'Drop-off available',
  'Shipping available',
];
const VALID_REPORT_REASONS = [
  'spam',
  'inappropriate',
  'fraud_or_scam',
  'prohibited_item',
  'other',
];

// Helper: optional auth to inspect user without rejecting guests
async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (user) req.user = user;
    } catch {
      // Ignore token errors for optional auth
    }
  }
  next();
}

/**
 * GET /api/marketplace/stats
 * Aggregate stats: total active items, free items, category counts
 */
router.get('/stats', async (_req, res) => {
  try {
    const counts = await Listing.aggregate([
      { $match: { isArchived: { $ne: true }, status: 'Available' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    const categoryCounts = {};
    VALID_CATEGORIES.forEach((cat) => {
      categoryCounts[cat] = 0;
    });
    counts.forEach((item) => {
      if (categoryCounts[item._id] !== undefined) {
        categoryCounts[item._id] = item.count;
      }
    });

    const totalActive = await Listing.countDocuments({
      isArchived: { $ne: true },
      status: 'Available',
    });
    const freeCount = await Listing.countDocuments({
      isArchived: { $ne: true },
      status: 'Available',
      price: 0,
    });

    res.json({
      totalActive,
      freeCount,
      categories: categoryCounts,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/marketplace/categories
 * Returns all categories with active counts
 */
router.get('/categories', async (_req, res) => {
  try {
    const counts = await Listing.aggregate([
      { $match: { isArchived: { $ne: true }, status: 'Available' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    const countMap = {};
    counts.forEach((c) => {
      countMap[c._id] = c.count;
    });

    const categories = VALID_CATEGORIES.map((cat) => ({
      name: cat,
      count: countMap[cat] || 0,
    }));

    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/marketplace/listings
 * Browse listings with search, category, condition, price range, and sort
 */
router.get('/listings', optionalAuth, async (req, res) => {
  try {
    const {
      search,
      category,
      condition,
      minPrice,
      maxPrice,
      freeOnly,
      location,
      status,
      sort,
      filter,
      seller,
      page = 1,
      limit = 24,
    } = req.query;

    const query = { isArchived: { $ne: true } };

    // Status filter
    if (status && status !== 'all') {
      if (VALID_STATUSES.includes(status)) {
        query.status = status;
      }
    } else if (!status) {
      // Default: show Available only on public browse
      if (filter !== 'mine') {
        query.status = 'Available';
      }
    }

    // Category filter
    if (category && category !== 'all') {
      if (VALID_CATEGORIES.includes(category)) {
        query.category = category;
      }
    }

    // Condition filter
    if (condition && condition !== 'all') {
      if (VALID_CONDITIONS.includes(condition)) {
        query.condition = condition;
      }
    }

    // Free items filter
    if (freeOnly === 'true' || category === 'Free Stuff') {
      query.price = 0;
    } else {
      // Price range
      if (minPrice !== undefined && minPrice !== '') {
        const min = parseFloat(minPrice);
        if (!isNaN(min)) query.price = { ...(query.price || {}), $gte: min };
      }
      if (maxPrice !== undefined && maxPrice !== '') {
        const max = parseFloat(maxPrice);
        if (!isNaN(max)) query.price = { ...(query.price || {}), $lte: max };
      }
    }

    // Location keyword search
    if (location && location.trim()) {
      query.location = { $regex: location.trim(), $options: 'i' };
    }

    // Keyword search
    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { title: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
        { location: { $regex: term, $options: 'i' } },
        { category: { $regex: term, $options: 'i' } },
      ];
    }

    // Specific Seller filter
    if (seller) {
      if (mongoose.Types.ObjectId.isValid(seller)) {
        query.seller = seller;
      }
    }

    // View tab filters (mine / saved)
    if (filter === 'mine') {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required to view your listings' });
      }
      query.seller = req.user._id;
      // Do not restrict status for owner listings
      if (!status || status === 'all') delete query.status;
    } else if (filter === 'saved') {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required to view saved listings' });
      }
      const me = await User.findById(req.user._id).select('savedListings');
      query._id = { $in: me?.savedListings || [] };
    }

    // Sorting
    let sortObj = { createdAt: -1 };
    if (sort === 'price_asc' || sort === 'price_low') {
      sortObj = { price: 1, createdAt: -1 };
    } else if (sort === 'price_desc' || sort === 'price_high') {
      sortObj = { price: -1, createdAt: -1 };
    } else if (sort === 'popular') {
      sortObj = { views: -1, createdAt: -1 };
    } else if (sort === 'oldest') {
      sortObj = { createdAt: 1 };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const skip = (pageNum - 1) * limitNum;

    const [listings, total] = await Promise.all([
      Listing.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .populate('seller', 'username displayName avatar createdAt')
        .lean(),
      Listing.countDocuments(query),
    ]);

    // Enrich with saved state and ownership
    const currentUserId = req.user?._id?.toString();
    const enriched = listings.map((item) => {
      const isSaved = currentUserId
        ? (item.saves || []).some((s) => s.toString() === currentUserId)
        : false;
      const isOwner = currentUserId ? item.seller?._id?.toString() === currentUserId : false;

      return {
        ...item,
        isSaved,
        isOwner,
        seller: item.seller
          ? {
              _id: item.seller._id,
              username: item.seller.username,
              displayName: item.seller.displayName || item.seller.username,
              avatar: item.seller.avatar,
              memberSince: item.seller.createdAt,
            }
          : null,
      };
    });

    res.json({
      listings: enriched,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/marketplace/listings/:id
 * Single listing details + increment view count
 */
router.get('/listings/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid listing ID' });
    }

    const listing = await Listing.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    ).populate('seller', 'username displayName avatar bio createdAt');

    if (!listing || listing.isArchived) {
      return res.status(404).json({ message: 'Listing not found or has been removed' });
    }

    const currentUserId = req.user?._id?.toString();
    const isSaved = currentUserId
      ? (listing.saves || []).some((s) => s.toString() === currentUserId)
      : false;
    const isOwner = currentUserId ? listing.seller?._id?.toString() === currentUserId : false;

    // Fetch up to 4 other available listings from the same seller
    let moreFromSeller = [];
    if (listing.seller?._id) {
      moreFromSeller = await Listing.find({
        seller: listing.seller._id,
        _id: { $ne: listing._id },
        status: 'Available',
        isArchived: { $ne: true },
      })
        .limit(4)
        .select('title price images location condition status createdAt')
        .lean();
    }

    res.json({
      listing: {
        ...listing.toObject(),
        isSaved,
        isOwner,
      },
      moreFromSeller,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/marketplace/listings
 * Create new marketplace listing (supports multi-image upload & json)
 */
router.post(
  '/listings',
  protect,
  (req, res, next) => {
    // Wrap upload.array to handle multipart or JSON body gracefully
    upload.array('images', 8)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const {
        title,
        price,
        category,
        condition,
        description,
        location,
        deliveryType,
        imageUrl,
      } = req.body;

      // Validation
      if (!title || title.trim().length < 3) {
        return res.status(400).json({ message: 'Title must be at least 3 characters long' });
      }
      if (title.trim().length > 120) {
        return res.status(400).json({ message: 'Title cannot exceed 120 characters' });
      }

      if (price === undefined || price === null || price === '') {
        return res.status(400).json({ message: 'Price is required (enter 0 for free items)' });
      }
      const numPrice = parseFloat(price);
      if (isNaN(numPrice) || numPrice < 0) {
        return res.status(400).json({ message: 'Price must be a positive number or 0' });
      }

      if (!category || !VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
          message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`,
        });
      }

      if (condition && !VALID_CONDITIONS.includes(condition)) {
        return res.status(400).json({
          message: `Condition must be one of: ${VALID_CONDITIONS.join(', ')}`,
        });
      }

      if (!description || description.trim().length < 5) {
        return res.status(400).json({ message: 'Description must be at least 5 characters long' });
      }

      // Collect images
      let imagePaths = [];
      if (req.files && req.files.length > 0) {
        imagePaths = req.files.map((f) => `/uploads/${f.filename}`);
      } else if (req.body.images) {
        if (Array.isArray(req.body.images)) {
          imagePaths = req.body.images.filter(Boolean);
        } else if (typeof req.body.images === 'string') {
          try {
            const parsed = JSON.parse(req.body.images);
            if (Array.isArray(parsed)) imagePaths = parsed;
            else imagePaths = [req.body.images];
          } catch {
            imagePaths = [req.body.images];
          }
        }
      }

      if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
        imagePaths.unshift(imageUrl.trim());
      }

      const listing = await Listing.create({
        title: title.trim(),
        price: numPrice,
        category,
        condition: condition || 'Good',
        description: description.trim(),
        location: location && location.trim() ? location.trim() : 'Campus / Local Area',
        deliveryType: VALID_DELIVERY_TYPES.includes(deliveryType)
          ? deliveryType
          : 'Local pickup',
        images: imagePaths,
        seller: req.user._id,
        status: 'Available',
      });

      const populated = await Listing.findById(listing._id)
        .populate('seller', 'username displayName avatar createdAt')
        .lean();

      res.status(201).json({
        message: 'Listing created successfully',
        listing: {
          ...populated,
          isOwner: true,
          isSaved: false,
        },
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/**
 * PUT /api/marketplace/listings/:id
 * Edit listing (Owner only)
 */
router.put(
  '/listings/:id',
  protect,
  (req, res, next) => {
    upload.array('images', 8)(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid listing ID' });
      }

      const listing = await Listing.findById(id);
      if (!listing || listing.isArchived) {
        return res.status(404).json({ message: 'Listing not found' });
      }

      if (!listing.seller.equals(req.user._id)) {
        return res.status(403).json({ message: 'Only the seller can update this listing' });
      }

      const {
        title,
        price,
        category,
        condition,
        description,
        location,
        deliveryType,
        status,
        imageUrl,
      } = req.body;

      if (title !== undefined) {
        if (title.trim().length < 3 || title.trim().length > 120) {
          return res.status(400).json({ message: 'Title must be between 3 and 120 characters' });
        }
        listing.title = title.trim();
      }

      if (price !== undefined && price !== '') {
        const numPrice = parseFloat(price);
        if (isNaN(numPrice) || numPrice < 0) {
          return res.status(400).json({ message: 'Price must be 0 or a positive number' });
        }
        listing.price = numPrice;
      }

      if (category !== undefined) {
        if (!VALID_CATEGORIES.includes(category)) {
          return res.status(400).json({ message: 'Invalid category' });
        }
        listing.category = category;
      }

      if (condition !== undefined) {
        if (!VALID_CONDITIONS.includes(condition)) {
          return res.status(400).json({ message: 'Invalid condition' });
        }
        listing.condition = condition;
      }

      if (description !== undefined) {
        if (description.trim().length < 5) {
          return res.status(400).json({ message: 'Description must be at least 5 characters' });
        }
        listing.description = description.trim();
      }

      if (location !== undefined) {
        listing.location = location.trim() || 'Campus / Local Area';
      }

      if (deliveryType !== undefined && VALID_DELIVERY_TYPES.includes(deliveryType)) {
        listing.deliveryType = deliveryType;
      }

      if (status !== undefined && VALID_STATUSES.includes(status)) {
        listing.status = status;
      }

      // Handle new uploaded images or provided image URLs
      if (req.files && req.files.length > 0) {
        const newPaths = req.files.map((f) => `/uploads/${f.filename}`);
        listing.images = [...listing.images, ...newPaths];
      }
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
        listing.images = [imageUrl.trim(), ...listing.images];
      }
      if (req.body.existingImages !== undefined) {
        try {
          const kept = Array.isArray(req.body.existingImages)
            ? req.body.existingImages
            : JSON.parse(req.body.existingImages);
          if (Array.isArray(kept)) {
            listing.images = kept;
          }
        } catch {
          // Keep existing if unparseable
        }
      }

      await listing.save();
      const updated = await Listing.findById(listing._id)
        .populate('seller', 'username displayName avatar createdAt')
        .lean();

      res.json({
        message: 'Listing updated successfully',
        listing: {
          ...updated,
          isOwner: true,
        },
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/**
 * PATCH /api/marketplace/listings/:id/status
 * Quick toggle status: Available | Pending | Sold (Owner only)
 */
router.patch('/listings/:id/status', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid listing ID' });
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const listing = await Listing.findById(id);
    if (!listing || listing.isArchived) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    if (!listing.seller.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the seller can change the status' });
    }

    listing.status = status;
    await listing.save();

    res.json({
      message: `Listing marked as ${status}`,
      status: listing.status,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/marketplace/listings/:id
 * Delete / Archive listing (Owner only)
 */
router.delete('/listings/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid listing ID' });
    }

    const listing = await Listing.findById(id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    if (!listing.seller.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the seller can delete this listing' });
    }

    await Listing.findByIdAndDelete(id);

    // Pull from all users' savedListings
    await User.updateMany(
      { savedListings: id },
      { $pull: { savedListings: id } }
    );

    res.json({ message: 'Listing deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/marketplace/listings/:id/save
 * Toggle save / bookmark listing
 */
router.post('/listings/:id/save', protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid listing ID' });
    }

    const listing = await Listing.findById(id);
    if (!listing || listing.isArchived) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    const user = await User.findById(req.user._id);
    const userIdStr = user._id.toString();

    const alreadySaved = (listing.saves || []).some((s) => s.toString() === userIdStr);

    if (alreadySaved) {
      listing.saves = listing.saves.filter((s) => s.toString() !== userIdStr);
      listing.savesCount = Math.max(0, (listing.savesCount || 1) - 1);
      user.savedListings = (user.savedListings || []).filter((l) => l.toString() !== id);
    } else {
      listing.saves.push(user._id);
      listing.savesCount = (listing.savesCount || 0) + 1;
      if (!user.savedListings) user.savedListings = [];
      if (!user.savedListings.some((l) => l.toString() === id)) {
        user.savedListings.push(listing._id);
      }
    }

    await Promise.all([listing.save(), user.save()]);

    res.json({
      saved: !alreadySaved,
      savesCount: listing.savesCount,
      message: !alreadySaved ? 'Listing saved to your items' : 'Listing removed from saved items',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/marketplace/listings/:id/inquire
 * Send inquiry message directly to the seller via Echo Chat/Messages system
 */
router.post('/listings/:id/inquire', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid listing ID' });
    }

    const listing = await Listing.findById(id).populate('seller', 'username displayName');
    if (!listing || listing.isArchived) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    if (listing.seller._id.equals(req.user._id)) {
      return res.status(400).json({ message: 'You cannot message yourself about your own listing' });
    }

    const inquiryText = (message || '').trim() || 'Hi, is this still available?';
    const messageContent = `[Marketplace: ${listing.title} - $${listing.price}]\n${inquiryText}`;

    // Find or create conversation between buyer and seller
    let conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, listing.seller._id], $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user._id, listing.seller._id],
        lastMessage: messageContent,
        lastMessageAt: new Date(),
      });
    } else {
      conversation.lastMessage = messageContent;
      conversation.lastMessageAt = new Date();
      await conversation.save();
    }

    // Insert direct message
    const newMessage = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      text: messageContent,
    });

    // Increment listing inquiries count
    listing.inquiriesCount = (listing.inquiriesCount || 0) + 1;
    await listing.save();

    res.status(201).json({
      success: true,
      message: `Message sent to ${listing.seller.displayName || listing.seller.username}!`,
      conversationId: conversation._id,
      sentMessage: newMessage,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/marketplace/listings/:id/report
 * Report an inappropriate or fraudulent listing
 */
router.post('/listings/:id/report', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'other', details = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid listing ID' });
    }
    if (!VALID_REPORT_REASONS.includes(reason)) {
      return res.status(400).json({
        message: `Report reason must be one of: ${VALID_REPORT_REASONS.join(', ')}`,
      });
    }

    const listing = await Listing.findById(id);
    if (!listing || listing.isArchived) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    if (listing.seller.equals(req.user._id)) {
      return res.status(400).json({ message: 'You cannot report your own listing' });
    }

    const alreadyReported = (listing.reports || []).some(
      (r) => r.reporter.toString() === req.user._id.toString()
    );
    if (alreadyReported) {
      return res.status(400).json({ message: 'You have already reported this listing' });
    }

    listing.reports.push({
      reporter: req.user._id,
      reason,
      details: details.slice(0, 500),
    });
    listing.reportCount = (listing.reportCount || 0) + 1;

    // Auto-archive if 5+ reports
    if (listing.reportCount >= 5) {
      listing.isArchived = true;
    }

    await listing.save();

    res.json({
      message: 'Thank you for reporting this listing. Our team will review it promptly.',
      reportCount: listing.reportCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
