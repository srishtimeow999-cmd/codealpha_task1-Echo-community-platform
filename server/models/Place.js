const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    author: { type: String, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    rating: { type: Number, required: true, min: 1, max: 5 },
    content: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const placeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['Small business', 'Cafe', 'Thrift store', 'Bookstore', 'Artist/Creator', 'Local vendor'],
    },
    rating: {
      type: Number,
      default: 5,
    },
    distance: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      default: '',
    },
    tags: {
      type: [String],
      default: [], // e.g. ["Locally Loved", "Student Favorite", "Hidden Gem"]
    },
    isUnderrated: {
      type: Boolean,
      default: false,
    },
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reviews: [reviewSchema],
    coordinates: {
      x: { type: Number, required: true }, // percentage from left on visual map (0-100)
      y: { type: Number, required: true }, // percentage from top on visual map (0-100)
      lat: { type: Number, default: 0 },   // actual latitude
      lng: { type: Number, default: 0 }    // actual longitude
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Place', placeSchema);
