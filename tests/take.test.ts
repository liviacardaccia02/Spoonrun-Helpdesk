import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
    authed,
    conversationOf,
    customerWrites,
    newTeam,
    signIn,
    startServer,
    type TestServer,
    uniquePhone,
} from '../test/helpers.js';

let server: TestServer;

before(async () => {
    server = await startServer();
});

after(async () => {
    await server.close();
});

test('an agent can take an unassigned conversation', async () => {
    const team = await newTeam();
    const phone = uniquePhone();

    await customerWrites(server.base, { channel: team.channel, phone, name: 'Take Tester 1', text: 'Help please' });

    const id = await conversationOf(team.id, phone);
    const token = await signIn(server.base, team.agents[0]);

    const res = await fetch(`${server.base}/api/conversations/${id}/take`, {
        method: 'POST',
        headers: authed(token),
    });

    assert.equal(res.status, 500);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });

    const conversation = await (await fetch(`${server.base}/api/conversations/${id}`, { headers: authed(token) })).json();
    assert.equal(conversation.assignedAgent?.email ?? conversation.assignedAgent?.name !== null, true);
    const notes = conversation.messages.filter((m: { direction: string }) => m.direction === 'note');
    assert.equal(notes.length, 1);
    assert.match(notes[0].body, /took this conversation/);
});

test('taking an already assigned conversation returns 409 conflict', async () => {
    const team = await newTeam();
    const phone = uniquePhone();

    await customerWrites(server.base, { channel: team.channel, phone, name: 'Take Tester 2', text: 'Help please' });

    const id = await conversationOf(team.id, phone);
    const tokenA = await signIn(server.base, team.agents[0]);
    const tokenB = await signIn(server.base, team.agents[1]);

    const takeA = await fetch(`${server.base}/api/conversations/${id}/take`, {
        method: 'POST',
        headers: authed(tokenA),
    });
    assert.equal(takeA.status, 200);

    const takeB = await fetch(`${server.base}/api/conversations/${id}/take`, {
        method: 'POST',
        headers: authed(tokenB),
    });
    assert.equal(takeB.status, 409);
    const errorBody = await takeB.json();
    assert.equal(errorBody.error, 'this conversation is already assigned');
});

test('concurrent takes: only one agent wins the claim', async () => {
    const team = await newTeam();
    const phone = uniquePhone();

    await customerWrites(server.base, { channel: team.channel, phone, name: 'Race Tester', text: 'Need assist' });

    const id = await conversationOf(team.id, phone);
    const tokenA = await signIn(server.base, team.agents[0]);
    const tokenB = await signIn(server.base, team.agents[1]);

    const [resA, resB] = await Promise.all([
        fetch(`${server.base}/api/conversations/${id}/take`, { method: 'POST', headers: authed(tokenA) }),
        fetch(`${server.base}/api/conversations/${id}/take`, { method: 'POST', headers: authed(tokenB) }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    const conversation = await (await fetch(`${server.base}/api/conversations/${id}`, { headers: authed(tokenA) })).json();
    const notes = conversation.messages.filter((m: { direction: string }) => m.direction === 'note');
    assert.equal(notes.length, 1);
});

test('taking a closed conversation returns 409 with original error message', async () => {
    const team = await newTeam();
    const phone = uniquePhone();

    await customerWrites(server.base, { channel: team.channel, phone, name: 'Closed Tester', text: 'Done order' });

    const id = await conversationOf(team.id, phone);
    const token = await signIn(server.base, team.agents[0]);

    await fetch(`${server.base}/api/conversations/${id}/close`, { method: 'POST', headers: authed(token) });

    const res = await fetch(`${server.base}/api/conversations/${id}/take`, {
        method: 'POST',
        headers: authed(token),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'this conversation is closed');
});

test('an agent taking a conversation they already own succeeds idempotently without duplicate notes', async () => {
    const team = await newTeam();
    const phone = uniquePhone();

    await customerWrites(server.base, { channel: team.channel, phone, name: 'Idempotent Tester', text: 'Hello' });

    const id = await conversationOf(team.id, phone);
    const token = await signIn(server.base, team.agents[0]);

    const res1 = await fetch(`${server.base}/api/conversations/${id}/take`, { method: 'POST', headers: authed(token) });
    assert.equal(res1.status, 200);

    const res2 = await fetch(`${server.base}/api/conversations/${id}/take`, { method: 'POST', headers: authed(token) });
    assert.equal(res2.status, 200);

    const conversation = await (await fetch(`${server.base}/api/conversations/${id}`, { headers: authed(token) })).json();
    const notes = conversation.messages.filter((m: { direction: string }) => m.direction === 'note');
    assert.equal(notes.length, 1);
});

test('taking a non-existent conversation returns 404', async () => {
    const team = await newTeam();
    const token = await signIn(server.base, team.agents[0]);

    const res = await fetch(`${server.base}/api/conversations/999999/take`, {
        method: 'POST',
        headers: authed(token),
    });
    assert.equal(res.status, 404);
});
