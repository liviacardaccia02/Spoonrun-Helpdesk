-- Demo data. Supply a local password with psql -v demo_password='...' when seeding.

INSERT INTO teams (id, name, channel) VALUES
    (1, 'Customers', 'customers'),
    (2, 'Restaurants', 'restaurants');

SELECT setval('teams_id_seq', 2);

INSERT INTO agents (id, email, name, salt, password_hash)
SELECT id, email, name, 'salt-' || id, encode(sha256(convert_to(:'demo_password' || 'salt-' || id, 'UTF8')), 'hex')
FROM (VALUES
    (1, 'supervisor@example.invalid', 'Supervisor'),
    (2, 'agent.one@example.invalid', 'Agent One'),
    (3, 'agent.two@example.invalid', 'Agent Two'),
    (4, 'agent.three@example.invalid', 'Agent Three'),
    (5, 'agent.four@example.invalid', 'Agent Four'),
    (6, 'agent.five@example.invalid', 'Agent Five')
) AS seed (id, email, name);

SELECT setval('agents_id_seq', 6);

INSERT INTO memberships (agent_id, team_id) VALUES
    (1, 1), (1, 2),
    (2, 1), (2, 2),
    (3, 1), (3, 2),
    (4, 1),
    (5, 2),
    (6, 1), (6, 2);

INSERT INTO customers (id, phone, name) VALUES
    (1, '+999 912 400 101', 'Customer One'),
    (2, '+999 912 400 102', 'Customer Two'),
    (3, '+999 912 400 103', 'Customer Three'),
    (4, '+999 912 400 104', 'Customer Four'),
    (5, '+999 912 400 105', 'Customer Five'),
    (6, '+999 912 400 106', 'Customer Six'),
    (7, '+999 912 400 107', 'Customer Seven'),
    (8, '+999 912 400 108', 'Customer Eight'),
    (9, '+999 912 400 109', 'Customer Nine'),
    (10, '+999 213 500 201', 'Restaurant One'),
    (11, '+999 213 500 202', 'Restaurant Two'),
    (12, '+999 213 500 203', 'Restaurant Three'),
    (13, '+999 213 500 204', 'Restaurant Four');

SELECT setval('customers_id_seq', 13);

INSERT INTO conversations (id, team_id, customer_id, status, assigned_agent_id, order_ref, last_customer_message_at, created_at) VALUES
    (1, 1, 1, 'open', NULL, 'ORDER-001', now() - interval '38 minutes', now() - interval '38 minutes'),
    (2, 1, 2, 'open', NULL, 'ORDER-002', now() - interval '2 minutes', now() - interval '14 minutes'),
    (3, 1, 3, 'open', NULL, 'ORDER-003', now() - interval '22 minutes', now() - interval '22 minutes'),
    (4, 1, 4, 'open', NULL, 'ORDER-004', now() - interval '9 minutes', now() - interval '9 minutes'),
    (5, 1, 5, 'open', 2, 'ORDER-005', now() - interval '25 minutes', now() - interval '31 minutes'),
    (6, 1, 6, 'open', 3, 'ORDER-006', now() - interval '3 minutes', now() - interval '20 minutes'),
    (7, 1, 7, 'open', 4, 'ORDER-007', now() - interval '6 minutes', now() - interval '26 minutes'),
    (8, 1, 8, 'closed', 2, 'ORDER-008', now() - interval '70 minutes', now() - interval '80 minutes'),
    (9, 1, 9, 'open', NULL, 'ORDER-009', now() - interval '5 minutes', now() - interval '5 minutes'),
    (10, 2, 10, 'open', NULL, NULL, now() - interval '12 minutes', now() - interval '12 minutes'),
    (11, 2, 11, 'open', NULL, NULL, now() - interval '30 minutes', now() - interval '30 minutes'),
    (12, 2, 12, 'open', 5, NULL, now() - interval '4 minutes', now() - interval '18 minutes'),
    (13, 2, 13, 'open', 6, NULL, now() - interval '16 minutes', now() - interval '24 minutes');

SELECT setval('conversations_id_seq', 13);

