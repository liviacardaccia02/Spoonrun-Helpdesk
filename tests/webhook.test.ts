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

test('duplicate webhook delivery with the same messageId creates only one message', async () => {
    const team = await newTeam();
    const phone = uniquePhone();
    const messageId = `msg-${uniqueId()}`;

    const res1 = await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Dedup Tester',
        text: 'Where is my order?',
        messageId,
    });
    assert.equal(res1.status, 200);

    // Duplicate retry from provider
    const res2 = await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Dedup Tester',
        text: 'Where is my order?',
        messageId,
    });
    assert.equal(res2.status, 200);

    const id = await conversationOf(team.id, phone);
    const token = await signIn(server.base, team.agents[0]);
    const conversation = await (await fetch(`${server.base}/api/conversations/${id}`, { headers: authed(token) })).json();

    const inMessages = conversation.messages.filter((m: { direction: string }) => m.direction === 'in');
    assert.equal(inMessages.length, 1);
    assert.equal(inMessages[0].body, 'Where is my order?');
});

test('concurrent webhook deliveries of the same messageId create only one message', async () => {
    const team = await newTeam();
    const phone = uniquePhone();
    const messageId = `msg-concurrent-${uniqueId()}`;

    const [res1, res2] = await Promise.all([
        customerWrites(server.base, {
            channel: team.channel,
            phone,
            name: 'Concurrent Tester',
            text: 'I was charged twice',
            messageId,
        }),
        customerWrites(server.base, {
            channel: team.channel,
            phone,
            name: 'Concurrent Tester',
            text: 'I was charged twice',
            messageId,
        }),
    ]);

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);

    const id = await conversationOf(team.id, phone);
    const token = await signIn(server.base, team.agents[0]);
    const conversation = await (await fetch(`${server.base}/api/conversations/${id}`, { headers: authed(token) })).json();

    const inMessages = conversation.messages.filter((m: { direction: string }) => m.direction === 'in');
    assert.equal(inMessages.length, 1);
    assert.equal(inMessages[0].body, 'I was charged twice');
});

test('distinct messages from the same customer are both preserved', async () => {
    const team = await newTeam();
    const phone = uniquePhone();

    const res1 = await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Distinct Tester',
        text: 'First question',
        messageId: `msg-1-${uniqueId()}`,
    });
    assert.equal(res1.status, 200);

    const res2 = await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Distinct Tester',
        text: 'Second question',
        messageId: `msg-2-${uniqueId()}`,
    });
    assert.equal(res2.status, 200);

    const id = await conversationOf(team.id, phone);
    const token = await signIn(server.base, team.agents[0]);
    const conversation = await (await fetch(`${server.base}/api/conversations/${id}`, { headers: authed(token) })).json();

    const inMessages = conversation.messages.filter((m: { direction: string }) => m.direction === 'in');
    assert.equal(inMessages.length, 2);
    assert.equal(inMessages[0].body, 'First question');
    assert.equal(inMessages[1].body, 'Second question');
});

test('duplicate delivery does not reopen a closed conversation', async () => {
    const team = await newTeam();
    const phone = uniquePhone();
    const messageId = `msg-close-${uniqueId()}`;

    await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Reopen Tester',
        text: 'Need help',
        messageId,
    });

    const id = await conversationOf(team.id, phone);
    const token = await signIn(server.base, team.agents[0]);

    // Agent takes and closes the conversation
    await fetch(`${server.base}/api/conversations/${id}/take`, { method: 'POST', headers: authed(token) });
    await fetch(`${server.base}/api/conversations/${id}/close`, { method: 'POST', headers: authed(token) });

    const beforeConv = await (await fetch(`${server.base}/api/conversations/${id}`, { headers: authed(token) })).json();
    assert.equal(beforeConv.status, 'closed');

    // Duplicate delivery of the already-processed message arrives
    const dupRes = await customerWrites(server.base, {
        channel: team.channel,
        phone,
        name: 'Reopen Tester',
        text: 'Need help',
        messageId,
    });
    assert.equal(dupRes.status, 200);

    const afterConv = await (await fetch(`${server.base}/api/conversations/${id}`, { headers: authed(token) })).json();
    assert.equal(afterConv.status, 'closed');
});
