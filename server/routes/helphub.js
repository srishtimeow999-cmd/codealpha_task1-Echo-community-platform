const express = require('express');
const mongoose = require('mongoose');
const HelpRequest = require('../models/HelpRequest');
const HelpResponse = require('../models/HelpResponse');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

const router = express.Router();

const VALID_CATEGORIES = ['education', 'community', 'personal', 'offer_help'];
const VALID_TYPES = ['need_help', 'offer_help'];
const VALID_URGENCIES = ['low', 'medium', 'high'];
const VALID_STATUSES = [
  'Open',
  'Responses Received',
  'Accepted',
  'In Progress',
  'Completed',
  'Cancelled',
  'Closed',
];
const VALID_REPORT_REASONS = [
  'spam',
  'inappropriate',
  'safety_concern',
  'fraud_or_scam',
  'other',
];

// Optional auth helper: extracts user if token provided without rejecting anonymous visitors
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

// Safety input validator to prevent exposing personal phone numbers or email addresses in public requests
function sanitizeContent(text) {
  if (!text) return '';
  // Check for 10+ digit phone numbers or standard phone patterns
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  if (phoneRegex.test(text)) {
    throw new Error('For your safety and privacy, public phone numbers are not permitted. Please communicate securely through Echo messages.');
  }
  if (emailRegex.test(text)) {
    throw new Error('For your safety and privacy, personal email addresses are not permitted in public requests. Please communicate securely through Echo messages.');
  }

  return text.trim();
}

