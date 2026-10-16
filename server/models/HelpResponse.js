const mongoose = require('mongoose');

const helpResponseSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HelpRequest',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'withdrawn'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

helpResponseSchema.index({ request: 1, user: 1 });
helpResponseSchema.index({ createdAt: -1 });

module.exports = mongoose.model('HelpResponse', helpResponseSchema);
