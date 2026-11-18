---
title: Agent instructions
---
Copy this instruction into your project guidance.

> Before asking a question, call decisions_query with the project terms. Reuse a current answer. For a stale ruling, offer it as a default to confirm. Collect the remaining questions in one review_open call and show the reviewer its URL. Use review_wait with holds of at most 45 seconds. After ten minutes of pending results, stop and report the review id. On the next prompt use review_get. Read skips separately from confirmations. If a thread needs clarification, reply with item_update while the review is open.
