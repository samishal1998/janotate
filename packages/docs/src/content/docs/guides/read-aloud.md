---
title: Read aloud
---

Janotate can narrate a proposal section, a diagram walkthrough caption, or the current guided-review step. Choose a local CPU voice or connect an ElevenLabs-compatible speech provider. Audio plays in the browser.

## Enable it for a project

Choose **Voice** in the workspace header. Select **Kitten Nano 0.8**, **Kokoro 82M v1.0**, or **Off**. **Use voice** switches to an installed pack. On a local server, **Install and use** downloads a missing pack before switching. Hosted reviewers can choose from the packs their server operator installed. The choice applies to this project.

<img alt="Project voice settings showing Off, the two local voice packs and the optional external provider" src="../../screenshots/voice-settings.png" />

You can also enable Kitten from the directory where you run Janotate:

```sh
npx janotate voice install
```

This downloads Kitten Nano 0.8 INT8 and its native speech engine, then selects Kitten for this project. For a review running with a custom data directory, pass the same `--data` to the voice command. For example, `npx janotate voice install --data .janotate/schema-demo` enables narration on the schema and motion demos. From a source checkout use `node bin/janotate.mjs` in place of `npx janotate`.

On Linux x64, installing Kitten downloads 42.3 MB and uses about 79.1 MB of cache space, including the speech engine. The install needs `tar` with bzip2 support. The model runs on CPU and the worker releases its memory after 90 seconds idle.

Choose the speaker beside a proposal heading, diagram caption or guided stop. You can pause, resume or stop. For a long section, Janotate prepares the next passage while the current one plays. Moving to a different guided step, changing diagram captions or leaving the tab stops narration.

On a diagram walkthrough or captioned Lottie animation, open the arrow beside **Play** and choose **Play with audio**. If the project needs a voice, the same menu offers **Set up audio**. When the first audio bytes of a clip arrive, Janotate starts preparing the next passage or step. The highlighted step stays visible until its caption finishes. A captioned animation starts moving when narration starts.

Punctuation and line breaks shape the generated audio. Commas make a short pause, full stops end a sentence, and a newline makes a longer pause. Leave a blank line between paragraphs for the longest break. Common abbreviations such as “Dr.” and version numbers such as “1.2” stay together.

## Connect an ElevenLabs-compatible provider

In a local project, open **Voice**, select **ElevenLabs-compatible**, and enter the **API base URL**, **Model ID**, **Voice ID** and **API key**. Choose **Save and use provider**. The official service uses `https://api.elevenlabs.io/v1`. The prefilled model is `eleven_multilingual_v2`. Replace the voice ID with one available to your provider account. A compatible local service can use a loopback HTTP address and an empty key. Other hosts require HTTPS.

<img alt="Provider connection settings with fields for the API base URL, model ID, voice ID and write-only API key" src="../../screenshots/voice-provider.png" />

Saving settings makes no synthesis request. When someone starts narration, Janotate sends the selected text to that provider, one passage at a time, and can prepare one upcoming passage. Your provider's pricing and data-handling terms apply. The server calls `POST {base}/text-to-speech/{voice_id}/stream` with the model ID, the text and a write-only key in the `xi-api-key` header. The browser receives audio from Janotate. [ElevenLabs speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)

The project data directory stores this connection in `voice.json` with owner-only permissions. Treat this file as a secret when sharing or backing up the project. Reopening settings shows whether a key is saved. Changing the endpoint clears the old credential. **Off** disables narration and keeps the connection. **Forget connection** removes the stored settings and key.

### Hosted projects

The server operator sets the connection on the host. Supply `JANOTATE_ELEVENLABS_API_KEY` through your secret manager or environment, and set `JANOTATE_ELEVENLABS_ENDPOINT`, `JANOTATE_ELEVENLABS_MODEL_ID` and `JANOTATE_ELEVENLABS_VOICE_ID` as needed. Run `janotate voice configure-elevenlabs --data <project-data-directory>` under the service account. It reads the environment, saves the settings and selects the provider. Credentials never appear in the command output.

Hosted reviewers can select the configured provider and play narrated passages. Only the operator can change the endpoint or credentials. Run `janotate voice forget-elevenlabs --data <project-data-directory>` to remove the connection.

## Manage packs

| Command | Effect |
| --- | --- |
| `janotate voice status` | Show this project’s selection and the location and installation status of each pack. |
| `janotate voice install kokoro` | Download and select the optional Kokoro 82M v1.0 INT8 pack. |
| `janotate voice use kitten` | Select a previously installed pack for this project. |
| `janotate voice off` | Disable narration for this project and keep the downloaded files available for reuse. |

The installer shares voice files between projects owned by the same OS user. Each project stores its own choice in its data directory. Set `JANOTATE_VOICE_DIR` on both the installer and the server to use a different cache location. In hosted mode, run the install as the service account or supply a cache it can read.

Local voice installation needs network access for the selected model and the runtime for your platform. After installation, Kitten and Kokoro work offline. Their worker starts on the first request, and passages stay on the Janotate server. Janotate sends the audio back to the reviewer without storing audio files in the project.
