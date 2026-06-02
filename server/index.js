require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const searchRoutes = require('./routes/search');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const communityRoutes = require('./routes/communities');
const placeRoutes = require('./routes/places');
const eventRoutes = require('./routes/events');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/places', placeRoutes);
app.use('/api/events', eventRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Echo' });
});

app.use((err, _req, res, _next) => {
  if (err.name === 'MulterError' || /image/i.test(err.message || '')) {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: err.message || 'Server error' });
});

const seedData = require('./utils/seed');

connectDB()
  .then(() => {
    // Seed initial data if database collections are empty
    seedData();

    app.listen(PORT, () => {
      console.log(`Echo server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });
