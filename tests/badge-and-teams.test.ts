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

test('unread badge only counts conversations assigned to the requesting agent', async () => {
    const team = await newTeam();
    const phone1 = uniquePhone();
    const phone2 = uniquePhone();

    // Customer 1 writes
    await customerWrites(server.base, {
        channel: team.channel,
        phone: phone1,
        name: 'Badge Customer 1',
        text: 'Help 1',
    });

    // Customer 2 writes
    await customerWrites(server.base, {
        channel: team.channel,
        phone: phone2,
        name: 'Badge Customer 2',
        text: 'Help 2',
    });

    const tokenA = await signIn(server.base, team.agents[0]);
    const tokenB = await signIn(server.base, team.agents[1]);

    // Before any assignment, neither agent owns a conversation -> badge must be 0 for both
    const badgeA0 = await (await fetch(`${server.base}/api/badge`, { headers: authed(tokenA) })).json();
    const badgeB0 = await (await fetch(`${server.base}/api/badge`, { headers: authed(tokenB) })).json();
    assert.equal(badgeA0.unread, 0);
    assert.equal(badgeB0.unread, 0);

    // Agent A takes conversation 1
    const id1 = await conversationOf(team.id, phone1);
    await fetch(`${server.base}/api/conversations/${id1}/take`, { method: 'POST', headers: authed(tokenA) });

    // Agent A has not read conversation 1 yet -> Agent A badge = 1, Agent B badge = 0
    const badgeA1 = await (await fetch(`${server.base}/api/badge`, { headers: authed(tokenA) })).json();
    const badgeB1 = await (await fetch(`${server.base}/api/badge`, { headers: authed(tokenB) })).json();
    assert.equal(badgeA1.unread, 1);
    assert.equal(badgeB1.unread, 0);

    // Agent A reads conversation 1 -> Agent A badge = 0
    await fetch(`${server.base}/api/conversations/${id1}/read`, { method: 'POST', headers: authed(tokenA) });
    const badgeA2 = await (await fetch(`${server.base}/api/badge`, { headers: authed(tokenA) })).json();
    assert.equal(badgeA2.unread, 0);

    // Customer 1 writes back to conversation 1 -> Agent A badge becomes 1, Agent B remains 0
    await customerWrites(server.base, {
        channel: team.channel,
        phone: phone1,
        name: 'Badge Customer 1',
        text: 'Any updates?',
        messageId: `msg-back-${uniqueId()}`,
    });

    const badgeA3 = await (await fetch(`${server.base}/api/badge`, { headers: authed(tokenA) })).json();
    const badgeB3 = await (await fetch(`${server.base}/api/badge`, { headers: authed(tokenB) })).json();
    assert.equal(badgeA3.unread, 1);
    assert.equal(badgeB3.unread, 0);

    // Agent A closes conversation 1 -> badge becomes 0
    await fetch(`${server.base}/api/conversations/${id1}/close`, { method: 'POST', headers: authed(tokenA) });
    const badgeA4 = await (await fetch(`${server.base}/api/badge`, { headers: authed(tokenA) })).json();
    assert.equal(badgeA4.unread, 0);
});

test('switching teams updates session current_team_id and preserves memberships', async () => {
    const team1 = await newTeam();
    const team2 = await newTeam();

    // Add agent 0 of team1 to team2
    const token = await signIn(server.base, team1.agents[0]);
    const me = await (await fetch(`${server.base}/api/me`, { headers: authed(token) })).json();
    await pool.query('INSERT INTO memberships (agent_id, team_id) VALUES ($1, $2)', [me.agent.id, team2.id]);

    // Open team 2
    const openRes = await fetch(`${server.base}/api/teams/${team2.id}/open`, { headers: authed(token) });
    assert.equal(openRes.status, 200);
    const openBody = await openRes.json();
    assert.equal(openBody.id, team2.id);

    // Verify /desk returns currentTeamId as team2.id
    const deskRes = await fetch(`${server.base}/api/desk`, { headers: authed(token) });
    assert.equal(deskRes.status, 200);
    const deskBody = await deskRes.json();
    assert.equal(deskBody.currentTeamId, team2.id);

    // Trying to open a team where agent is not a member returns 404
    const notMyTeam = await newTeam();
    const invalidOpen = await fetch(`${server.base}/api/teams/${notMyTeam.id}/open`, { headers: authed(token) });
    assert.equal(invalidOpen.status, 404);
});
