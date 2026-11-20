---
title: diagram
---
Switch between the baseline flowchart and its named variants. Click a node or edge to anchor a comment to that version. The renderer supports named nodes and arrows in LR, TD and TB Mermaid flowcharts.

<img alt="Lost receipt variant showing the retry and receipt lookup path" src="../../screenshots/diagram.png" />

Add an optional `walkthrough` array to the base diagram or any variant. Each of its 1–32 steps takes a `label` (up to 100 characters), a `description` (up to 600 characters), and 1–12 distinct `targets`. Refer to named nodes with `node:ID` and directed connections with `edge:FROM->TO`. Targets must exist in that version of the diagram.

**Play** advances every four seconds and stops on the final step. The arrows move one step at a time. Changing variants opens its first step, paused. Selecting a resource pauses playback for discussion. Reduced-motion preferences keep the highlights static. The [Kubernetes and GitHub Actions example](../../guides/infrastructure/) includes a walkthrough for each variant.

For narration, open the arrow on the **Play** button and choose **Play with audio**. Each step stays highlighted until its caption finishes speaking.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes pilot",
    "items": [
      {
        "kind": "diagram",
        "title": "Compare reconnect paths",
        "base_label": "Normal save",
        "spec": "flowchart TD\nTablet[Tablet] --> Queue[Pending save] --> Server[Server] --> Receipt[Receipt]",
        "variants": [
          {
            "id": "retry",
            "label": "Lost receipt",
            "description": "The first write succeeds. A repeated request finds the original receipt.",
            "spec": "flowchart TD\nTablet[Tablet] --> Queue[Pending save] --> Server[Server]\nQueue --> Retry[Retry same ID] --> Lookup[Look up receipt]\nServer --> Receipt[Receipt]\nLookup --> Receipt",
            "walkthrough": [
              {
                "label": "Record the first write",
                "description": "The server accepts the queued note and stores its receipt. The response can still be lost.",
                "targets": ["node:Server", "edge:Server->Receipt", "node:Receipt"]
              },
              {
                "label": "Recover the original receipt",
                "description": "The tablet retries with the same key. The server finds the existing receipt and returns it.",
                "targets": ["node:Retry", "edge:Retry->Lookup", "node:Lookup", "edge:Lookup->Receipt", "node:Receipt"]
              }
            ]
          },
          {
            "id": "conflict",
            "label": "Concurrent edit",
            "description": "A changed base revision routes the new edit to review.",
            "spec": "flowchart TD\nTablet[Tablet] --> Server[Server] --> Compare[Check revision]\nCompare --> Keep[Keep both edits] --> Review[Reviewer]"
          }
        ]
      }
    ]
  }
}
```
