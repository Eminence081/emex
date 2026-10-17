# Emex AI

Emex AI is a personal assistant website built with HTML, CSS, JavaScript, Node.js, and Express. When run locally, it uses [Ollama](https://ollama.com/) and a model on your computer. When deployed to Vercel, it can use the Gemini API so the hosted app does not depend on Ollama running on your computer. Chat history and the theme preference are stored in your browser.

## Requirements

- Node.js 20 or newer (npm is included)
- For local AI: Ollama installed and running
- For Vercel AI: a Gemini API key configured as a server-side environment variable
- Google Chrome (recommended for speech input)

## Install and run locally

1. Install Ollama from [ollama.com/download](https://ollama.com/download) and open it.
2. In a terminal, download the default model:

   ```powershell
   ollama pull gemma3:4b
   ```

   The model download requires an internet connection and several gigabytes of disk space. The model runs locally after it has downloaded.
3. Open this project folder in VS Code and install the app dependencies:

   ```powershell
   npm install
   ```

4. Start Emex AI:

   ```powershell
   npm start
   ```

5. Open the URL printed in the terminal, usually [http://localhost:3000](http://localhost:3000).

Ollama normally starts in the background when its desktop app is open. If Emex AI says Ollama is not running, open the Ollama app and refresh Emex AI. For automatic Emex AI server restarts during development, run `npm run dev`.

## Deploy to Vercel

Vercel cannot access Ollama running on your computer. This project exposes its Express app for Vercel and uses Gemini for deployed chat.

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Vercel project, open **Settings → Environment Variables** and add `GEMINI_API_KEY`. Do not put the key in frontend code or commit it to Git.
3. Redeploy the Vercel project so the new environment variable is available.

The app has no sign-in, so anyone who can access its URL can use your Gemini quota. Keep it private or add access protection before sharing it.

The deployed app defaults to `gemini-2.5-flash`; set `GEMINI_MODEL` in Vercel to choose another supported model. The Gemini API has a free tier with usage limits; availability and quotas may vary. Review [current pricing and limits](https://ai.google.dev/gemini-api/docs/pricing). Free-tier prompts may be used by Google to improve its products; review the [Gemini API terms](https://ai.google.dev/gemini-api/terms) before sending sensitive information.

## Configure local AI

Without `GEMINI_API_KEY`, the local app connects to Ollama at `http://127.0.0.1:11434` and uses the `gemma3:4b` model. Download other models with `ollama pull MODEL_NAME`. Set optional values in a project-root `.env` file and restart Emex AI:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
PORT=3000
```

You can create `.env` from `.env.example`. If `GEMINI_API_KEY` is set, the app uses Gemini instead of local Ollama. The selected Ollama model must be downloaded locally. Image questions are supported by the default `gemma3:4b` model and Gemini's multimodal input.

## Features

- AI chat with recent conversation context and locally saved conversations (Ollama locally or Gemini on Vercel)
- Create, rename, select, and delete conversations
- Light/dark theme toggle
- Image questions with a vision-capable local or Gemini model; TXT, Markdown, and common source-code attachments
- Markdown and code blocks with copy buttons
- Browser speech-to-text and read-aloud controls
- Responsive sidebar and mobile layout
- Request validation, size limits, and basic rate limiting

Web search and image generation are not available. PDF and DOCX extraction and arbitrary code execution are intentionally not implemented. The app does not execute uploaded code.

## Troubleshooting

- **Ollama is not running locally:** install and open the Ollama app, then refresh Emex AI.
- **Vercel says Gemini is not configured:** add `GEMINI_API_KEY` under the Vercel project's environment variables, then redeploy.
- **Gemini quota or rate limit reached:** check usage in Google AI Studio and wait for the free-tier quota to reset, or review the available paid tier.
- **Local model is not installed:** run `ollama pull gemma3:4b` (or pull the model configured in `.env`) and retry.
- **Model is too slow or runs out of memory:** choose a smaller Ollama model compatible with your computer and update `OLLAMA_MODEL`.
- **Image questions do not work:** use a vision-capable local model; the default `gemma3:4b` supports images.
- **Port already in use:** Emex AI automatically tries the next port unless `PORT` is explicitly set. Open the URL printed in the server terminal.
- **Microphone does not work:** use a supported browser, allow microphone access, and use localhost or HTTPS.
- **Uploads fail:** images must be PNG/JPEG/WebP and under 5 MB. Supported text and code attachments are also limited to 5 MB.
- **History is missing:** it is stored in the current browser's local storage; clearing site data removes it.

## Privacy and deployment

When using local Ollama, chat requests go from Emex AI to the Ollama service configured by `OLLAMA_BASE_URL`. With the default address, prompts and attachments are processed on your computer; downloading a model requires an internet connection. When deployed with Gemini, chat requests and attachments are sent from the Vercel server to Google using the configured API key. Free-tier data handling is subject to Google's Gemini API terms. Never expose an API key in frontend code or an untrusted repository.

Chat history is stored in browser local storage and is not shared between devices.
