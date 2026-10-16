const mongoose = require('mongoose');

const helpRequestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 4,
      maxlength: 120,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 3000,
    },
    category: {
      type: String,
      required: true,
      enum: ['education', 'community', 'personal', 'offer_help'],
      index: true,
    },
    requestType: {
      type: String,
      enum: ['need_help', 'offer_help'],
      default: 'need_help',
      index: true,
    },
    status: {
      type: String,
      enum: [
        'Open',
        'Responses Received',
        'Accepted',
        'In Progress',
        'Completed',
        'Cancelled',
        'Closed',
      ],
      default: 'Open',
      index: true,
    },
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    // General location only (e.g., 'North Campus', 'Downtown', 'Remote / Online').
    // Never exact address or phone number.
    generalLocation: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    responsesCount: {
      type: Number,
      default: 0,
    },
    acceptedResponse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HelpResponse',
      default: null,
    },
    reports: [
      {
        reporter: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        reason: {
          type: String,
          enum: ['spam', 'inappropriate', 'safety_concern', 'fraud_or_scam', 'other'],
          default: 'other',
        },
        details: {
          type: String,
          trim: true,
          maxlength: 500,
          default: '',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    reportCount: {
      type: Number,
      default: 0,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Search indexes
helpRequestSchema.index({ title: 'text', description: 'text', generalLocation: 'text' });
helpRequestSchema.index({ createdAt: -1 });
helpRequestSchema.index({ status: 1, category: 1 });

module.exports = mongoose.model('HelpRequest', helpRequestSchema);
