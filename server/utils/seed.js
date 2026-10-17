const mongoose = require('mongoose');
const Community = require('../models/Community');
const Place = require('../models/Place');
const Event = require('../models/Event');
const Listing = require('../models/Listing');
const User = require('../models/User');

const mockCommunities = [
  {
    name: 'Green City Initiative',
    category: 'Environmental',
    description: 'A community focused on neighborhood plantation drives, cleanup events, and promoting sustainable city living.',
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=400&q=80',
    updates: [
      {
        title: 'Weekly Park Cleanup Completed',
        content: 'Thanks to the 15 volunteers who showed up! We gathered 12 bags of recyclables.',
      },
      {
        title: 'Plantation Drive Next Saturday',
        content: 'Join us at Central Park. Tree saplings and tools will be provided.',
      }
    ],
  },
  {
    name: 'Local Artisans Collective',
    category: 'Small business',
    description: 'Uniting local creators, thrifters, and micro-business owners to co-promote craft fairs and pop-up events.',
    image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=400&q=80',
    updates: [
      {
        title: 'Summer Craft Fair Announced',
        content: 'Vendor applications are now open. Link is in the description!',
      }
    ],
  },
  {
    name: 'Equal Rights Coalition',
    category: 'Protest and activism',
    description: 'Organizing campaigns, peaceful rallies, and awareness drives for socio-economic equality and justice.',
    image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=400&q=80',
    updates: [
      {
        title: 'Upcoming Campaign Briefing',
        content: 'Read our latest proposal document online. We start organizing volunteers next Monday.',
      }
    ],
  },
  {
    name: 'Shelter Pals & Paws',
    category: 'Shelter and volunteer',
    description: 'Supporting shelter animals through weekend dog walking, volunteer outreach, and adoption event support.',
    image: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&q=80',
    updates: [
      {
        title: 'Adoption Banner Successful',
        content: 'Three puppies found their forever homes today! A huge thank you to everyone.',
      }
    ],
  }
];

const mockPlaces = [
  {
    name: 'The Daily Grind',
    category: 'Cafe',
    rating: 4.8,
    distance: '0.4 miles',
    image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&q=80',
    tags: ['Locally Loved', 'Student Favorite'],
    isUnderrated: false,
    coordinates: { x: 30, y: 40, lat: 40.7150, lng: -74.0080 },
    reviews: [
      {
        author: 'Srishti',
        rating: 5,
        content: 'The cold brew is phenomenal and the seating is perfect for reading or working.',
      },
      {
        author: 'Alex',
        rating: 4.5,
        content: 'Amazing cinnamon buns, but gets really crowded during the weekends.',
      }
    ],
  },
  {
    name: 'Corner Book Cellar',
    category: 'Bookstore',
    rating: 4.9,
    distance: '1.2 miles',
    image: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=400&q=80',
    tags: ['Hidden Gem', 'Locally Loved'],
    isUnderrated: false,
    coordinates: { x: 75, y: 25, lat: 40.7200, lng: -74.0010 },
    reviews: [
      {
        author: 'Taylor',
        rating: 5,
        content: 'A true hidden gem! So many vintage editions and the owner is extremely friendly.',
      }
    ],
  },
  {
    name: 'Retro Threads',
    category: 'Thrift store',
    rating: 4.4,
    distance: '0.8 miles',
    image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=400&q=80',
    tags: ['Student Favorite', 'Hidden Gem'],
    isUnderrated: true,
    coordinates: { x: 50, y: 70, lat: 40.7090, lng: -74.0120 },
    reviews: [
      {
        author: 'Jamie',
        rating: 4,
        content: 'Excellent leather jacket selection. Prices are very reasonable for students!',
      }
    ],
  },
  {
    name: 'Bloom Pottery Studio',
    category: 'Artist/Creator',
    rating: 4.7,
    distance: '1.5 miles',
    image: 'https://images.unsplash.com/photo-1576016770956-debb63d90029?w=400&q=80',
    tags: ['Hidden Gem'],
    isUnderrated: true,
    coordinates: { x: 20, y: 80, lat: 40.7050, lng: -74.0030 },
    reviews: [
      {
        author: 'Morgan',
        rating: 5,
        content: 'Took their beginners clay workshop. Had so much fun and learned a lot!',
      }
    ],
  },
  {
    name: 'Novel Grounds Cafe',
    category: 'Bookstore',
    rating: 4.9,
    distance: '0.3 miles',
    image: 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?w=400&q=80',
    tags: ['Hidden Gem', 'Locally Loved'],
    isUnderrated: true,
    coordinates: { x: 40, y: 30, lat: 40.7180, lng: -74.0090 },
    reviews: [
      {
        author: 'Sam',
        rating: 5,
        content: 'Perfect combination of cozy bookstore and delicious artisanal espresso drinks.',
      }
    ],
  },
  {
    name: 'Vintage Vault',
    category: 'Thrift store',
    rating: 4.8,
    distance: '0.6 miles',
    image: 'https://images.unsplash.com/photo-1479064555552-3ef4979f8908?w=400&q=80',
    tags: ['Student Favorite'],
    isUnderrated: true,
    coordinates: { x: 60, y: 55, lat: 40.7110, lng: -74.0050 },
    reviews: [
      {
        author: 'Riley',
        rating: 5,
        content: 'Incredible vintage designer pieces at a fraction of standard consignment prices!',
      }
    ],
  }
];

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

