---
title: proposal
---

Select a passage and choose **Comment on passage**. Saved text stays highlighted. Clicking a highlight opens its thread. Click the quoted text in the thread to find the passage again. Sections support paragraphs separated by blank lines. Keep section IDs stable when revising a proposal.

<img alt="The words local receipt for each note highlighted in the delivery agreement" src="../../screenshots/proposal.png" />

The thread keeps its quoted text when the agent replies. Select the quote above the conversation to return to the passage.

<img alt="A reviewer asks whether a receipt survives a retry and the coding agent replies in the same passage thread" src="../../screenshots/proposal-thread.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes · pilot readiness",
    "items": [
      {
        "kind": "proposal",
        "title": "Pilot operating agreement",
        "sections": [
          {
            "id": "release",
            "label": "When a note counts as delivered",
            "body": "A technician can finish a shift without a connection. The tablet keeps a local receipt for each note until the server acknowledges that exact edit.\n\nA green delivery indicator means the server accepted the note. If connectivity drops after the write, the client retries with the original receipt. The technician should never have to guess whether to enter the note a second time."
          },
          {
            "id": "oncall",
            "label": "Who can pause the pilot",
            "body": "The shift lead can pause new enrollments while crews continue recording notes offline. Before the next shift, the on-call engineer compares the two receipt logs and records any gaps.\n\nIf two people edited the same note, preserve both versions and ask the shift lead to choose. Neither edit can be discarded during reconciliation."
          },
          {
            "id": "expand",
            "label": "Evidence for the second shift",
            "body": "Invite the second crew only after the first crew has completed a full offline shift. One person from each crew should be able to trace a note from the tablet through to the receipt log without help from an engineer."
          }
        ]
      }
    ]
  }
}
```
