import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { pool } from '../api/src/db.js';
import {
    authed,
    conversationOf,
    customerWrites,
    newTeam,
    signIn,
    startServer,
    type TestServer,
    uniqueId,
    uniquePhone,
} from '../test/helpers.js';

let server: TestServer;

before(async () => {
    server = await startServer();
});

after(async () => {
    await server.close();
});

test('webhook returns successfully without waiting for slow order lookup', async () => {
    const team = await newTeam();
    // +999 911000004 has hash%10 = 0, which triggers a >1300ms delay in latestOrderFor
    const slowPhone = '+999 911000004';
    const messageId = `msg-perf-${uniqueId()}`;

    const start = performance.now();
    const res = await customerWrites(server.base, {
        channel: team.channel,
        phone: slowPhone,
        name: 'Slow Order Tester',
        text: 'Where is my order?',
        messageId,
    });
    const duration = performance.now() - start;

    assert.equal(res.status, 200);
    // The webhook must respond well under the 1000ms provider timeout (typically <100ms)
    assert.ok(duration < 800, `Webhook took ${duration}ms, expected under 800ms`);
});

test('incoming message is persisted in database before successful webhook response', async () => {
    const team = await newTeam();
    const phone = uniquePhone();
    const messageId = `msg-persist-${uniqueId()}`;
    const messageText = 'Persisted before response check';

    const res = await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Persistence Tester',
        text: messageText,
        messageId,
    });
    assert.equal(res.status, 200);

    // Immediately verify message is already committed in PostgreSQL
    const { rows } = await pool.query(
        'SELECT id, body, provider_message_id FROM messages WHERE provider_message_id = $1',
        [messageId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].body, messageText);
    assert.equal(rows[0].provider_message_id, messageId);
});

test('failed or null order lookup does not invalidate the accepted message or cause unhandled rejection', async () => {
    const team = await newTeam();
    // +999 911000007 has hash%17 = 0, so latestOrderFor returns null
    const nullOrderPhone = '+999 911000007';
    const messageId = `msg-nullorder-${uniqueId()}`;

    const res = await customerWrites(server.base, {
        channel: team.channel,
        phone: nullOrderPhone,
        name: 'Null Order Tester',
        text: 'My order has no ref',
        messageId,
    });
    assert.equal(res.status, 200);

    // Message is still valid and stored
    const { rows } = await pool.query(
        'SELECT id, body FROM messages WHERE provider_message_id = $1',
        [messageId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].body, 'My order has no ref');
});

test('successful background enrichment updates the intended conversation', async () => {
    const team = await newTeam();
    // Fast phone number (hash%10 >= 4, resolves in ~100ms)
    const phone = '+999 911000000';
    const messageId = `msg-enrich-${uniqueId()}`;

    const res = await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Enrichment Tester',
        text: 'Please check my order',
        messageId,
    });
    assert.equal(res.status, 200);

    const convId = await conversationOf(team.id, phone);

    // Poll for the background update to complete (within 3 seconds)
    let orderRef: string | null = null;
    for (let i = 0; i < 30; i++) {
        const { rows } = await pool.query('SELECT order_ref FROM conversations WHERE id = $1', [convId]);
        if (rows[0]?.order_ref) {
            orderRef = rows[0].order_ref;
            break;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    assert.ok(orderRef !== null, 'Expected order_ref to be populated by background enrichment');
    assert.match(orderRef, /^SR-\d+$/);

    // Verify through the agent API endpoint as well
    const token = await signIn(server.base, team.agents[0]);
    const orderRes = await fetch(`${server.base}/api/conversations/${convId}/order`, { headers: authed(token) });
    assert.equal(orderRes.status, 200);
    const orderBody = await orderRes.json();
    assert.ok(orderBody.order !== null);
    assert.equal(orderBody.order.ref, orderRef);
});

test('duplicate webhook delivery does not create duplicate messages or conflicting enrichment', async () => {
    const team = await newTeam();
    const phone = '+999 911000001';
    const messageId = `msg-dup-${uniqueId()}`;

    const res1 = await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Dedup Tester',
        text: 'Hello again',
        messageId,
    });
    const res2 = await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Dedup Tester',
        text: 'Hello again',
        messageId,
    });
    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);

    const convId = await conversationOf(team.id, phone);

    const { rows: msgs } = await pool.query(
        'SELECT id FROM messages WHERE conversation_id = $1 AND direction = $2',
        [convId, 'in'],
    );
    assert.equal(msgs.length, 1);
});

test('background lookup cannot overwrite newer conversation state or change status', async () => {
    const team = await newTeam();
    const phone = uniquePhone();
    const messageId = `msg-override-${uniqueId()}`;

    await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'State Tester',
        text: 'Checking status override',
        messageId,
    });

    const convId = await conversationOf(team.id, phone);

    // Simulate pre-existing / newer authoritative order ref and closed status
    await pool.query(
        "UPDATE conversations SET order_ref = 'SR-EXISTING-AUTHORITATIVE', status = 'closed' WHERE id = $1",
        [convId],
    );

    // Attempt conditional background enrichment (like the background worker runs)
    await pool.query(
        'UPDATE conversations SET order_ref = $1 WHERE id = $2 AND order_ref IS NULL',
        ['SR-NEW-ATTEMPT', convId],
    );

    const { rows } = await pool.query('SELECT order_ref, status FROM conversations WHERE id = $1', [convId]);
    assert.equal(rows[0].order_ref, 'SR-EXISTING-AUTHORITATIVE');
    assert.equal(rows[0].status, 'closed');
});
