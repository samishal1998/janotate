---
title: Configuration and results
---
| Setting | Effect |
| --- | --- |
| --port | Select the application listener port. The local default is derived from the data directory. |
| --data | Project data directory. Defaults to .janotate under the working directory. |
| --session | Default new reviews to a temporary store. |
| --no-open | Print the URL without launching a browser. |
| --host | Start a foreground hosted server. Requires both tokens. |
| JANOTATE_UI_TOKEN | Browser login secret for hosted mode. |
| JANOTATE_MCP_TOKEN | Independent bearer secret for hosted MCP. |
| JANOTATE_PUBLIC_ORIGIN | Browser-visible application origin behind a proxy. |
| JANOTATE_FRAME_ORIGIN | Distinct browser-visible HTML frame origin. |
| JANOTATE_FRAME_PORT | Frame listener port. Without a proxy the default is an available port. |

A done result contains review_id, submitted_at, answers (item_id, status and value), comments (item_id, anchor, body and created_at) and skipped item ids. Repeated review_get calls return the saved result. Open reviews expose the current items and threads. Expired reviews refuse further edits.

Unknown ids produce not_found. For invalid_items or a schema validation error, inspect the named field and correct the call. A review_closed error requires a new review. A project allows 100 open reviews per store. On quota, finish an existing review. On unauthorized, check the token for the specific interface.
