# Emex AI

Emex AI is a personal assistant website built with HTML, CSS, JavaScript, Node.js, and Express. It uses [Ollama](https://ollama.com/) to run an AI model on your own computer, so chat does not require an OpenAI API key or API billing. Chat history and the theme preference are stored in your browser.

## Requirements

- Node.js 20 or newer (npm is included)
- Ollama installed and running
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

## Configure Ollama

The defaults connect to Ollama at `http://127.0.0.1:11434` and use the `gemma3:4b` model. To use a different model, download it with `ollama pull MODEL_NAME`, then set these optional values in a project-root `.env` file and restart Emex AI:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
PORT=3000
```

You can create `.env` from `.env.example`; no API key is needed. The selected model must be downloaded in Ollama. Image questions require a vision-capable model such as the default `gemma3:4b`.

## Features

- Local AI chat with recent conversation context and locally saved conversations
- Create, rename, select, and delete conversations
- Light/dark theme toggle
- Image questions with a vision-capable Ollama model; TXT, Markdown, and common source-code attachments
- Markdown and code blocks with copy buttons
- Browser speech-to-text and read-aloud controls
- Responsive sidebar and mobile layout
- Request validation, size limits, and basic rate limiting

Web search and image generation are not available in local Ollama mode. PDF and DOCX extraction and arbitrary code execution are intentionally not implemented. The app does not execute uploaded code.

## Troubleshooting

- **Ollama is not running:** install and open the Ollama app, then refresh Emex AI.
- **Model is not installed:** run `ollama pull gemma3:4b` (or pull the model configured in `.env`) and retry.
- **Model is too slow or runs out of memory:** choose a smaller Ollama model compatible with your computer and update `OLLAMA_MODEL`.
- **Image questions do not work:** use a vision-capable model; the default `gemma3:4b` supports images.
- **Port already in use:** Emex AI automatically tries the next port unless `PORT` is explicitly set. Open the URL printed in the server terminal.
- **Microphone does not work:** use a supported browser, allow microphone access, and use localhost or HTTPS.
- **Uploads fail:** images must be PNG/JPEG/WebP and under 5 MB. Supported text and code attachments are also limited to 5 MB.
- **History is missing:** it is stored in the current browser's local storage; clearing site data removes it.

## Privacy and deployment

Chat requests go from the Emex AI server to the Ollama service configured by `OLLAMA_BASE_URL`. With Ollama running locally at its default address, prompts and attachments are processed on your computer; downloading a model requires an internet connection. Do not expose the Ollama service or this app to an untrusted network without adding appropriate authentication and access controls.

The app is intended for local use. Browser local storage is per-browser and is not shared between devices.
