const Comment = require('../models/Comment');

function enrichPost(post, currentUserId) {
  return {
    ...post,
    likesCount: post.likes?.length ?? 0,
    likedByMe: (post.likes || []).some((id) => id.toString() === currentUserId.toString()),
    commentsCount: post.commentsCount ?? 0,
  };
}

async function attachCommentCounts(posts) {
  if (!posts.length) return posts;

  const ids = posts.map((p) => p._id);
  const counts = await Comment.aggregate([
    { $match: { post: { $in: ids } } },
    { $group: { _id: '$post', count: { $sum: 1 } } },
  ]);

  const map = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]));

  return posts.map((p) => ({
    ...p,
    commentsCount: map[p._id.toString()] || 0,
  }));
}

async function enrichPosts(posts, currentUserId) {
  const withCounts = await attachCommentCounts(posts);
  return withCounts.map((p) => enrichPost(p, currentUserId));
}

module.exports = { enrichPost, enrichPosts, attachCommentCounts };
