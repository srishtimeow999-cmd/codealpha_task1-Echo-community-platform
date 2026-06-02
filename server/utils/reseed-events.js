const mongoose = require('mongoose');
const Event = require('../models/Event');

const mockEvents = [
  {
    title: 'Community Tree Planting Drive',
    category: 'Volunteer event',
    description: 'Help us plant 50 new oak saplings around the north park. Please bring gloves! Soil and shovels are provided.',
    banner: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600&q=80',
    date: 'May 30, 2026',
    time: '09:00 AM - 12:30 PM',
    location: 'North Central Park Grounds',
    organizer: 'Green City Initiative',
  },
  {
    title: 'Charity Clothing & Food Drive',
    category: 'Donation drive',
    description: 'We are collecting winter jackets, canned food, and dry goods for the local neighborhood shelters.',
    banner: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&q=80',
    date: 'June 05, 2026',
    time: '11:00 AM - 04:00 PM',
    location: 'Town Square Pavilion',
    organizer: 'Shelter Pals & Paws',
  },
  {
    title: 'Acoustic Concert in the Garden',
    category: 'Small concert',
    description: 'Join us for a relaxing evening featuring intimate performances from local indie musicians. Entry by donation.',
    banner: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600&q=80',
    date: 'June 12, 2026',
    time: '06:30 PM - 09:30 PM',
    location: 'Bloom Studio Backyard Garden',
    organizer: 'Local Artisans Collective',
  }
];

async function reseed() {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/echo';
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB');

    await Event.deleteMany({});
    console.log('Cleared all events');

    await Event.create(mockEvents);
    console.log('Re-seeded events successfully');

    await mongoose.disconnect();
    console.log('Done.');
  } catch (err) {
    console.error('Reseed error:', err.message);
    process.exit(1);
  }
}

reseed();
