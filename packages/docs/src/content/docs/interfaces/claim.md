---
title: claim
---
Mark each statement as verified, wrong or needing research. Save your answer to send the agent a state for each claim.

<img alt="Three offline delivery claims with their evidence and verification states" src="../../screenshots/claim.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Project choices",
    "items": [
      {
        "title": "Verify offline delivery",
        "kind": "claim",
        "claims": [
          {
            "id": "offline",
            "label": "Drafts survive a restart.",
            "evidence": "The local restart test recovered all queued notes."
          },
          {
            "id": "retry",
            "label": "A retry creates one receipt.",
            "evidence": "The reconnect test covers a dropped response."
          },
          {
            "id": "clock",
            "label": "Device clock drift is safe.",
            "evidence": "The current tests use synchronized clocks."
          }
        ]
      }
    ]
  }
}
```