INSERT INTO messages (conversation_id, direction, agent_id, body, provider_message_id, created_at) VALUES
    (1, 'in', NULL, 'Hi, my order arrived without the drinks (2 lemonades). Could I get a refund for them please?', 'seed-101', now() - interval '38 minutes'),

    (2, 'in', NULL, 'where is my food', 'seed-102', now() - interval '14 minutes'),
    (2, 'in', NULL, 'hello??', 'seed-103', now() - interval '6 minutes'),
    (2, 'in', NULL, 'HELLO???', 'seed-104', now() - interval '2 minutes'),

    (3, 'in', NULL, 'The rider called and says he can''t find my building. It''s the green door next to the pharmacy.', 'seed-105', now() - interval '22 minutes'),

    (4, 'in', NULL, 'I was charged twice for one order, can you check?', 'seed-106', now() - interval '9 minutes'),
    (4, 'in', NULL, 'I was charged twice for one order, can you check?', 'seed-106', now() - interval '9 minutes'),

    (5, 'in', NULL, 'My pizza came cold and the box was crushed.', 'seed-107', now() - interval '31 minutes'),
    (5, 'note', 2, 'Agent One took this conversation', NULL, now() - interval '29 minutes'),
    (5, 'note', 4, 'Agent Three took this conversation', NULL, now() - interval '29 minutes'),
    (5, 'out', 2, 'Hello, sorry about the issue! I''ve refunded the pizza, you''ll see it in 3 to 5 days.', NULL, now() - interval '28 minutes'),
    (5, 'out', 4, 'Hello, sorry about the issue. Here''s a €10 voucher for your next order: SORRY10.', NULL, now() - interval '27 minutes'),
    (5, 'in', NULL, 'So which one is it? 😅', 'seed-108', now() - interval '25 minutes'),

    (6, 'in', NULL, 'Can I add a note for the rider? I''m on the 4th floor, no lift.', 'seed-109', now() - interval '20 minutes'),
    (6, 'note', 3, 'Agent Two took this conversation', NULL, now() - interval '19 minutes'),
    (6, 'out', 3, 'Hi Sofia! I''ve added it to the order.', NULL, now() - interval '18 minutes'),
    (6, 'in', NULL, 'Thank you!! Can you also tell him the bell doesn''t work?', 'seed-110', now() - interval '3 minutes'),

    (7, 'in', NULL, 'The app took my money but says the order failed.', 'seed-111', now() - interval '26 minutes'),
    (7, 'note', 4, 'Agent Three took this conversation', NULL, now() - interval '25 minutes'),
    (7, 'out', 4, 'Hi Jonas, checking with payments now.', NULL, now() - interval '24 minutes'),
    (7, 'in', NULL, 'Any news?', 'seed-112', now() - interval '6 minutes'),

    (8, 'in', NULL, 'Can I tip the rider after delivery?', 'seed-113', now() - interval '80 minutes'),
    (8, 'note', 2, 'Agent One took this conversation', NULL, now() - interval '79 minutes'),
    (8, 'out', 2, 'Yes! Open the order in the app and tap "Tip your rider".', NULL, now() - interval '75 minutes'),
    (8, 'in', NULL, 'Found it, thanks 🙏', 'seed-114', now() - interval '70 minutes'),

    (9, 'in', NULL, 'I just moved, can I change the address on my order that''s already being cooked?', 'seed-115', now() - interval '5 minutes'),

    (10, 'in', NULL, 'Our tablet stopped showing new orders 10 minutes ago. Are orders still coming in?', 'seed-201', now() - interval '12 minutes'),

    (11, 'in', NULL, 'A rider took the wrong bag. Order ORDER-010 went out with someone else''s food.', 'seed-202', now() - interval '30 minutes'),

    (12, 'in', NULL, 'We''re out of salmon for tonight, can you hide the salmon dishes?', 'seed-203', now() - interval '18 minutes'),
    (12, 'note', 5, 'Agent Four took this conversation', NULL, now() - interval '17 minutes'),
    (12, 'out', 5, 'Done, they''re hidden until tomorrow morning.', NULL, now() - interval '15 minutes'),
    (12, 'in', NULL, 'Thanks. Also the tuna, sorry!', 'seed-204', now() - interval '4 minutes'),

    (13, 'in', NULL, 'Can we change our opening hours for Sunday?', 'seed-205', now() - interval '24 minutes'),
    (13, 'note', 6, 'Agent Five took this conversation', NULL, now() - interval '23 minutes'),
    (13, 'out', 6, 'Of course, what hours would you like?', NULL, now() - interval '20 minutes'),
    (13, 'in', NULL, '12:00 to 15:00 only, thank you', 'seed-206', now() - interval '16 minutes');

INSERT INTO reads (agent_id, conversation_id, read_at) VALUES
    (2, 5, now() - interval '25 minutes'),
    (2, 8, now() - interval '70 minutes'),
    (6, 13, now() - interval '16 minutes');
