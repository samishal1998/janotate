---
title: plan
---
Select a stage on the map to see its description, deliverable and annotations. The guide steps through the plan sections or their discussion threads. Each stage has its own status.

<img alt="Rollout stages with the lost-receipt rehearsal selected and its deliverable visible" src="../../screenshots/plan.png" />

Choose **Float** to move the guide over the review. **Dock** restores it to the sidebar, or under the header on a narrow screen. You can also drag the grip to the marked dock or focus the grip and press **Home**. Docking keeps the current stop and the expanded or collapsed state.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes pilot",
    "items": [
      {
        "kind": "plan",
        "title": "Offline notebook rollout",
        "nodes": [
          {
            "id": "capture",
            "label": "Capture offline",
            "description": "A technician can close the tablet immediately after saving. Keep the note and its pending upload together.",
            "deliverable": "A draft that survives an offline restart.",
            "children": [
              {
                "id": "write",
                "label": "Commit the draft",
                "description": "Write the note and its mutation identifier in one transaction.",
                "deliverable": "Both rows exist after restarting the tablet."
              }
            ]
          },
          {
            "id": "sync",
            "label": "Reconnect safely",
            "description": "Replay pending saves after signal returns. A lost response must never duplicate a note.",
            "deliverable": "One server note per mutation identifier.",
            "children": [
              {
                "id": "retry",
                "label": "Replay a lost receipt",
                "description": "Disconnect after the server writes the note, then resend the same mutation.",
                "deliverable": "The server returns the original receipt."
              },
              {
                "id": "conflict",
                "label": "Keep both edits",
                "description": "When two people edit the same base revision, retain both versions for review."
              }
            ]
          },
          {
            "id": "pilot",
            "label": "Run one shift",
            "description": "Start with two shared-tablet pairs and compare their local queues with the server at shift end.",
            "deliverable": "A go or hold decision with supporting field notes."
          }
        ]
      }
    ]
  }
}
```
