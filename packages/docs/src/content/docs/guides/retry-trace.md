---
title: Trace a lost receipt
---

A field tablet saves a note as `note-42`. The server commits the write just as the tablet loses its connection. Play **Normal write**, then switch to **Lost receipt and retry** to see how the tablet recovers.

Select **Commit note and receipt** to discuss a race. If two API workers receive `note-42` at the same time, both can see an unused key. Which database constraint should prevent a second note, and what should the losing request return?

<img alt="Lost receipt and retry variant highlighting the tablet resending the queued write under its original key" src="../../screenshots/retry-trace.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes · receipt replay",
    "items": [
      {
        "kind": "diagram",
        "title": "Can a retried save create two notes?",
        "base_label": "Normal write",
        "spec": "flowchart TD\nqueue[Queue the note] --> lookup[Check client key]\nlookup --> commit[Commit note and receipt]\ncommit --> done[Mark synced]",
        "resources": {
          "commit": {
            "kind": "Action",
            "detail": "The API stores the note and its receipt in one transaction. Two workers can reach this point with the same workspace and client key."
          }
        },
        "walkthrough": [
          {
            "label": "Keep one identity for the write",
            "description": "The tablet queues the note with client key note-42. The API checks for a receipt under that workspace and key.",
            "targets": ["node:queue", "edge:queue->lookup", "node:lookup"]
          },
          {
            "label": "Commit once",
            "description": "The first request finds no receipt and commits the note and receipt together.",
            "targets": ["edge:lookup->commit", "node:commit"]
          },
          {
            "label": "Clear the queue",
            "description": "The tablet receives the receipt, marks the note synced and removes its queued write.",
            "targets": ["edge:commit->done", "node:done"]
          }
        ],
        "variants": [
          {
            "id": "retry",
            "label": "Lost receipt and retry",
            "description": "On the tablet, a lost response looks like a failed save.",
            "spec": "flowchart TD\ncommit[Note and receipt stored] --> lost[Response lost]\nlost --> retry[Retry same client key]\nretry --> replay[Return stored receipt]",
            "resources": {
              "replay": {
                "kind": "Action",
                "detail": "The API finds the original receipt for note-42 and returns its existing note ID."
              }
            },
            "walkthrough": [
              {
                "label": "Lose the acknowledgement",
                "description": "The commit succeeds. The connection drops before the response reaches the tablet, so its queue entry remains pending.",
                "targets": ["node:commit", "edge:commit->lost", "node:lost"]
              },
              {
                "label": "Resend the queued write",
                "description": "After reconnecting, the tablet sends the same payload with the original client key.",
                "targets": ["edge:lost->retry", "node:retry"]
              },
              {
                "label": "Replay the first receipt",
                "description": "The API returns the existing note ID. The tablet clears its queue and the workspace contains one note.",
                "targets": ["edge:retry->replay", "node:replay"]
              }
            ]
          }
        ]
      }
    ]
  }
}
```
