# Engineering decisions

## Friday-lunch replay: before and after

The same simulated workload was replayed before and after the fixes: 30 customers and 10 restaurants wrote in over one hour, while two demo agents handled the customer queue.

### Before

```text
Messages
  customer messages shown twice or more        16   ✗
  messages the provider had to send again      32   ✗

Taking customers
  customers answered                            8
  customers taken by two agents at once         8   ✗
  customers who got two different answers       8   ✗

Who waited
  top of the queue                              newer ticket (older ticket waited 60 min)   ✗
  answered before someone who waited longer    8   ✗

Unread badge
  displayed count did not match assigned work  ✗

Replay time                                    11.1 s
```

### After

```text
Messages
  customer messages shown twice or more         0   ✓
  messages the provider had to send again       0   ✓

Taking customers
  customers answered                           16
  customers taken by two agents at once         0   ✓
  customers who got two different answers       0   ✓

Who waited
  oldest waiting ticket at the top              ✓
  answered before someone who waited longer    0   ✓

Unread badge
  both agents' counts matched expected values  ✓

Replay time                                     1.9 s
```

The final replay showed every message once, one agent per customer, fair queue ordering, and accurate unread counts. The exact unread badge values can vary with the replay state; the final recorded run showed 3 for each demo agent.

## What was wrong

- **Customers who followed up could jump ahead.** The waiting list showed the most recently updated conversation first. A customer who sent repeated messages could therefore move ahead of someone who had been waiting longer.

- **Two agents could take the same conversation.** If two agents clicked “Take” at nearly the same time, both could believe they owned the conversation. The customer could then receive conflicting responses or duplicate resolutions.

- **Messages could appear more than once.** When the webhook took too long to acknowledge a message, the messaging provider retried it. The application did not reliably recognize that the retry was the same message, so it stored another copy.

- **The “Mine” badge could be misleading.** It included unread conversations in the shared team queue, even when those conversations had not been assigned to the agent.

- **Changing teams could happen accidentally.** Hovering over a team triggered a request that also changed the active team. The conversation list could then remain stale until its next refresh.

## What changed

- **Fair queue ordering:** waiting conversations are now ordered by their waiting-start timestamp, oldest first. Follow-up messages do not reset that timestamp. Reopened conversations start a new waiting period.
- **Atomic conversation claiming:** the database assigns an unassigned open conversation to one agent in a single conditional update. A competing claim receives a conflict response. Taking an already-owned conversation remains idempotent.
- **Webhook idempotency:** a unique constraint on provider message IDs and an atomic insert prevent duplicate records and repeated side effects.
- **Faster webhook acknowledgement:** optional order lookup runs in the background, so the customer message is saved and acknowledged without waiting for that lookup. A fallback lookup is available if enrichment did not complete.
- **Accurate unread counts:** the “Mine” badge is scoped to unread conversations assigned to the signed-in agent.
- **Safer team switching:** hover no longer changes the active team. The conversation list updates when the selected team changes, and the previous conversation selection is cleared.

## What remains

- **Mobile layout and dark mode:** mobile keyboard spacing, reply-box positioning, and dark-mode polish were identified as worthwhile usability improvements. They were not implemented because the remaining hackathon time was prioritized for message integrity, safe ownership, and queue fairness. The UI work should be tested on actual mobile viewports before being considered complete.
- **Quarterly finance export:** a CSV or report export for quarterly refund reporting was requested, but it is separate from the core support workflow and was not implemented during the hackathon.

## Verification

- 28 automated tests passed; 0 failed.
- The final workload replay reported 0 duplicate messages, 0 provider retries, 0 simultaneous double-claims, and 0 conflicting customer answers.
- The replay reported 0 cases where an agent answered someone who had waited less time than another waiting customer.
- The final replay completed in 1.9 seconds.

## Notes for future development

- `api/src/queries.ts`: `listWaiting` orders by `created_at ASC, id ASC` for FIFO ordering and deterministic tie-breaking.
- `api/src/routes/webhook.ts`: reopened conversations receive a new waiting-start timestamp; follow-ups on already-open conversations do not change it.
- `api/src/routes/conversations.ts`: conversation ownership uses a conditional database update.
- The webhook relies on a unique index for `messages(provider_message_id)` and `INSERT ... ON CONFLICT DO NOTHING`.
- The optional order lookup runs in the background; the order endpoint can fall back to a lookup if enrichment did not complete.
- Regression tests cover queue fairness, simultaneous claims, duplicate webhook deliveries, background order enrichment, unread badge scoping, and team switching.
