/**
 * footprint.test.js — Access control, privacy rule and invalid-request tests
 *
 * Run with:  node server/tests/footprint.test.js
 *
 * Requirements: the Echo server must be running on http://localhost:3000
 * and MongoDB must be connected.  The tests create temporary users and clean
 * up after themselves.
 *
 * No external testing framework is required — uses the built-in Node.js
 * assert module and the native fetch API (Node 18+).
 */

'use strict';

require('dotenv').config();

const assert = require('assert');

const BASE = 'http://localhost:3000/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Register a temporary user and return { token, user }
const uid = () => `_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

async function registerUser(suffix = '') {
  const username = `${uid()}${suffix}`.slice(0, 30);
  const email = `${username}@example.com`;
  const { data } = await req('/auth/register', {
    method: 'POST',
    body: { username, email, password: 'testpass123' },
  });
  assert.ok(data.token, 'Registration should return a token');
  return { token: data.token, user: data.user };
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🔍 Echo Digital Footprint — Access Control Tests\n');

  // ── 1. Unauthenticated access ────────────────────────────────────────────
  console.log('1. Unauthenticated access (no token)\n');

  const PROTECTED = [
    ['GET', '/footprint/summary'],
    ['GET', '/footprint/privacy'],
    ['PUT', '/footprint/privacy'],
    ['GET', '/footprint/blocked'],
    ['POST', '/footprint/blocked/000000000000000000000001'],
    ['DELETE', '/footprint/blocked/000000000000000000000001'],
    ['GET', '/footprint/security'],
    ['DELETE', '/footprint/posts/000000000000000000000001'],
    ['DELETE', '/footprint/comments/000000000000000000000001'],
  ];

  for (const [method, path] of PROTECTED) {
    await test(`${method} ${path} → 401 without token`, async () => {
      const { status } = await req(path, { method });
      assert.strictEqual(status, 401, `Expected 401 but got ${status}`);
    });
  }

  // ── 2. Invalid token ─────────────────────────────────────────────────────
  console.log('\n2. Invalid / expired token\n');

  await test('GET /footprint/summary → 401 with bad token', async () => {
    const { status } = await authedReq('bad.token.here', '/footprint/summary');
    assert.strictEqual(status, 401);
  });

  // ── 3. Dashboard summary ─────────────────────────────────────────────────
  console.log('\n3. Dashboard summary\n');

  const { token: tokenA, user: userA } = await registerUser('a');

  await test('GET /footprint/summary → 200 with valid token', async () => {
    const { status, data } = await authedReq(tokenA, '/footprint/summary');
    assert.strictEqual(status, 200);
    assert.ok(data.profile, 'Response should include profile');
    assert.ok(data.stats, 'Response should include stats');
    assert.ok(Array.isArray(data.recentPosts), 'recentPosts should be an array');
    assert.ok(Array.isArray(data.recentComments), 'recentComments should be an array');
    assert.ok(Array.isArray(data.joinedCommunities), 'joinedCommunities should be an array');
  });

  await test('Summary does not expose password field', async () => {
    const { data } = await authedReq(tokenA, '/footprint/summary');
    assert.strictEqual(data.profile.password, undefined, 'Password must not be in response');
  });

  await test('Summary stats are real numbers, not hardcoded', async () => {
    const { data } = await authedReq(tokenA, '/footprint/summary');
    const { stats } = data;
    assert.strictEqual(typeof stats.postsCount, 'number');
    assert.strictEqual(typeof stats.commentsCount, 'number');
    assert.strictEqual(typeof stats.followersCount, 'number');
    assert.strictEqual(typeof stats.followingCount, 'number');
  });

  // ── 4. Privacy settings ──────────────────────────────────────────────────
  console.log('\n4. Privacy settings\n');

  await test('GET /footprint/privacy → returns privacy object', async () => {
    const { status, data } = await authedReq(tokenA, '/footprint/privacy');
    assert.strictEqual(status, 200);
    assert.ok(data.privacy, 'Should include privacy object');
    assert.ok(['public', 'followers', 'private'].includes(data.privacy.profileVisibility));
    assert.ok(['everyone', 'followers', 'none'].includes(data.privacy.messagingPermission));
  });

  await test('PUT /footprint/privacy → updates profileVisibility', async () => {
    const { status, data } = await authedReq(tokenA, '/footprint/privacy', {
      method: 'PUT',
      body: { profileVisibility: 'followers' },
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.privacy.profileVisibility, 'followers');
  });

  await test('PUT /footprint/privacy → updates messagingPermission', async () => {
    const { status, data } = await authedReq(tokenA, '/footprint/privacy', {
      method: 'PUT',
      body: { messagingPermission: 'none' },
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.privacy.messagingPermission, 'none');
  });

  await test('PUT /footprint/privacy → 400 for invalid visibility value', async () => {
    const { status } = await authedReq(tokenA, '/footprint/privacy', {
      method: 'PUT',
      body: { profileVisibility: 'invisible' },
    });
    assert.strictEqual(status, 400);
  });

  await test('PUT /footprint/privacy → 400 for invalid messagingPermission value', async () => {
    const { status } = await authedReq(tokenA, '/footprint/privacy', {
      method: 'PUT',
      body: { messagingPermission: 'all' },
    });
    assert.strictEqual(status, 400);
  });

  // Reset privacy to public for subsequent tests
  await authedReq(tokenA, '/footprint/privacy', {
    method: 'PUT',
    body: { profileVisibility: 'public', messagingPermission: 'everyone' },
  });

  // ── 5. Profile visibility enforcement ────────────────────────────────────
  console.log('\n5. Profile visibility enforcement\n');

  const { token: tokenB, user: userB } = await registerUser('b');

  await test('Private profile returns 403 to non-follower', async () => {
    // Set userA profile to private
    await authedReq(tokenA, '/footprint/privacy', {
      method: 'PUT',
      body: { profileVisibility: 'private' },
    });
    const { status } = await authedReq(tokenB, `/users/${userA.username}`);
    assert.strictEqual(status, 403);
    // Reset
    await authedReq(tokenA, '/footprint/privacy', {
      method: 'PUT',
      body: { profileVisibility: 'public' },
    });
  });

  await test('Public profile returns 200 to any authenticated user', async () => {
    const { status } = await authedReq(tokenB, `/users/${userA.username}`);
    assert.strictEqual(status, 200);
  });

  // ── 6. Messaging permission enforcement ──────────────────────────────────
  console.log('\n6. Messaging permission enforcement\n');

  await test('Cannot message user who set messagingPermission=none', async () => {
    // Set userA to accept no messages
    await authedReq(tokenA, '/footprint/privacy', {
      method: 'PUT',
      body: { messagingPermission: 'none' },
    });
    const { status } = await authedReq(tokenB, `/messages/with/${userA._id}`, {
      method: 'POST',
      body: { text: 'Hello!' },
    });
    assert.strictEqual(status, 403);
    // Reset
    await authedReq(tokenA, '/footprint/privacy', {
      method: 'PUT',
      body: { messagingPermission: 'everyone' },
    });
  });

  await test('Can message user when messagingPermission=everyone', async () => {
    const { status } = await authedReq(tokenB, `/messages/with/${userA._id}`, {
      method: 'POST',
      body: { text: 'Hello!' },
    });
    assert.ok([200, 201].includes(status), `Expected 200/201 but got ${status}`);
  });

  // ── 7. Block / unblock ───────────────────────────────────────────────────
  console.log('\n7. Block / unblock\n');

  await test('POST /footprint/blocked/:userId → 400 blocking yourself', async () => {
    const { status } = await authedReq(tokenA, `/footprint/blocked/${userA._id}`, {
      method: 'POST',
    });
    assert.strictEqual(status, 400);
  });

  await test('POST /footprint/blocked/:userId → 200 blocking another user', async () => {
    const { status } = await authedReq(tokenA, `/footprint/blocked/${userB._id}`, {
      method: 'POST',
    });
    assert.strictEqual(status, 200);
  });

  await test('GET /footprint/blocked → shows blocked user', async () => {
    const { status, data } = await authedReq(tokenA, '/footprint/blocked');
    assert.strictEqual(status, 200);
    const found = data.blocked.some((u) => u._id === userB._id);
    assert.ok(found, 'Blocked user should appear in blocked list');
  });

  await test('Blocked user sees 404 on blocker profile', async () => {
    const { status } = await authedReq(tokenB, `/users/${userA.username}`);
    assert.strictEqual(status, 404, 'Blocked user should see 404 on blocker profile');
  });

  await test('Blocked user cannot message blocker', async () => {
    const { status } = await authedReq(tokenB, `/messages/with/${userA._id}`, {
      method: 'POST',
      body: { text: 'Can you see this?' },
    });
    assert.strictEqual(status, 403);
  });

  await test('DELETE /footprint/blocked/:userId → unblocks user', async () => {
    const { status } = await authedReq(tokenA, `/footprint/blocked/${userB._id}`, {
      method: 'DELETE',
    });
    assert.strictEqual(status, 200);
  });

  await test('DELETE /footprint/blocked/:userId → 404 if not in list', async () => {
    const { status } = await authedReq(tokenA, `/footprint/blocked/${userB._id}`, {
      method: 'DELETE',
    });
    assert.strictEqual(status, 404);
  });

  // ── 8. Ownership checks for delete ───────────────────────────────────────
  console.log('\n8. Ownership checks for delete\n');

  // Create a post as userA
  const { data: postData } = await authedReq(tokenA, '/posts', {
    method: 'POST',
    body: { content: 'Test post for footprint delete test' },
  });
  const postId = postData.post?._id;

  await test('DELETE /footprint/posts/:id → 403 when not owner', async () => {
    assert.ok(postId, 'Post creation should have succeeded');
    const { status } = await authedReq(tokenB, `/footprint/posts/${postId}`, {
      method: 'DELETE',
    });
    assert.strictEqual(status, 403);
  });

  await test('DELETE /footprint/posts/:id → 200 when owner', async () => {
    assert.ok(postId, 'Post creation should have succeeded');
    const { status } = await authedReq(tokenA, `/footprint/posts/${postId}`, {
      method: 'DELETE',
    });
    assert.strictEqual(status, 200);
  });

  await test('DELETE /footprint/posts/:id → 404 for non-existent post', async () => {
    const { status } = await authedReq(tokenA, '/footprint/posts/000000000000000000000001', {
      method: 'DELETE',
    });
    assert.strictEqual(status, 404);
  });

  // ── 9. Security endpoint ─────────────────────────────────────────────────
  console.log('\n9. Security endpoint\n');

  await test('GET /footprint/security → returns honest security status', async () => {
    const { status, data } = await authedReq(tokenA, '/footprint/security');
    assert.strictEqual(status, 200);
    assert.ok(data.security, 'Should include security object');
    assert.strictEqual(data.security.passwordHashed, true);
    assert.strictEqual(data.security.jwtAuth, true);
    // Confirm no false claims about unimplemented features
    assert.strictEqual(data.security.emailVerified, false);
    assert.strictEqual(data.security.twoFactorEnabled, false);
    assert.strictEqual(data.security.activeSessions, null);
  });

  await test('Security response does not expose JWT_SECRET', async () => {
    const { data } = await authedReq(tokenA, '/footprint/security');
    const str = JSON.stringify(data);
    assert.ok(!str.includes(process.env.JWT_SECRET ?? ''), 'JWT_SECRET must not be in response');
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${testCounter} total`);
  if (failed > 0) {
    console.error('\nSome tests failed.\n');
    process.exit(1);
  } else {
    console.log('\nAll tests passed. ✓\n');
  }
}

run().catch((err) => {
  console.error('Unexpected error running tests:', err);
  process.exit(1);
});
