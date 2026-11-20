---
title: Lottie animation
---

Send an inline Lottie composition to review motion. The player opens paused. Drag the timeline or use the previous and next frame buttons to inspect a transition. **Play** runs it once. Leaving the item in focus mode, opening Threads, hiding the browser tab or switching to reduced motion pauses playback. Choose **Play** to continue from that frame.

<img alt="Queued delivery animation paused on a frame with an annotation range selected" src="../../screenshots/lottie.png" />

Choose **Comment on frame** to discuss one frame. For a span, choose **Mark range start**, scrub to the other end and choose **Comment on frames**. Selecting the thread location returns to the annotated frame or the beginning of the range. The agent receives a node anchor such as `frame:12` or `frames:12-24`. Frame numbers follow the composition, including a nonzero `ip`. Both ends of a comment range are inclusive. Check **Reviewed** and submit to record the review.

Add a plain-text `caption` of up to 2,000 characters to the item. Older animations can use the composition name (`animation.nm`) as the caption. Open the arrow beside **Play** and choose **Play with audio**. The animation starts at its first frame when the narration begins. A longer caption finishes over the final frame. You can pause, resume, or stop both together. Scrubbing returns to frame inspection.

The local SVG player accepts self-contained 2D shapes, solids and null layers. Use ellipses, rectangles, paths, groups, fills, strokes, trim paths and transforms. Scenes support up to 96 layers, 120 seconds, 120 fps and 4096 pixels per side. Convert artwork to inline vector shapes before sending it. External media, fonts, expressions, effects, masks and precompositions are unsupported.

For a longer example, download [Paper crane at last light](../../examples/paper-crane.json) and pass the JSON as the item's `animation`. Its four markers appear in the guided review. Scrub to frame 134 to catch the wingtip touching the lake, then step forward to see the ripples spread.

This example moves a delivery marker along its track.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes · sync motion",
    "items": [{
      "kind": "lottie",
      "title": "Queued note delivery",
      "caption": "The cyan marker moves along the track.\nIt slows as the note reaches its destination.",
      "animation": {
        "v": "5.12.0", "nm": "A cyan delivery marker travels along a violet track",
        "fr": 24, "ip": 0, "op": 48, "w": 320, "h": 120, "assets": [],
        "layers": [
          {
            "ty": 4, "ind": 1, "nm": "Delivery marker", "ip": 0, "op": 48, "st": 0, "sr": 1,
            "ks": {
              "o": {"a": 0, "k": 100}, "r": {"a": 0, "k": 0}, "a": {"a": 0, "k": [0,0]},
              "s": {"a": 0, "k": [100,100]}, "p": {"a": 1, "k": [
                {"t": 0, "s": [46,60], "e": [274,60], "i": {"x": 0.18, "y": 1}, "o": {"x": 0.55, "y": 0}},
                {"t": 40, "s": [274,60]}
              ]}
            },
            "shapes": [
              {"ty": "el", "p": {"a": 0, "k": [0,0]}, "s": {"a": 0, "k": [21,21]}},
              {"ty": "fl", "c": {"a": 0, "k": [0.08,0.76,0.85,1]}, "o": {"a": 0, "k": 100}}
            ]
          },
          {
            "ty": 4, "ind": 2, "nm": "Track", "ip": 0, "op": 48, "st": 0, "sr": 1,
            "ks": {
              "o": {"a": 0, "k": 100}, "r": {"a": 0, "k": 0}, "p": {"a": 0, "k": [160,60]},
              "a": {"a": 0, "k": [0,0]}, "s": {"a": 0, "k": [100,100]}
            },
            "shapes": [
              {"ty": "rc", "p": {"a": 0, "k": [0,0]}, "s": {"a": 0, "k": [252,27]}, "r": {"a": 0, "k": 13}},
              {"ty": "fl", "c": {"a": 0, "k": [0.30,0.27,0.67,1]}, "o": {"a": 0, "k": 100}}
            ]
          }
        ]
      }
    }]
  }
}
```
