---
title: Kubernetes and GitHub Actions
---

Drag nodes on the React Flow canvas, pan the background, or use the zoom and fit controls. The node buttons and connection selector provide keyboard access and share the same comment anchors as the canvas.

Use named flowchart nodes and attach resource metadata by node ID. Each variant can have its own resource map. Select a node to inspect its role or start a discussion about it. This view describes a deployment or workflow supplied by the agent.

Choose **Play** to follow a request into the cluster. Each step highlights the resources and connections in the current explanation. Switch to **GitHub Actions** to walk through the checks that gate a preview deployment. Use the previous and next arrows to inspect a step at your own pace. Selecting a resource or connection pauses playback and lets you attach a comment.

Open the arrow beside **Play** and choose **Play with audio** to hear the title and caption of each highlighted step. The next clip is prepared in the background and the diagram advances when the current narration finishes. **Play** keeps the timed, silent walkthrough.

<img alt="GitHub Actions walkthrough highlighting the jobs for the selected step" src="../../screenshots/infrastructure.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes · pilot readiness",
    "items": [
      {
        "kind": "diagram",
        "title": "From pull request to the pilot cluster",
        "base_label": "Kubernetes",
        "spec": "flowchart TD\nentry[Pilot ingress] --> svc[Notes API]\nsvc --> pod[API replicas]\ndeploy[Notes rollout] --> pod",
        "walkthrough": [
          {
            "label": "Route the request",
            "description": "Pilot ingress forwards the note write to the stable Notes API endpoint.",
            "targets": ["node:entry", "edge:entry->svc", "node:svc"]
          },
          {
            "label": "Choose a ready replica",
            "description": "The Service sends the write to a ready API pod. The pod persists the note and records its receipt.",
            "targets": ["node:svc", "edge:svc->pod", "node:pod"]
          },
          {
            "label": "Roll out the next version",
            "description": "The Deployment replaces API replicas. The Service keeps routing to ready pods as the rollout progresses.",
            "targets": ["node:deploy", "edge:deploy->pod", "node:pod"]
          }
        ],
        "resources": {
          "entry": {
            "kind": "Ingress",
            "detail": "Routes pilot traffic to the notes service."
          },
          "svc": {
            "kind": "Service",
            "detail": "Provides one stable endpoint for the active API replicas."
          },
          "deploy": {
            "kind": "Deployment",
            "detail": "Keeps the target number of replicas ready through rollout."
          },
          "pod": {
            "kind": "Pod",
            "detail": "Handles note writes and records their receipts."
          }
        },
        "variants": [
          {
            "id": "ci",
            "label": "GitHub Actions",
            "description": "The preview deploy requires both the API tests and the image build.",
            "spec": "flowchart TD\npr[Pull request] --> test[API tests]\npr --> image[Build image]\ntest --> deploy[Preview deploy]\nimage --> deploy",
            "walkthrough": [
              {
                "label": "Open the pull request",
                "description": "A proposed change to the pilot branch starts the validation workflow.",
                "targets": ["node:pr"]
              },
              {
                "label": "Run checks in parallel",
                "description": "API tests verify receipt handling while the build job packages the candidate container.",
                "targets": ["edge:pr->test", "node:test", "edge:pr->image", "node:image"]
              },
              {
                "label": "Deploy the preview",
                "description": "Both jobs must succeed before the preview environment receives the candidate image.",
                "targets": ["edge:test->deploy", "edge:image->deploy", "node:deploy"]
              }
            ],
            "resources": {
              "pr": {
                "kind": "Trigger",
                "detail": "A proposed change targeting the pilot release branch."
              },
              "test": {
                "kind": "Job",
                "detail": "Checks receipt replay and conflict handling."
              },
              "image": {
                "kind": "Job",
                "detail": "Builds the candidate container."
              },
              "deploy": {
                "kind": "Environment",
                "detail": "Holds the preview until the checks pass."
              }
            }
          }
        ]
      }
    ]
  }
}
```
