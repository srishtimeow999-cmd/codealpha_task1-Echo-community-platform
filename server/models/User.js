const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 160,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    interests: {
      type: [String],
      default: [],
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toPublic = function () {
  return {
    _id: this._id,
    username: this.username,
    displayName: this.displayName || this.username,
    bio: this.bio,
    avatar: this.avatar,
    interests: this.interests || [],
    followersCount: this.followers.length,
    followingCount: this.following.length,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