function sanitizeLocation(loc) {
  if (!loc) return '';
  const trimmed = loc.trim();
  // Disallow detailed street numbers/addresses like "123 Maple St, Apt 4"
  const streetAddressRegex = /\b\d{1,5}\s+[A-Za-z0-9\s.,#]{3,}\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|apartment|apt|suite|ste)\b/i;
  if (streetAddressRegex.test(trimmed)) {
    throw new Error('Please use a general location only (such as "North Campus", "Downtown", or "East District") to protect your privacy. Never share your exact home address.');
  }
  return trimmed.slice(0, 100);
}

// Emergency service disclaimer payload
const EMERGENCY_DISCLAIMER =
  'Echo Help Hub is a peer-to-peer community assistance platform for everyday requests and social causes. It is not an emergency service. In an emergency, contact local emergency services immediately.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. STATS / SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /api/helphub/stats
 * Real aggregated counts of active requests by category, no hardcoded or fake numbers.
 */
router.get('/stats', async (_req, res) => {
  try {
    const activeStatuses = ['Open', 'Responses Received', 'Accepted', 'In Progress'];

    const counts = await HelpRequest.aggregate([
      { $match: { isArchived: { $ne: true }, status: { $in: activeStatuses } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    const stats = {
      education: 0,
      community: 0,
      personal: 0,
      offer_help: 0,
      totalActive: 0,
    };

    counts.forEach((c) => {
      if (stats[c._id] !== undefined) {
        stats[c._id] = c.count;
      }
      stats.totalActive += c.count;
    });

    const totalResolved = await HelpRequest.countDocuments({
      status: 'Completed',
      isArchived: { $ne: true },
    });
    stats.totalResolved = totalResolved;

    res.json({
      disclaimer: EMERGENCY_DISCLAIMER,
      stats,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LIST & SEARCH REQUESTS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /api/helphub/requests
 * Browse, search, filter, and sort help requests.
 * Query parameters:
 *  - category: 'education' | 'community' | 'personal' | 'offer_help' | 'all'
 *  - type: 'need_help' | 'offer_help' | 'all'
 *  - status: 'active' | 'Open' | 'Responses Received' | 'Accepted' | 'In Progress' | 'Completed' | 'Cancelled' | 'Closed' | 'all'
 *  - location: string (case-insensitive general location search)
 *  - search: string (text query across title, description, tags, location)
 *  - urgency: 'low' | 'medium' | 'high' | 'all'
 *  - sort: 'newest' (default) | 'oldest' | 'urgency' | 'responses'
 *  - mine: 'true' (filter to requests created by current user)
 *  - myResponses: 'true' (filter to requests current user responded to)
 *  - page, limit: pagination
 */
router.get('/requests', optionalAuth, async (req, res) => {
  try {
    const {
      category,
      type,
      status,
      location,
      search,
      urgency,
      sort,
      mine,
      myResponses,
      page = 1,
      limit = 20,
    } = req.query;

    const query = { isArchived: { $ne: true } };

    // Block filtering: If user is logged in, exclude requests by blocked users or users who blocked them
    if (req.user) {
      const blockedByIds = req.user.blockedUsers || [];
      const usersWhoBlockedMe = await User.find({ blockedUsers: req.user._id }).select('_id');
      const excludedAuthorIds = [
        ...blockedByIds,
        ...usersWhoBlockedMe.map((u) => u._id),
      ];
      if (excludedAuthorIds.length > 0) {
        query.author = { $nin: excludedAuthorIds };
      }
    }

    // Category filter
    if (category && category !== 'all') {
      if (VALID_CATEGORIES.includes(category)) {
        query.category = category;
      }
    }

    // Request type filter ('need_help' vs 'offer_help')
    if (type && type !== 'all') {
      if (VALID_TYPES.includes(type)) {
        query.requestType = type;
      }
    }

    // Status filter
    if (status && status !== 'all') {
      if (status === 'active') {
        query.status = { $in: ['Open', 'Responses Received', 'Accepted', 'In Progress'] };
      } else if (VALID_STATUSES.includes(status)) {
        query.status = status;
      }
    }

    // Urgency filter
    if (urgency && urgency !== 'all' && VALID_URGENCIES.includes(urgency)) {
      query.urgency = urgency;
    }

    // General location filter
    if (location && location.trim()) {
      query.generalLocation = { $regex: location.trim(), $options: 'i' };
    }

    // Text search
    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { title: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
        { tags: { $in: [new RegExp(term, 'i')] } },
        { generalLocation: { $regex: term, $options: 'i' } },
      ];
    }

    // Mine filter (requires auth)
    if (mine === 'true') {
      if (!req.user) {
        return res.status(401).json({ message: 'Must be logged in to view your requests' });
      }
      query.author = req.user._id;
    }

    // My responses filter (requests where current user has offered help)
    if (myResponses === 'true') {
      if (!req.user) {
        return res.status(401).json({ message: 'Must be logged in to view your offered responses' });
      }
      const myOffers = await HelpResponse.find({ user: req.user._id }).select('request');
      const requestIds = myOffers.map((o) => o.request);
      query._id = { $in: requestIds };
    }

    // Sort order
    let sortOptions = { createdAt: -1 };
    if (sort === 'oldest') {
      sortOptions = { createdAt: 1 };
    } else if (sort === 'urgency') {
      // Sort high -> medium -> low
      sortOptions = { urgency: 1, createdAt: -1 };
    } else if (sort === 'responses') {
      sortOptions = { responsesCount: -1, createdAt: -1 };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [total, requests] = await Promise.all([
      HelpRequest.countDocuments(query),
      HelpRequest.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate('author', 'username displayName avatar')
        .lean(),
    ]);

    // Format output and add user-specific flags if logged in
    const formatted = requests.map((item) => {
      const isOwner = req.user ? item.author._id.toString() === req.user._id.toString() : false;
      return {
        _id: item._id,
        title: item.title,
        description: item.description,
        category: item.category,
        requestType: item.requestType,
        status: item.status,
        urgency: item.urgency,
        generalLocation: item.generalLocation || '',
        tags: item.tags || [],
        responsesCount: item.responsesCount || 0,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        author: {
          _id: item.author._id,
          username: item.author.username,
          displayName: item.author.displayName || item.author.username,
          avatar: item.author.avatar,
        },
        isOwner,
      };
    });

    res.json({
      disclaimer: EMERGENCY_DISCLAIMER,
      requests: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET SINGLE REQUEST DETAILS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /api/helphub/requests/:id
 * Fetches single request. If request owner, includes all responses.
 * If responder, includes responder's own response status.
 */
router.get('/requests/:id', optionalAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const request = await HelpRequest.findById(req.params.id)
      .populate('author', 'username displayName avatar')
      .lean();

    if (!request || request.isArchived) {
      return res.status(404).json({ message: 'Help request not found' });
    }

    // Check block list
    if (req.user) {
      const isBlocked =
        req.user.blockedUsers?.some((id) => id.toString() === request.author._id.toString());
      if (isBlocked) {
        return res.status(403).json({ message: 'You cannot view content from this user' });
      }
    }

    const isOwner = req.user
      ? request.author._id.toString() === req.user._id.toString()
      : false;

    let responses = [];
    let myResponse = null;

    if (req.user) {
      if (isOwner) {
        // Request owner can see all responses to review and accept/decline
        responses = await HelpResponse.find({ request: request._id })
          .sort({ createdAt: -1 })
          .populate('user', 'username displayName avatar')
          .lean();
      } else {
        // Non-owner only sees their own response (for privacy of responders)
        myResponse = await HelpResponse.findOne({
          request: request._id,
          user: req.user._id,
        })
          .populate('user', 'username displayName avatar')
          .lean();
      }
    }

    res.json({
      disclaimer: EMERGENCY_DISCLAIMER,
      request: {
        _id: request._id,
        title: request.title,
        description: request.description,
        category: request.category,
        requestType: request.requestType,
        status: request.status,
        urgency: request.urgency,
        generalLocation: request.generalLocation || '',
        tags: request.tags || [],
        responsesCount: request.responsesCount || 0,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        author: {
          _id: request.author._id,
          username: request.author.username,
          displayName: request.author.displayName || request.author.username,
          avatar: request.author.avatar,
        },
        isOwner,
        responses: isOwner ? responses : undefined,
        myResponse,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CREATE A HELP REQUEST
// ─────────────────────────────────────────────────────────────────────────────
/**
 * POST /api/helphub/requests
 * Creates a new help request. Authenticated. Validates & sanitizes inputs.
 */
router.post('/requests', protect, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      requestType = 'need_help',
      urgency = 'medium',
      generalLocation = '',
      tags = [],
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (title.trim().length < 4 || title.trim().length > 120) {
      return res.status(400).json({ message: 'Title must be between 4 and 120 characters' });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required' });
    }
    if (description.trim().length < 10 || description.trim().length > 3000) {
      return res.status(400).json({ message: 'Description must be between 10 and 3000 characters' });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    if (!VALID_TYPES.includes(requestType)) {
      return res.status(400).json({
        message: `Invalid request type. Must be 'need_help' or 'offer_help'`,
      });
    }

    if (!VALID_URGENCIES.includes(urgency)) {
      return res.status(400).json({
        message: `Invalid urgency. Must be 'low', 'medium', or 'high'`,
      });
    }

    // Safety checks against leaking personal phone numbers/emails
    let sanitizedTitle, sanitizedDesc, sanitizedLoc;
    try {
      sanitizedTitle = sanitizeContent(title);
      sanitizedDesc = sanitizeContent(description);
      sanitizedLoc = sanitizeLocation(generalLocation);
    } catch (validationErr) {
      return res.status(400).json({ message: validationErr.message });
    }

    // Anti-spam check: prevent duplicate identical request within 10 minutes
    const recentDuplicate = await HelpRequest.findOne({
      author: req.user._id,
      title: sanitizedTitle,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    });
    if (recentDuplicate) {
      return res.status(429).json({
        message: 'A request with this title was recently posted. Please wait before posting again.',
      });
    }

    // Process tags
    let cleanTags = [];
    if (Array.isArray(tags)) {
      cleanTags = tags
        .map((t) => (typeof t === 'string' ? t.trim().toLowerCase().slice(0, 30) : ''))
        .filter((t) => t.length > 0)
        .slice(0, 8);
    }

    const helpRequest = await HelpRequest.create({
      title: sanitizedTitle,
      description: sanitizedDesc,
      category,
      requestType,
      urgency,
      generalLocation: sanitizedLoc,
      tags: cleanTags,
      author: req.user._id,
      status: 'Open',
    });

    await helpRequest.populate('author', 'username displayName avatar');

    res.status(201).json({
      message: 'Help request created successfully',
      request: helpRequest,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. EDIT A HELP REQUEST
// ─────────────────────────────────────────────────────────────────────────────
/**
 * PUT /api/helphub/requests/:id
 * Only the request author can edit. Closed or Cancelled requests cannot be edited.
 */
router.put('/requests/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const request = await HelpRequest.findById(req.params.id);
    if (!request || request.isArchived) {
      return res.status(404).json({ message: 'Help request not found' });
    }

    // Ownership check
    if (request.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not authorized to edit this request' });
    }

    if (['Cancelled', 'Closed'].includes(request.status)) {
      return res.status(400).json({
        message: `Cannot edit a request that is ${request.status.toLowerCase()}`,
      });
    }

    const {
      title,
      description,
      category,
      requestType,
      urgency,
      generalLocation,
      tags,
    } = req.body;

    if (title !== undefined) {
      if (!title.trim() || title.trim().length < 4 || title.trim().length > 120) {
        return res.status(400).json({ message: 'Title must be between 4 and 120 characters' });
      }
      request.title = sanitizeContent(title);
    }

    if (description !== undefined) {
      if (!description.trim() || description.trim().length < 10 || description.trim().length > 3000) {
        return res.status(400).json({ message: 'Description must be between 10 and 3000 characters' });
      }
      request.description = sanitizeContent(description);
    }

    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ message: 'Invalid category' });
      }
      request.category = category;
    }

    if (requestType !== undefined) {
      if (!VALID_TYPES.includes(requestType)) {
        return res.status(400).json({ message: 'Invalid request type' });
      }
      request.requestType = requestType;
    }

    if (urgency !== undefined) {
      if (!VALID_URGENCIES.includes(urgency)) {
        return res.status(400).json({ message: 'Invalid urgency' });
      }
      request.urgency = urgency;
    }

    if (generalLocation !== undefined) {
      request.generalLocation = sanitizeLocation(generalLocation);
    }

    if (tags !== undefined && Array.isArray(tags)) {
      request.tags = tags
        .map((t) => (typeof t === 'string' ? t.trim().toLowerCase().slice(0, 30) : ''))
        .filter((t) => t.length > 0)
        .slice(0, 8);
    }

    await request.save();
    await request.populate('author', 'username displayName avatar');

    res.json({
      message: 'Help request updated successfully',
      request,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. UPDATE STATUS OF A HELP REQUEST
// ─────────────────────────────────────────────────────────────────────────────
/**
 * PUT /api/helphub/requests/:id/status
 * Only the request author can change status.
 * Allowed statuses: Open, Responses Received, Accepted, In Progress, Completed, Cancelled, Closed.
 */
router.put('/requests/:id/status', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const request = await HelpRequest.findById(req.params.id);
    if (!request || request.isArchived) {
      return res.status(404).json({ message: 'Help request not found' });
    }

    // Ownership check
    if (request.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not authorized to update this status' });
    }

    request.status = status;
    await request.save();

    res.json({
      message: `Status updated to ${status}`,
      status: request.status,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CANCEL / DELETE HELP REQUEST
// ─────────────────────────────────────────────────────────────────────────────
/**
 * POST /api/helphub/requests/:id/cancel
 * or DELETE /api/helphub/requests/:id
 * Only the author can cancel.
 */
router.post('/requests/:id/cancel', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const request = await HelpRequest.findById(req.params.id);
    if (!request || request.isArchived) {
      return res.status(404).json({ message: 'Help request not found' });
    }

    if (request.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not authorized to cancel this request' });
    }

    request.status = 'Cancelled';
    await request.save();

    res.json({ message: 'Help request has been cancelled', status: 'Cancelled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/requests/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const request = await HelpRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Help request not found' });
    }

    if (request.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not authorized to delete this request' });
    }

    request.isArchived = true;
    request.status = 'Cancelled';
    await request.save();

    res.json({ message: 'Help request removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. RESPOND / OFFER HELP TO A REQUEST
// ─────────────────────────────────────────────────────────────────────────────
/**
 * POST /api/helphub/requests/:id/responses
 * Authenticated user submits an offer to help.
 * Cannot respond to own request. Cannot respond if blocked.
 * Advances request status from 'Open' to 'Responses Received'.
 */
router.post('/requests/:id/responses', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Response message is required' });
    }
    if (message.trim().length < 5 || message.trim().length > 1000) {
      return res.status(400).json({ message: 'Response message must be between 5 and 1000 characters' });
    }

    const request = await HelpRequest.findById(req.params.id);
    if (!request || request.isArchived) {
      return res.status(404).json({ message: 'Help request not found' });
    }

    // Cannot respond to own request
    if (request.author.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot offer help on your own request' });
    }

    // Only allow responses on active requests
    if (!['Open', 'Responses Received'].includes(request.status)) {
      return res.status(400).json({
        message: `This request is currently ${request.status} and is not accepting new offers`,
      });
    }

    // Block check
    const author = await User.findById(request.author);
    const isBlocked =
      req.user.blockedUsers?.some((id) => id.toString() === author._id.toString()) ||
      author?.blockedUsers?.some((id) => id.toString() === req.user._id.toString());
    if (isBlocked) {
      return res.status(403).json({ message: 'Cannot respond due to user block status' });
    }

    // Check if user already submitted a pending/accepted response
    const existing = await HelpResponse.findOne({
      request: request._id,
      user: req.user._id,
      status: { $in: ['pending', 'accepted'] },
    });
    if (existing) {
      return res.status(400).json({
        message: 'You have already submitted an active offer for this request',
      });
    }

    let sanitizedMsg;
    try {
      sanitizedMsg = sanitizeContent(message);
    } catch (validationErr) {
      return res.status(400).json({ message: validationErr.message });
    }

    const helpResponse = await HelpResponse.create({
      request: request._id,
      user: req.user._id,
      message: sanitizedMsg,
      status: 'pending',
    });

    // Update request: increment count and advance status if Open
    request.responsesCount = (request.responsesCount || 0) + 1;
    if (request.status === 'Open') {
      request.status = 'Responses Received';
    }
    await request.save();

    await helpResponse.populate('user', 'username displayName avatar');

    res.status(201).json({
      message: 'Your offer to help has been sent to the request owner',
      response: helpResponse,
      requestStatus: request.status,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. MANAGE RESPONSES (ACCEPT / DECLINE / WITHDRAW)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * PUT /api/helphub/requests/:id/responses/:responseId
 * Request owner can 'accept' or 'decline' an offer.
 * Responder can 'withdraw' their own offer.
 */
router.put('/requests/:id/responses/:responseId', protect, async (req, res) => {
  try {
    if (
      !mongoose.Types.ObjectId.isValid(req.params.id) ||
      !mongoose.Types.ObjectId.isValid(req.params.responseId)
    ) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const { action } = req.body;
    if (!['accept', 'decline', 'withdraw'].includes(action)) {
      return res.status(400).json({
        message: "Action must be 'accept', 'decline', or 'withdraw'",
      });
    }

    const request = await HelpRequest.findById(req.params.id);
    if (!request || request.isArchived) {
      return res.status(404).json({ message: 'Help request not found' });
    }

    const helpResponse = await HelpResponse.findById(req.params.responseId);
    if (!helpResponse || helpResponse.request.toString() !== request._id.toString()) {
      return res.status(404).json({ message: 'Response not found for this request' });
    }

    const isOwner = request.author.toString() === req.user._id.toString();
    const isResponder = helpResponse.user.toString() === req.user._id.toString();

    if (action === 'withdraw') {
      if (!isResponder) {
        return res.status(403).json({ message: 'Only the responder can withdraw their offer' });
      }
      helpResponse.status = 'withdrawn';
      await helpResponse.save();
      return res.json({ message: 'Offer withdrawn successfully', response: helpResponse });
    }

    // 'accept' or 'decline' requires request owner
    if (!isOwner) {
      return res.status(403).json({
        message: 'Only the request owner can accept or decline offers',
      });
    }

    if (action === 'accept') {
      helpResponse.status = 'accepted';
      await helpResponse.save();

      request.status = 'Accepted';
      request.acceptedResponse = helpResponse._id;
      await request.save();

      // Return responder info for easy messaging
      const responder = await User.findById(helpResponse.user).select(
        '_id username displayName avatar'
      );

      return res.json({
        message: 'Offer accepted! You can now coordinate privately with the helper via Echo messages.',
        response: helpResponse,
        requestStatus: request.status,
        chatUserId: responder._id,
      });
    }

    if (action === 'decline') {
      helpResponse.status = 'declined';
      await helpResponse.save();

      return res.json({
        message: 'Offer declined',
        response: helpResponse,
      });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. REPORT SUSPICIOUS REQUEST
// ─────────────────────────────────────────────────────────────────────────────
/**
 * POST /api/helphub/requests/:id/report
 * Authenticated user can report a suspicious request for safety / spam moderation.
 * Cannot report own request.
 */
router.post('/requests/:id/report', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const { reason = 'other', details = '' } = req.body;

    if (!VALID_REPORT_REASONS.includes(reason)) {
      return res.status(400).json({
        message: `Invalid reason. Must be one of: ${VALID_REPORT_REASONS.join(', ')}`,
      });
    }

    const request = await HelpRequest.findById(req.params.id);
    if (!request || request.isArchived) {
      return res.status(404).json({ message: 'Help request not found' });
    }

    // Cannot report own request
    if (request.author.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot report your own request' });
    }

    // Check if user already reported this request
    const alreadyReported = request.reports?.some(
      (r) => r.reporter.toString() === req.user._id.toString()
    );
    if (alreadyReported) {
      return res.status(400).json({ message: 'You have already reported this request' });
    }

    request.reports.push({
      reporter: req.user._id,
      reason,
      details: sanitizeContent(details).slice(0, 500),
      createdAt: new Date(),
    });
    request.reportCount = (request.reportCount || 0) + 1;

    // Safety threshold: if 5 or more reports, automatically flag or hide from public search
    if (request.reportCount >= 5) {
      request.isArchived = true;
    }

    await request.save();

    res.json({
      message: 'Thank you for keeping Echo safe. The report has been recorded.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. BLOCK USER (INTEGRATED SHORTCUT)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * POST /api/helphub/users/:userId/block
 * Convenience route for blocking a user encountered on Help Hub.
 * Uses Echo's core blockedUsers mechanism.
 */
router.post('/users/:userId/block', protect, async (req, res) => {
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
    user.following = user.following.filter((id) => id.toString() !== target._id.toString());
    user.followers = user.followers.filter((id) => id.toString() !== target._id.toString());
    await user.save();

    target.following = target.following.filter((id) => id.toString() !== user._id.toString());
    target.followers = target.followers.filter((id) => id.toString() !== user._id.toString());
    await target.save();

    res.json({
      message: `User ${target.username} has been blocked. Their requests and messages will no longer appear for you.`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
