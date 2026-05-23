const mongoose = require('mongoose');

const searchHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    query: { type: String, required: true, trim: true, maxlength: 100 },
  },
  { timestamps: true }
);

searchHistorySchema.index({ user: 1, query: 1 }, { unique: true });
searchHistorySchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model('SearchHistory', searchHistorySchema);
