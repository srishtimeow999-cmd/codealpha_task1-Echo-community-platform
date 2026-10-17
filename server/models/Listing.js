const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Electronics',
        'Vehicles',
        'Home & Garden',
        'Clothing & Accessories',
        'Furniture',
        'Books & Hobbies',
        'Toys & Games',
        'Free Stuff',
        'Other',
      ],
      index: true,
    },
    condition: {
      type: String,
      required: true,
      enum: ['New', 'Like New', 'Good', 'Fair'],
      default: 'Good',
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 4000,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      default: 'Campus / Local Area',
    },
    deliveryType: {
      type: String,
      enum: ['Local pickup', 'Public meetup', 'Drop-off available', 'Shipping available'],
      default: 'Local pickup',
    },
    images: {
      type: [String],
      default: [],
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['Available', 'Pending', 'Sold'],
      default: 'Available',
      index: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    saves: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    savesCount: {
      type: Number,
      default: 0,
    },
    inquiriesCount: {
      type: Number,
      default: 0,
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
          enum: ['spam', 'inappropriate', 'fraud_or_scam', 'prohibited_item', 'other'],
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
listingSchema.index({ title: 'text', description: 'text', location: 'text', category: 'text' });
listingSchema.index({ createdAt: -1 });
listingSchema.index({ status: 1, category: 1, price: 1 });

module.exports = mongoose.model('Listing', listingSchema);