const mockListings = [
  {
    title: 'Apple MacBook Air 13" M2 (Space Gray, 256GB)',
    price: 749,
    category: 'Electronics',
    condition: 'Like New',
    description: 'Selling my MacBook Air M2 in pristine condition with 100% battery health. Comes with original MagSafe charger and packaging. Barely used for a summer coding project.',
    location: 'Downtown Campus',
    deliveryType: 'Public meetup',
    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Sony WH-1000XM4 Wireless Noise Canceling Headphones',
    price: 160,
    category: 'Electronics',
    condition: 'Like New',
    description: 'Industry leading noise cancellation headphones in black. Outstanding sound quality, clean cushions, includes protective hard case, aux cable, and USB-C cord.',
    location: 'North Campus',
    deliveryType: 'Local pickup',
    images: ['https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Mid-Century Modern Velvet Armchair - Forest Green',
    price: 130,
    category: 'Furniture',
    condition: 'Like New',
    description: 'Gorgeous green velvet accent chair with tapered walnut legs. Extremely comfortable, smoke-free and pet-free home. Selling because moving to a furnished studio.',
    location: 'East District',
    deliveryType: 'Local pickup',
    images: ['https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Solid Oak Coffee Table with Under-Shelf',
    price: 75,
    category: 'Furniture',
    condition: 'Good',
    description: 'Sturdy natural oak coffee table with bottom storage shelf for books and games. Dimensions: 42" W x 22" D x 18" H. Can assist loading into your vehicle.',
    location: 'South Park',
    deliveryType: 'Drop-off available',
    images: ['https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Canon EOS Rebel T7 DSLR Camera Kit with 18-55mm Lens',
    price: 310,
    category: 'Electronics',
    condition: 'Like New',
    description: 'Perfect camera for photography students or creators. 24.1 MP CMOS sensor, built-in Wi-Fi. Includes lens, battery, high-speed SanDisk 64GB SD card, and padded shoulder bag.',
    location: 'Downtown',
    deliveryType: 'Public meetup',
    images: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Vintage Levi\'s Denim Sherpa Trucker Jacket (Men\'s M)',
    price: 45,
    category: 'Clothing & Accessories',
    condition: 'Good',
    description: 'Classic medium wash sherpa lined denim jacket. Warm and broken in nicely with zero rips or stains. Standard fit, fits true to size.',
    location: 'Uptown Village',
    deliveryType: 'Shipping available',
    images: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Trek FX 2 Disc Hybrid City Bike (54cm Frame)',
    price: 380,
    category: 'Vehicles',
    condition: 'Good',
    description: 'Reliable commuter bike with hydraulic disc brakes, lightweight aluminum frame, and Shimano 24-speed gears. Tuned up recently at local shop with new puncture-resistant tires.',
    location: 'West Campus',
    deliveryType: 'Local pickup',
    images: ['https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Free Heavy Duty Moving Boxes & Packing Bubble Wrap',
    price: 0,
    category: 'Free Stuff',
    condition: 'Good',
    description: 'Just finished moving! Giving away 14 clean medium/large cardboard boxes, packing paper, and bubble wrap. Must pick up all together by this evening.',
    location: 'North Campus',
    deliveryType: 'Local pickup',
    images: ['https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Monstera Deliciosa Plant in White Ceramic Planter',
    price: 25,
    category: 'Home & Garden',
    condition: 'New',
    description: 'Healthy, thriving Monstera plant with 7 fenestrated leaves. Potted in premium soil mix with drainage hole and saucer. Very easy to care for.',
    location: 'Midtown',
    deliveryType: 'Local pickup',
    images: ['https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Nintendo Switch OLED (White) + Zelda & Mario Kart 8',
    price: 275,
    category: 'Toys & Games',
    condition: 'Like New',
    description: 'OLED model console with glass screen protector installed from day one. Includes dock, HDMI, two physical games, and carrying case. No stick drift.',
    location: 'Downtown Square',
    deliveryType: 'Public meetup',
    images: ['https://images.unsplash.com/photo-1578303512597-8be9f190f452?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Fender CD-60S Acoustic Guitar with Padded Gig Bag & Tuner',
    price: 120,
    category: 'Books & Hobbies',
    condition: 'Good',
    description: 'Solid spruce top with mahogany back and sides. Great projection and warm tone. Fresh D\'Addario light gauge strings installed. Ready to play.',
    location: 'Arts District',
    deliveryType: 'Local pickup',
    images: ['https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800&q=80'],
    status: 'Available',
  },
  {
    title: 'Dyson V8 Cordless Vacuum Cleaner with All Attachments',
    price: 155,
    category: 'Home & Garden',
    condition: 'Good',
    description: 'Deep cleaned and sanitized with clean washable HEPA filter. Battery holds full 35+ minute charge. Includes wall charging dock and motorized pet hair tool.',
    location: 'South Hills',
    deliveryType: 'Local pickup',
    images: ['https://images.unsplash.com/photo-1558317374-067fb5f30001?w=800&q=80'],
    status: 'Available',
  }
];

async function seedData() {
  try {
    const communityCount = await Community.countDocuments();
    if (communityCount === 0) {
      await Community.create(mockCommunities);
      console.log('Seeded communities data successfully.');
    }

    // Force reseed places to ensure all entries have lat and lng coordinates
    await Place.deleteMany({});
    await Place.create(mockPlaces);
    console.log('Seeded map places data successfully.');

    const eventCount = await Event.countDocuments();
    if (eventCount === 0) {
      await Event.create(mockEvents);
      console.log('Seeded events data successfully.');
    }

    const listingCount = await Listing.countDocuments();
    if (listingCount === 0) {
      // Find an existing user or fallback to create a seed user
      let seedSeller = await User.findOne();
      if (!seedSeller) {
        seedSeller = await User.create({
          username: 'marketplaceseller',
          email: 'marketplace@echo.local',
          password: 'Password123!',
          displayName: 'Alex Rivers',
          bio: 'Campus thrifter, student & gadget enthusiast.',
        });
      }

      const listingsToSeed = mockListings.map((item) => ({
        ...item,
        seller: seedSeller._id,
      }));

      await Listing.create(listingsToSeed);
      console.log('Seeded marketplace listings successfully.');
    }
  } catch (err) {
    console.error('Error seeding data:', err.message);
  }
}

module.exports = seedData;

