---
title: DBML schema review
---

Use **Diagram** to inspect tables, select a column or follow a relationship. **DBML** shows the source. **Changes** compares the current schema with the optional baseline. Select a change to discuss it, including a removed column.

<img alt="Delivery schema with the notes table selected and its columns visible" src="../../screenshots/dbml.png" />

Choose **Edit DBML** to change the proposed schema in CodeMirror. **Preview patch** shows the exact diff against the agent’s proposal. **Save patch** keeps the edits when you reopen a review. **Submit review** sends the patch and any comments back to the agent.

<img alt="Preview patch showing one added replay_count column in the receipts table" src="../../screenshots/dbml-patch.png" />

The answer’s `value` contains `format` (`unified_diff`), `base_revision`, and `patch`. Apply the patch to that revision’s `source_text`. The optional `baseline` is for diagram comparison. An unchanged answer has an empty patch string. Reviews saved with earlier versions may contain the edited source as a string.

The single-file editor uses the official `@dbml/parse` compiler and shows syntax diagnostics alongside the source. React Flow renders tables and relationships locally. The change list covers table names, column types and settings, indexes, and relationship endpoints and actions. Enums, views and other DBML details remain available in the source. Referenced external files cannot be imported into a single-item review.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes · data model",
    "items": [
      {
        "kind": "dbml",
        "title": "Track delivery receipts",
        "filename": "field-notes.dbml",
        "baseline": "Table crews {\n  id uuid [pk]\n  name varchar(120) [not null]\n}\n\nTable notes {\n  id uuid [pk]\n  crew_id uuid [not null, ref: > crews.id]\n  body text\n}",
        "source_text": "Table crews {\n  id uuid [pk]\n  name varchar(120) [not null]\n}\n\nTable notes {\n  id uuid [pk]\n  crew_id uuid [not null, ref: > crews.id]\n  body text [not null]\n  client_key uuid [unique]\n}\n\nTable receipts {\n  id uuid [pk]\n  note_id uuid [not null, ref: > notes.id]\n  accepted_at timestamp [not null]\n}"
      }
    ]
  }
}
```
