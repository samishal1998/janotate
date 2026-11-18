---
title: decisions_query
---
Search confirmed workspace decisions before asking a question. Match question words and tags, optionally filter by kind and tag, and inspect each answer's date and source. Skip the question if it is settled. Offer a stale answer as a default for explicit confirmation.

```json
{"name":"decisions_query","arguments":{"text":"export format","kinds":["decision"],"tags":["export"],"limit":5}}
```
