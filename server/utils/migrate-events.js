const mongoose = require('mongoose');
const Event = require('../models/Event');

async function migrate() {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/echo';
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB');

    // Move all Plantation drive events -> Volunteer event
    const plantationResult = await Event.updateMany(
      { category: 'Plantation drive' },
      { $set: { category: 'Volunteer event' } }
    );
    console.log(`Moved plantation events to Volunteer event: ${plantationResult.modifiedCount}`);

    // Remove any Protest events
    const protestResult = await Event.deleteMany({ category: 'Protest' });
    console.log(`Removed protest events: ${protestResult.deletedCount}`);

    await mongoose.disconnect();
    console.log('Done.');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
}

migrate();
