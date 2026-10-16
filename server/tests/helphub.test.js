/**
 * helphub.test.js — Echo Help Hub Integration & Safety Test Suite
 *
 * Tests:
 * 1. Public browsing and stats endpoints (with safety disclaimer)
 * 2. Authentication enforcement on protected routes (create, edit, status, response, report)
 * 3. Privacy protection & input sanitization (rejecting phone numbers, emails, and exact street addresses)
 * 4. Request lifecycle: create -> browse -> search -> filter
 * 5. Authorization & ownership checks (preventing unauthorized edits, status changes, and cancellations)
 * 6. Help responses & status tracking (Open -> Responses Received -> Accepted)
 * 7. Reporting suspicious requests & preventing self/duplicate reporting
 * 8. Blocking user interactions
 *
 * Run with:  node server/tests/helphub.test.js
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

const uid = () => `_hh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function registerUser(suffix = '') {
  const id = uid() + suffix;
  const username = `hh_u_${id}`.slice(0, 20);
  const email = `${username}@example.com`;
  const password = 'Password123!';

  const res = await req('/auth/register', {
    method: 'POST',
    body: { username, email, password },
  });

  if (res.status !== 201) {
    throw new Error(`Failed to create test user: ${res.data.message}`);
  }

  return { token: res.data.token, user: res.data.user };
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(' ECHO HELP HUB TEST SUITE — Safety, Privacy & Workflow Tests');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Verify server is reachable
  const health = await req('/health');
  if (health.status !== 200) {
    console.error('Server is not reachable at http://localhost:3000. Start the server first.');
    process.exit(1);
  }

  // Set up test users
  const userA = await registerUser('A');
  const userB = await registerUser('B');
  const userC = await registerUser('C');

  let testRequestId = null;
  let testResponseId = null;

  // ── 1. Stats and Public Browsing ──────────────────────────────────────────
  console.log('Section 1: Public Endpoints & Safety Disclaimers');

  await test('GET /api/helphub/stats returns real counts and emergency disclaimer', async () => {
    const res = await req('/helphub/stats');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.disclaimer, 'Must include emergency service disclaimer');
    assert.match(res.data.disclaimer, /not an emergency service/i);
    assert.ok(typeof res.data.stats.totalActive === 'number');
    assert.ok(typeof res.data.stats.education === 'number');
  });

  await test('GET /api/helphub/requests allows public browsing without auth token', async () => {
    const res = await req('/helphub/requests');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.requests));
    assert.ok(res.data.pagination);
    assert.match(res.data.disclaimer, /not an emergency service/i);
  });

  // ── 2. Authentication Enforcement ─────────────────────────────────────────
  console.log('\nSection 2: Authentication Enforcement');

  await test('POST /api/helphub/requests returns 401 without auth', async () => {
    const res = await req('/helphub/requests', {
      method: 'POST',
      body: { title: 'Test Request', description: 'Testing auth' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('PUT /api/helphub/requests/:id returns 401 without auth', async () => {
    const res = await req('/helphub/requests/507f1f77bcf86cd799439011', {
      method: 'PUT',
      body: { title: 'Updated' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/helphub/requests/:id/responses returns 401 without auth', async () => {
    const res = await req('/helphub/requests/507f1f77bcf86cd799439011/responses', {
      method: 'POST',
      body: { message: 'I can help!' },
    });
    assert.strictEqual(res.status, 401);
  });

  // ── 3. Privacy Safeguards & Input Sanitization ────────────────────────────
  console.log('\nSection 3: Privacy Safeguards & Sanitization');

  await test('POST /api/helphub/requests rejects short title (<4 chars)', async () => {
    const res = await authedReq(userA.token, '/helphub/requests', {
      method: 'POST',
      body: {
        title: 'Hi',
        description: 'Need help with math calculus study',
        category: 'education',
      },
    });
    assert.strictEqual(res.status, 400);
  });

  await test('POST /api/helphub/requests rejects invalid category', async () => {
    const res = await authedReq(userA.token, '/helphub/requests', {
      method: 'POST',
      body: {
        title: 'Need calculus study buddy',
        description: 'Need help preparing for midterms',
        category: 'invalid_category_xyz',
      },
    });
    assert.strictEqual(res.status, 400);
  });

  await test('Privacy Safeguard: Rejects public phone numbers in request content', async () => {
    const res = await authedReq(userA.token, '/helphub/requests', {
      method: 'POST',
      body: {
        title: 'Need calculus tutor call me',
        description: 'Call or text me at 555-839-2019 for tutoring session details',
        category: 'education',
      },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.data.message, /phone number/i);
  });

  await test('Privacy Safeguard: Rejects personal email addresses in public requests', async () => {
    const res = await authedReq(userA.token, '/helphub/requests', {
      method: 'POST',
      body: {
        title: 'Need organic chemistry notes',
        description: 'Please email me your notes at student123@gmail.com thanks',
        category: 'education',
      },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.data.message, /email/i);
  });

  await test('Privacy Safeguard: Rejects exact residential street addresses in location', async () => {
    const res = await authedReq(userA.token, '/helphub/requests', {
      method: 'POST',
      body: {
        title: 'Need help moving boxes',
        description: 'Need assistance moving study boxes into dorm',
        category: 'personal',
        generalLocation: '124 Elm Street, Apartment 4B',
      },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.data.message, /general location/i);
  });

  // ── 4. Create and Browse Requests ─────────────────────────────────────────
  console.log('\nSection 4: Request Creation & Discovery');

  await test('User A creates valid Help Request with general landmark location', async () => {
    const res = await authedReq(userA.token, '/helphub/requests', {
      method: 'POST',
      body: {
        title: 'Need study partner for Calculus II midterm',
        description: 'Looking for someone to review integration techniques and series at the campus library.',
        category: 'education',
        requestType: 'need_help',
        urgency: 'high',
        generalLocation: 'Science Library - 2nd Floor',
        tags: ['calculus', 'math', 'study'],
      },
    });

    assert.strictEqual(res.status, 201);
    assert.ok(res.data.request._id);
    assert.strictEqual(res.data.request.status, 'Open');
    assert.strictEqual(res.data.request.category, 'education');
    testRequestId = res.data.request._id;
  });

  await test('GET /api/helphub/requests?category=education filters by category', async () => {
    const res = await req('/helphub/requests?category=education');
    assert.strictEqual(res.status, 200);
    const found = res.data.requests.find((r) => r._id === testRequestId);
    assert.ok(found, 'Created education request should be found in education category');
  });

  await test('GET /api/helphub/requests?search=Calculus searches by keyword', async () => {
    const res = await req('/helphub/requests?search=Calculus');
    assert.strictEqual(res.status, 200);
    const found = res.data.requests.find((r) => r._id === testRequestId);
    assert.ok(found, 'Should find request matching search keyword');
  });

  await test('GET /api/helphub/requests/:id returns single request with author info', async () => {
    const res = await req(`/helphub/requests/${testRequestId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.request.title, 'Need study partner for Calculus II midterm');
    assert.strictEqual(res.data.request.author.username, userA.user.username);
  });

  // ── 5. Authorization & Ownership Checks ───────────────────────────────────
  console.log('\nSection 5: Ownership & Authorization Enforcement');

  await test('User B cannot edit User A request (403 Forbidden)', async () => {
    const res = await authedReq(userB.token, `/helphub/requests/${testRequestId}`, {
      method: 'PUT',
      body: { title: 'Hacked title by unauthorized user' },
    });
    assert.strictEqual(res.status, 403);
  });

  await test('User B cannot change status of User A request (403 Forbidden)', async () => {
    const res = await authedReq(userB.token, `/helphub/requests/${testRequestId}/status`, {
      method: 'PUT',
      body: { status: 'Closed' },
    });
    assert.strictEqual(res.status, 403);
  });

  await test('User B cannot cancel User A request (403 Forbidden)', async () => {
    const res = await authedReq(userB.token, `/helphub/requests/${testRequestId}/cancel`, {
      method: 'POST',
    });
    assert.strictEqual(res.status, 403);
  });

  await test('User A (owner) can edit their own request', async () => {
    const res = await authedReq(userA.token, `/helphub/requests/${testRequestId}`, {
      method: 'PUT',
      body: {
        title: 'Need study partner for Calculus II midterm (Updated)',
        urgency: 'medium',
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.request.title, 'Need study partner for Calculus II midterm (Updated)');
    assert.strictEqual(res.data.request.urgency, 'medium');
  });

  // ── 6. Responses & Status Transitions ─────────────────────────────────────
  console.log('\nSection 6: Responses, Offers & Status Tracking');

  await test('User A cannot offer help on their own request (400 Bad Request)', async () => {
    const res = await authedReq(userA.token, `/helphub/requests/${testRequestId}/responses`, {
      method: 'POST',
      body: { message: 'I can help myself!' },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.data.message, /own request/i);
  });

  await test('User B submits an assistance offer -> status becomes Responses Received', async () => {
    const res = await authedReq(userB.token, `/helphub/requests/${testRequestId}/responses`, {
      method: 'POST',
      body: { message: 'Hi! I took Calc II last semester and got an A. Happy to review series with you on Tuesday.' },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.response.status, 'pending');
    assert.strictEqual(res.data.requestStatus, 'Responses Received');
    testResponseId = res.data.response._id;
  });

  await test('User B cannot submit duplicate pending response to same request', async () => {
    const res = await authedReq(userB.token, `/helphub/requests/${testRequestId}/responses`, {
      method: 'POST',
      body: { message: 'Sending another offer for the same request' },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.data.message, /already submitted/i);
  });

  await test('User C cannot accept User B response (403 Forbidden)', async () => {
    const res = await authedReq(
      userC.token,
      `/helphub/requests/${testRequestId}/responses/${testResponseId}`,
      {
        method: 'PUT',
        body: { action: 'accept' },
      }
    );
    assert.strictEqual(res.status, 403);
  });

  await test('User A (owner) accepts User B offer -> request status becomes Accepted', async () => {
    const res = await authedReq(
      userA.token,
      `/helphub/requests/${testRequestId}/responses/${testResponseId}`,
      {
        method: 'PUT',
        body: { action: 'accept' },
      }
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.response.status, 'accepted');
    assert.strictEqual(res.data.requestStatus, 'Accepted');
    assert.ok(res.data.chatUserId, 'Provides helper user ID for private messaging');
  });

  await test('User A transitions status to In Progress and then Completed', async () => {
    const res1 = await authedReq(userA.token, `/helphub/requests/${testRequestId}/status`, {
      method: 'PUT',
      body: { status: 'In Progress' },
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.status, 'In Progress');

    const res2 = await authedReq(userA.token, `/helphub/requests/${testRequestId}/status`, {
      method: 'PUT',
      body: { status: 'Completed' },
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.status, 'Completed');
  });

  // ── 7. Reporting & Moderation ─────────────────────────────────────────────
  console.log('\nSection 7: Reporting Suspicious Requests');

  let reportableRequestId = null;
  const newReqRes = await authedReq(userB.token, '/helphub/requests', {
    method: 'POST',
    body: {
      title: 'Free tutoring for freshmen',
      description: 'Offering free chemistry review sessions this weekend.',
      category: 'education',
      requestType: 'offer_help',
    },
  });
  reportableRequestId = newReqRes.data.request._id;

  await test('User B cannot report their own request', async () => {
    const res = await authedReq(userB.token, `/helphub/requests/${reportableRequestId}/report`, {
      method: 'POST',
      body: { reason: 'spam' },
    });
    assert.strictEqual(res.status, 400);
  });

  await test('User C reports User B request as suspicious', async () => {
    const res = await authedReq(userC.token, `/helphub/requests/${reportableRequestId}/report`, {
      method: 'POST',
      body: { reason: 'spam', details: 'Contains commercial ads' },
    });
    assert.strictEqual(res.status, 200);
  });

  await test('User C cannot report the same request twice', async () => {
    const res = await authedReq(userC.token, `/helphub/requests/${reportableRequestId}/report`, {
      method: 'POST',
      body: { reason: 'spam' },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.data.message, /already reported/i);
  });

  // ── 8. Blocking User Interactions ─────────────────────────────────────────
  console.log('\nSection 8: Blocking User Interactions');

  await test('User A blocks User C -> User C blocked', async () => {
    const res = await authedReq(userA.token, `/helphub/users/${userC.user._id}/block`, {
      method: 'POST',
    });
    assert.strictEqual(res.status, 200);
  });

  await test('User A cannot block themselves', async () => {
    const res = await authedReq(userA.token, `/helphub/users/${userA.user._id}/block`, {
      method: 'POST',
    });
    assert.strictEqual(res.status, 400);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(` RESULTS: ${passed} passed, ${failed} failed out of ${testCounter} tests`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
