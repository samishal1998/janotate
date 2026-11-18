---
title: diagram
---
Use a Mermaid flowchart with named nodes and arrows. Select a node or edge to comment.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Review a change",
    "items": [
      {
        "kind": "diagram",
        "title": "diagram",
        "spec": "flowchart LR\nAgent[Agent] --> Review[Review]"
      }
    ]
  }
}
```

<img alt="Review controls for diagram" src="../../screenshots/diagram.png" />
