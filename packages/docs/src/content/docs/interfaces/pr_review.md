---
title: Pull request review
---

Follow a pull request by the reasons for the change. Each group explains a behavior and links its explanation to the diff. Open **Findings** to inspect a risk or a question at the lines that prompted it. **Coverage** lists each changed file and the home of every hunk, including generated files and changes the author marked unclassified.

<img alt="A pull request finding with a discussion attached to its explanation" src="../../screenshots/pr_review.png" />

The [receipt retry report](../../examples/receipt-review.json) follows a tablet upload across three files. A stable key lets the server reuse a receipt. The finding shows what happens when the note is inserted and saving its receipt fails.

Save the example as `receipt-review.json` and open it from your project.

```sh
npx janotate review-pr receipt-review.json
```

An MCP client can send the same report directly. The following function accepts the contents of a local `review.json` and returns the tool call.

```js
function openPullRequest(report) {
  return {
    name: 'review_open',
    arguments: {
      title: report.pr?.title ?? report.summary.essence,
      items: [{ kind: 'pr_review', title: 'Review the change', report }],
    },
  }
}
```

Janotate accepts version 2 reports produced by the feynman-review builder. Pass the complete report with its summary, ordered groups, findings, file and hunk ledgers, unclassified reasons and coverage counts. Janotate verifies file membership, hunk ownership, coverage totals and referenced evidence against the visible diff. Reports may include truncated or redacted evidence. Both are labeled in the viewer. Coverage describes the supplied ledger. The reviewer makes a separate, explicit decision.

Open **Trace a retry across the change** to follow the example’s change map. Selecting a group or finding in the map opens its explanation. Reports can supply a Mermaid flowchart or leave the map out. Janotate shows the authored source for diagrams outside its supported flowchart syntax.

## Annotate an explanation or diff

Select words in a finding or change explanation and choose **Comment on passage**. In **Annotate** mode, you can also click a whole passage or a code row. A saved quote stays highlighted, and clicking it reopens the conversation.

Passage comments record the wording, surrounding text, report section and ledger. Clicking a numbered story, related change or scope point captures its full text. If the report changes, Janotate checks the original wording before returning you to it. Named sections and files use node anchors.

Select a gutter line number to comment on one side of the diff. For a range, choose **Select lines** and select the first and last gutter numbers on the same side. **Enter** selects a focused number. **Escape** cancels the range. You can also hold **Shift** while clicking the end of a selection.

<img alt="Selected new lines 22 through 24 in the receipt write, with a marker for the saved discussion" src="../../screenshots/pr-review-lines.png" />

**Discuss hunk**, **Discuss group** and **Discuss finding** select broader targets. The chat marker beside a line opens the saved discussion. Clicking its file and line label returns to the evidence.

In Discussion, choose **This location** to see the threads on the selected target. **View source** returns focus to its passage, file, or first selected line. Choose **Comment on whole PR** for general feedback. Switching targets preserves the draft you were writing at each location.

<img alt="A reviewer and coding agent discussing whether the selected writes can share a transaction" src="../../screenshots/pr-review-thread.png" />

The agent receives the exact target, including anchors such as `pr:line:h001:new:23` or `pr:lines:h001:new:22-24`. Group, finding and hunk anchors use `pr:group:reuse-receipt`, `pr:finding:two-writes` and `pr:hunk:h001`. Each node anchor carries the report’s `ledger_id` so a thread still identifies its original diff after a revision.

Choose **Approve**, **Request changes** or **Comment only**, then submit the review. The result contains `{ "verdict": "approve" }`, `{ "verdict": "request_changes" }` or `{ "verdict": "comment" }`, plus the discussion threads. A skipped item appears in the review's skipped list. Verdicts and comments stay in Janotate.
