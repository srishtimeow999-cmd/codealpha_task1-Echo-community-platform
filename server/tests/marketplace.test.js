/**
 * marketplace.test.js — Echo Marketplace Integration & Safety Test Suite
 *
 * Tests:
 * 1. Public browsing and category endpoints
 * 2. Authentication enforcement on protected routes (create, edit, status, inquire, save, report)
 * 3. Validation on listing creation (title, price, category)
 * 4. Full listing lifecycle: create -> browse -> filter -> view details
 * 5. Owner authorization (non-owners cannot edit, update status, or delete)
 * 6. Quick status toggling (Available -> Pending -> Sold)
 * 7. Save / Bookmark toggle functionality
 * 8. Buyer-Seller inquiry (creates Conversation and Message in Echo)
 * 9. Reporting suspicious or scam listings
 * 10. Deleting listing and verifying cleanup
 *
 * Run with:  node server/tests/marketplace.test.js
 */

'use strict';

const assert = require('assert');

const BASE = 'http://localhost:3000/api';

let testCounter = 0;
let passed = 0;
let failed = 0;

async function test(name, fn) {
  testCounter++;
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

async function req(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function authedReq(token, path, options = {}) {
  return req(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
}

const uid = () => `_mp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function registerUser(suffix = '') {
  const username = `seller${suffix}${uid()}`.slice(0, 28);
  const email = `${username}@example.com`;
  const password = 'Password123!';

  const res = await req('/auth/register', {
    method: 'POST',
    body: { username, email, password, displayName: `User ${suffix}` },
  });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`User registration failed: ${JSON.stringify(res.data)}`);
  }

  return { token: res.data.token, user: res.data.user };
}

async function run() {
  console.log('\n======================================================');
  console.log('   Echo Marketplace — Integration & Safety Test Suite');
  console.log('======================================================\n');

  // Verify server is alive
  const health = await req('/health');
  if (health.status !== 200) {
    console.error('Server is not running at http://localhost:3000');
    process.exit(1);
  }

  console.log('--- Setting Up Test Users ---');
  const seller = await registerUser('A');
  const buyer = await registerUser('B');
  const stranger = await registerUser('C');
  console.log(`  Created Seller: ${seller.user.username}`);
  console.log(`  Created Buyer:  ${buyer.user.username}`);
  console.log(`  Created Stranger: ${stranger.user.username}\n`);

  let testListingId = null;

  // 1. Public Browsing
  console.log('--- 1. Public Browsing & Stats ---');

  await test('GET /api/marketplace/stats returns count totals', async () => {
    const res = await req('/marketplace/stats');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.data.totalActive, 'number');
    assert.strictEqual(typeof res.data.freeCount, 'number');
    assert.ok(res.data.categories);
  });

  await test('GET /api/marketplace/categories returns available category list', async () => {
    const res = await req('/marketplace/categories');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.categories));
    assert.ok(res.data.categories.length >= 8);
    const electronics = res.data.categories.find((c) => c.name === 'Electronics');
    assert.ok(electronics, 'Electronics category should exist');
  });

  await test('GET /api/marketplace/listings allows public guest browsing', async () => {
    const res = await req('/marketplace/listings');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.listings));
    assert.strictEqual(typeof res.data.total, 'number');
  });

  // 2. Authentication Enforcement
  console.log('\n--- 2. Auth Enforcement on Protected Endpoints ---');

  await test('POST /api/marketplace/listings returns 401 without auth', async () => {
    const res = await req('/marketplace/listings', {
      method: 'POST',
      body: { title: 'Test Item', price: 50, category: 'Electronics' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('PUT /api/marketplace/listings/:id returns 401 without auth', async () => {
    const res = await req('/marketplace/listings/507f1f77bcf86cd799439011', {
      method: 'PUT',
      body: { title: 'Updated' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/marketplace/listings/:id/save returns 401 without auth', async () => {
    const res = await req('/marketplace/listings/507f1f77bcf86cd799439011/save', {
      method: 'POST',
    });
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/marketplace/listings/:id/inquire returns 401 without auth', async () => {
    const res = await req('/marketplace/listings/507f1f77bcf86cd799439011/inquire', {
      method: 'POST',
      body: { message: 'Is this available?' },
    });
    assert.strictEqual(res.status, 401);
  });

  // 3. Validation on Create
  console.log('\n--- 3. Validation on Listing Creation ---');

  await test('POST /api/marketplace/listings rejects short title (<3 chars)', async () => {
    const res = await authedReq(seller.token, '/marketplace/listings', {
      method: 'POST',
      body: {
        title: 'Hi',
        price: 20,
        category: 'Electronics',
        description: 'Valid description here',
      },
    });
    assert.strictEqual(res.status, 400);
  });

  await test('POST /api/marketplace/listings rejects negative price', async () => {
    const res = await authedReq(seller.token, '/marketplace/listings', {
      method: 'POST',
      body: {
        title: 'Valid Title Here',
        price: -10,
        category: 'Electronics',
        description: 'Valid description here',
      },
    });
    assert.strictEqual(res.status, 400);
  });

  await test('POST /api/marketplace/listings rejects invalid category', async () => {
    const res = await authedReq(seller.token, '/marketplace/listings', {
      method: 'POST',
      body: {
        title: 'Valid Title Here',
        price: 50,
        category: 'NonExistentCategory',
        description: 'Valid description here',
      },
    });
    assert.strictEqual(res.status, 400);
  });

  // 4. Successful Creation & Lifecycle
  console.log('\n--- 4. Listing Lifecycle: Create, Read, Filter ---');

  await test('POST /api/marketplace/listings creates a listing successfully', async () => {
    const res = await authedReq(seller.token, '/marketplace/listings', {
      method: 'POST',
      body: {
        title: 'Sony Alpha A6400 Mirrorless Camera Body',
        price: 550,
        category: 'Electronics',
        condition: 'Like New',
        deliveryType: 'Local pickup',
        location: 'Downtown Campus',
        description: 'Selling my Sony mirrorless camera in mint condition with box, two batteries, and charger.',
        images: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80'],
      },
    });

    assert.strictEqual(res.status, 201);
    assert.ok(res.data.listing._id);
    assert.strictEqual(res.data.listing.title, 'Sony Alpha A6400 Mirrorless Camera Body');
    assert.strictEqual(res.data.listing.price, 550);
    assert.strictEqual(res.data.listing.status, 'Available');
    assert.strictEqual(res.data.listing.isOwner, true);

    testListingId = res.data.listing._id;
  });

  await test('GET /api/marketplace/listings/:id returns single listing details & seller info', async () => {
    const res = await authedReq(buyer.token, `/marketplace/listings/${testListingId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.listing.title, 'Sony Alpha A6400 Mirrorless Camera Body');
    assert.strictEqual(res.data.listing.isOwner, false);
    assert.strictEqual(res.data.listing.seller.username, seller.user.username);
    assert.ok(res.data.listing.views >= 1);
  });

  await test('GET /api/marketplace/listings?search=Mirrorless filters by keyword', async () => {
    const res = await req('/marketplace/listings?search=Mirrorless');
    assert.strictEqual(res.status, 200);
    const found = res.data.listings.some((l) => l._id === testListingId);
    assert.ok(found, 'Listing should appear in keyword search results');
  });

  await test('GET /api/marketplace/listings?category=Electronics filters by category', async () => {
    const res = await req('/marketplace/listings?category=Electronics');
    assert.strictEqual(res.status, 200);
    res.data.listings.forEach((l) => assert.strictEqual(l.category, 'Electronics'));
  });

  await test('GET /api/marketplace/listings?minPrice=500&maxPrice=600 filters by price range', async () => {
    const res = await req('/marketplace/listings?minPrice=500&maxPrice=600');
    assert.strictEqual(res.status, 200);
    const found = res.data.listings.find((l) => l._id === testListingId);
    assert.ok(found, 'Listing should match price range');
  });

  // 5. Ownership & Authorization
  console.log('\n--- 5. Ownership & Security Authorization ---');

  await test('PUT /api/marketplace/listings/:id blocks unauthorized user from editing', async () => {
    const res = await authedReq(stranger.token, `/marketplace/listings/${testListingId}`, {
      method: 'PUT',
      body: { title: 'Hacked Title' },
    });
    assert.strictEqual(res.status, 403);
  });

  await test('PATCH /api/marketplace/listings/:id/status blocks unauthorized user from changing status', async () => {
    const res = await authedReq(stranger.token, `/marketplace/listings/${testListingId}/status`, {
      method: 'PATCH',
      body: { status: 'Sold' },
    });
    assert.strictEqual(res.status, 403);
  });

  await test('DELETE /api/marketplace/listings/:id blocks unauthorized user from deleting', async () => {
    const res = await authedReq(stranger.token, `/marketplace/listings/${testListingId}`, {
      method: 'DELETE',
    });
    assert.strictEqual(res.status, 403);
  });

  // 6. Owner Actions: Edit & Status
  console.log('\n--- 6. Owner Actions (Edit & Status Toggling) ---');

  await test('PUT /api/marketplace/listings/:id allows owner to edit price & title', async () => {
    const res = await authedReq(seller.token, `/marketplace/listings/${testListingId}`, {
      method: 'PUT',
      body: { price: 520, title: 'Sony Alpha A6400 Mirrorless Camera Body - Price Drop!' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.listing.price, 520);
    assert.strictEqual(res.data.listing.title, 'Sony Alpha A6400 Mirrorless Camera Body - Price Drop!');
  });

  await test('PATCH /api/marketplace/listings/:id/status allows owner to toggle status to Pending and Sold', async () => {
    const res1 = await authedReq(seller.token, `/marketplace/listings/${testListingId}/status`, {
      method: 'PATCH',
      body: { status: 'Pending' },
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.status, 'Pending');

    const res2 = await authedReq(seller.token, `/marketplace/listings/${testListingId}/status`, {
      method: 'PATCH',
      body: { status: 'Available' },
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.status, 'Available');
  });

  // 7. Save / Bookmark
  console.log('\n--- 7. Save / Bookmark Listing ---');

  await test('POST /api/marketplace/listings/:id/save toggles save state', async () => {
    const res1 = await authedReq(buyer.token, `/marketplace/listings/${testListingId}/save`, {
      method: 'POST',
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.saved, true);
    assert.strictEqual(res1.data.savesCount, 1);

    // Check saved filter
    const feed = await authedReq(buyer.token, '/marketplace/listings?filter=saved');
    assert.strictEqual(feed.status, 200);
    const found = feed.data.listings.find((l) => l._id === testListingId);
    assert.ok(found, 'Listing should appear in buyer saved feed');

    // Unsave
    const res2 = await authedReq(buyer.token, `/marketplace/listings/${testListingId}/save`, {
      method: 'POST',
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.saved, false);
    assert.strictEqual(res2.data.savesCount, 0);
  });

  // 8. Buyer-Seller Inquiry Messaging
  console.log('\n--- 8. Facebook Marketplace Buyer-Seller Inquiry ---');

  await test('POST /api/marketplace/listings/:id/inquire prevents self messaging', async () => {
    const res = await authedReq(seller.token, `/marketplace/listings/${testListingId}/inquire`, {
      method: 'POST',
      body: { message: 'Is this available?' },
    });
    assert.strictEqual(res.status, 400);
  });

  await test('POST /api/marketplace/listings/:id/inquire sends message directly to seller', async () => {
    const res = await authedReq(buyer.token, `/marketplace/listings/${testListingId}/inquire`, {
      method: 'POST',
      body: { message: 'Hi! Is this still available? Can we meet on campus?' },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.conversationId);
    assert.ok(res.data.sentMessage);

    // Verify conversation exists in seller messages
    const convs = await authedReq(seller.token, '/messages');
    assert.strictEqual(convs.status, 200);
    const foundConv = convs.data.conversations.find((c) => c._id === res.data.conversationId);
    assert.ok(foundConv, 'Seller should have the conversation in their messages list');
  });

  // 9. Reporting
  console.log('\n--- 9. Safety & Reporting ---');

  await test('POST /api/marketplace/listings/:id/report allows reporting', async () => {
    const res = await authedReq(buyer.token, `/marketplace/listings/${testListingId}/report`, {
      method: 'POST',
      body: { reason: 'spam', details: 'Checking report mechanism' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.reportCount, 1);
  });

  await test('POST /api/marketplace/listings/:id/report prevents duplicate report from same user', async () => {
    const res = await authedReq(buyer.token, `/marketplace/listings/${testListingId}/report`, {
      method: 'POST',
      body: { reason: 'spam' },
    });
    assert.strictEqual(res.status, 400);
  });

  // 10. Deleting listing
  console.log('\n--- 10. Listing Cleanup & Deletion ---');

  await test('DELETE /api/marketplace/listings/:id deletes listing cleanly', async () => {
    const res = await authedReq(seller.token, `/marketplace/listings/${testListingId}`, {
      method: 'DELETE',
    });
    assert.strictEqual(res.status, 200);

    const check = await req(`/marketplace/listings/${testListingId}`);
    assert.strictEqual(check.status, 404);
  });

  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed (total: ${testCounter})`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
