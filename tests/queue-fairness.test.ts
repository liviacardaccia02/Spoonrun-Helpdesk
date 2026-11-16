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

test('an older waiting conversation appears before a newer waiting conversation (FIFO)', async () => {
    const team = await newTeam();
    const token = await signIn(server.base, team.agents[0]);

    const now = Date.now();
    const phoneOld = uniquePhone();
    const phoneNew = uniquePhone();

    // Customer Old writes first (10 minutes ago)
    await customerWrites(server.base, {
        channel: team.channel,
        phone: phoneOld,
        name: 'Customer Older',
        text: 'I have waited patiently',
        sentAt: new Date(now - 10 * 60 * 1000),
    });

    // Customer New writes later (2 minutes ago)
    await customerWrites(server.base, {
        channel: team.channel,
        phone: phoneNew,
        name: 'Carlos New',
        text: 'Just placed order',
        sentAt: new Date(now - 2 * 60 * 1000),
    });

    const queueRes = await fetch(`${server.base}/api/teams/${team.id}/queue`, { headers: authed(token) });
    assert.equal(queueRes.status, 200);
    const queue = await queueRes.json();

    assert.equal(queue.length, 2);
    assert.equal(queue[0].customerName, 'Customer Older');
    assert.equal(queue[1].customerName, 'Carlos New');
});

test('a customer sending repeated messages does not jump ahead of an older waiting conversation', async () => {
    const team = await newTeam();
    const token = await signIn(server.base, team.agents[0]);

    const now = Date.now();
    const phonePolite = uniquePhone();
    const phonePushy = uniquePhone();

    // Polite customer wrote 30 minutes ago and didn't write again
    await customerWrites(server.base, {
        channel: team.channel,
        phone: phonePolite,
        name: 'Customer Polite',
        text: 'My order is late',
        sentAt: new Date(now - 30 * 60 * 1000),
    });

    // Pushy customer wrote 10 minutes ago
    await customerWrites(server.base, {
        channel: team.channel,
        phone: phonePushy,
        name: 'Customer Follow-up',
        text: 'Where is food',
        sentAt: new Date(now - 10 * 60 * 1000),
    });

    // Pushy customer sends multiple follow-ups now
    await customerWrites(server.base, {
        channel: team.channel,
        phone: phonePushy,
        name: 'Customer Follow-up',
        text: 'hello??',
        sentAt: new Date(now - 1 * 60 * 1000),
        messageId: `pushy-2-${uniqueId()}`,
    });

    await customerWrites(server.base, {
        channel: team.channel,
        phone: phonePushy,
        name: 'Customer Follow-up',
        text: 'hello??? ANSWER ME',
        sentAt: new Date(now),
        messageId: `pushy-3-${uniqueId()}`,
    });

    const queueRes = await fetch(`${server.base}/api/teams/${team.id}/queue`, { headers: authed(token) });
    const queue = await queueRes.json();

    assert.equal(queue.length, 2);
    // The polite customer must remain ahead despite repeated follow-ups
    assert.equal(queue[0].customerName, 'Customer Polite');
    assert.equal(queue[1].customerName, 'Customer Follow-up');
});

test('assigned conversations remain excluded from the waiting queue', async () => {
    const team = await newTeam();
    const token = await signIn(server.base, team.agents[0]);
    const phone = uniquePhone();

    await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Assigned Tester',
        text: 'Need help',
    });

    const id = await conversationOf(team.id, phone);

    // Prior to take: in queue
    const queueBefore = await (await fetch(`${server.base}/api/teams/${team.id}/queue`, { headers: authed(token) })).json();
    assert.equal(queueBefore.length, 1);
    assert.equal(queueBefore[0].id, id);

    // Agent takes conversation
    const takeRes = await fetch(`${server.base}/api/conversations/${id}/take`, { method: 'POST', headers: authed(token) });
    assert.equal(takeRes.status, 200);

    // After take: excluded from queue
    const queueAfter = await (await fetch(`${server.base}/api/teams/${team.id}/queue`, { headers: authed(token) })).json();
    assert.equal(queueAfter.length, 0);
});

test('closed conversations remain excluded from the waiting queue', async () => {
    const team = await newTeam();
    const token = await signIn(server.base, team.agents[0]);
    const phone = uniquePhone();

    await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Closed Queue Tester',
        text: 'Done',
    });

    const id = await conversationOf(team.id, phone);
    await fetch(`${server.base}/api/conversations/${id}/close`, { method: 'POST', headers: authed(token) });

    const queue = await (await fetch(`${server.base}/api/teams/${team.id}/queue`, { headers: authed(token) })).json();
    assert.equal(queue.length, 0);
});

test('existing team scoping is preserved', async () => {
    const teamA = await newTeam();
    const teamB = await newTeam();

    const tokenA = await signIn(server.base, teamA.agents[0]);
    const phoneA = uniquePhone();
    const phoneB = uniquePhone();

    await customerWrites(server.base, {
        channel: teamA.channel,
        phone: phoneA,
        name: 'Team A Customer',
        text: 'Hello A',
    });

    await customerWrites(server.base, {
        channel: teamB.channel,
        phone: phoneB,
        name: 'Team B Customer',
        text: 'Hello B',
    });

    // Agent A only sees Team A's conversation
    const queueA = await (await fetch(`${server.base}/api/teams/${teamA.id}/queue`, { headers: authed(tokenA) })).json();
    assert.equal(queueA.length, 1);
    assert.equal(queueA[0].customerName, 'Team A Customer');

    // Agent A cannot access Team B's queue (404)
    const queueBForbidden = await fetch(`${server.base}/api/teams/${teamB.id}/queue`, { headers: authed(tokenA) });
    assert.equal(queueBForbidden.status, 404);
});

test('equal timestamps produce deterministic ordering by id ASC', async () => {
    const team = await newTeam();
    const token = await signIn(server.base, team.agents[0]);
    const timestamp = new Date('2026-11-08T10:00:00Z');

    const phone1 = uniquePhone();
    const phone2 = uniquePhone();

    await customerWrites(server.base, {
        channel: team.channel,
        phone: phone1,
        name: 'Tie Customer 1',
        text: 'Simultaneous 1',
        sentAt: timestamp,
    });

    await customerWrites(server.base, {
        channel: team.channel,
        phone: phone2,
        name: 'Tie Customer 2',
        text: 'Simultaneous 2',
        sentAt: timestamp,
    });

    const id1 = await conversationOf(team.id, phone1);
    const id2 = await conversationOf(team.id, phone2);
    assert.ok(id1 < id2, 'Expected id1 to be smaller than id2');

    const queue = await (await fetch(`${server.base}/api/teams/${team.id}/queue`, { headers: authed(token) })).json();
    assert.equal(queue.length, 2);
    assert.equal(queue[0].id, id1);
    assert.equal(queue[1].id, id2);
});
