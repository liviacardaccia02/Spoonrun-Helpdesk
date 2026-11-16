-- Migration 03: Ensure provider_message_id is unique on messages for webhook idempotency

-- 1. Deduplicate any existing messages that share the same provider_message_id
DELETE FROM messages a USING messages b
WHERE a.id > b.id
  AND a.provider_message_id = b.provider_message_id
  AND a.provider_message_id IS NOT NULL;

-- 2. Create unique index on provider_message_id
CREATE UNIQUE INDEX IF NOT EXISTS messages_provider_message_id_idx
ON messages (provider_message_id);
