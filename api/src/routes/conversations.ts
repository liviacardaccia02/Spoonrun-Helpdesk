import { Router } from 'express';

import { requireAgent } from '../auth.js';
import { pool } from '../db.js';
import { latestOrderFor, orderDetails } from '../orders.js';
import { conversationDetail, findConversation } from '../queries.js';

export const conversationsRouter = Router();

conversationsRouter.get('/conversations/:id', requireAgent, async (req, res) => {
    const detail = await conversationDetail(req.agent!.id, Number(req.params.id));

    if (!detail) {
        res.status(404).json({ error: 'no such conversation' });
        return;
    }

    res.json(detail);
});

conversationsRouter.get('/conversations/:id/order', requireAgent, async (req, res) => {
    const conversation = await findConversation(req.agent!.id, Number(req.params.id));

    if (!conversation) {
        res.status(404).json({ error: 'no such conversation' });
        return;
    }

    let orderRef = conversation.orderRef;

    if (!orderRef) {
        const { rows } = await pool.query('SELECT phone FROM customers WHERE id = $1', [conversation.customerId]);
        if (rows.length > 0) {
            orderRef = await latestOrderFor(rows[0].phone);
            if (orderRef) {
                await pool.query(
                    'UPDATE conversations SET order_ref = $1 WHERE id = $2 AND order_ref IS NULL',
                    [orderRef, conversation.id],
                );
            }
        }
    }

    if (!orderRef) {
        res.json({ order: null });
        return;
    }

    res.json({ order: await orderDetails(orderRef) });
});

conversationsRouter.post('/conversations/:id/take', requireAgent, async (req, res) => {
    const agent = req.agent!;
    const conversation = await findConversation(agent.id, Number(req.params.id));

    if (!conversation) {
        res.status(404).json({ error: 'no such conversation' });
        return;
    }

    if (conversation.status === 'closed') {
        res.status(409).json({ error: 'this conversation is closed' });
        return;
    }

    if (conversation.assignedAgentId && conversation.assignedAgentId !== agent.id) {
        res.status(409).json({ error: 'this conversation is already assigned' });
        return;
    }

    if (conversation.assignedAgentId === agent.id) {
        res.json({ ok: true });
        return;
    }

    const { rowCount } = await pool.query(
        `UPDATE conversations
         SET assigned_agent_id = $1
         WHERE id = $2 AND status = 'open' AND assigned_agent_id IS NULL`,
        [agent.id, conversation.id],
    );

    if (!rowCount || rowCount === 0) {
        const current = await findConversation(agent.id, conversation.id);

        if (!current) {
            res.status(404).json({ error: 'no such conversation' });
            return;
        }

        if (current.status === 'closed') {
            res.status(409).json({ error: 'this conversation is closed' });
            return;
        }

        if (current.assignedAgentId === agent.id) {
            res.json({ ok: true });
            return;
        }

        res.status(409).json({ error: 'this conversation is already assigned' });
        return;
    }

    await pool.query(
        `INSERT INTO messages (conversation_id, direction, agent_id, body) VALUES ($1, 'note', $2, $3)`,
        [conversation.id, agent.id, `${agent.name} took this conversation`],
    );

    res.json({ ok: true });
});

conversationsRouter.post('/conversations/:id/reply', requireAgent, async (req, res) => {
    const agent = req.agent!;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    if (!text) {
        res.status(400).json({ error: 'write a reply first' });
        return;
    }

    const conversation = await findConversation(agent.id, Number(req.params.id));

    if (!conversation) {
        res.status(404).json({ error: 'no such conversation' });
        return;
    }

    const { rows } = await pool.query(
        `INSERT INTO messages (conversation_id, direction, agent_id, body) VALUES ($1, 'out', $2, $3)
         RETURNING id, direction, body, created_at AS "createdAt"`,
        [conversation.id, agent.id, text],
    );

    res.status(201).json({ ...rows[0], agentName: agent.name });
});

conversationsRouter.post('/conversations/:id/read', requireAgent, async (req, res) => {
    const agent = req.agent!;
    const conversation = await findConversation(agent.id, Number(req.params.id));

    if (!conversation) {
        res.status(404).json({ error: 'no such conversation' });
        return;
    }

    await pool.query(
        `INSERT INTO reads (agent_id, conversation_id, read_at)
         SELECT $1, $2, last_customer_message_at FROM conversations WHERE id = $2
         ON CONFLICT (agent_id, conversation_id) DO UPDATE SET read_at = EXCLUDED.read_at`,
        [agent.id, conversation.id],
    );

    res.json({ ok: true });
});

conversationsRouter.post('/conversations/:id/close', requireAgent, async (req, res) => {
    const conversation = await findConversation(req.agent!.id, Number(req.params.id));

    if (!conversation) {
        res.status(404).json({ error: 'no such conversation' });
        return;
    }

    await pool.query(`UPDATE conversations SET status = 'closed' WHERE id = $1`, [conversation.id]);

    res.json({ ok: true });
});

conversationsRouter.patch('/customers/:id', requireAgent, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

    if (!name) {
        res.status(400).json({ error: 'a customer needs a name' });
        return;
    }

    const { rows } = await pool.query(
        `UPDATE customers SET name = $1
         WHERE id = $2 AND EXISTS (
             SELECT 1 FROM conversations c
             JOIN memberships ON memberships.team_id = c.team_id AND memberships.agent_id = $3
             WHERE c.customer_id = customers.id
         )
         RETURNING id, name, phone`,
        [name, Number(req.params.id), req.agent!.id],
    );

    if (rows.length === 0) {
        res.status(404).json({ error: 'no such customer' });
        return;
    }

    res.json(rows[0]);
});
