import "dotenv/config";
import express from "express";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3000;
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const ollamaModel = process.env.OLLAMA_MODEL || "gemma3:4b";
const maxImageBytes = 5 * 1024 * 1024;
const maxTextCharacters = 500_000;
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const textExtensions = /\.(txt|md|markdown|html|css|js|mjs|cjs|ts|tsx|jsx|json|py|java|php|c|h|cpp|cs|go|rs|rb|sh|sql|xml|yaml|yml)$/i;

app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "public")));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute and try again." }
});

async function callOllama(endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${ollamaBaseUrl}${endpoint}`, options);
  } catch {
    const error = new Error("Ollama is not running. Install and open Ollama, then try again.");
    error.status = 503;
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error("Ollama returned an invalid response. Check that Ollama is running and try again.");
    error.status = 502;
    throw error;
  }

  if (!response.ok) {
    if (response.status === 404) {
      const error = new Error(`The local model "${ollamaModel}" is not installed. Run: ollama pull ${ollamaModel}`);
      error.status = 503;
      throw error;
    }
    const error = new Error("Ollama could not complete the request. Check that the selected model is installed and try again.");
    error.status = 502;
    throw error;
  }
  return data;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24) {
    return "Please send between 1 and 24 recent messages.";
  }
  for (const message of messages) {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      return "Messages must contain a valid role and text content.";
    }
    if (message.content.length > maxTextCharacters) return "A message is too large.";
  }
  return null;
}

function validateAttachment(attachment) {
  if (!attachment) return null;
  if (typeof attachment !== "object" || typeof attachment.name !== "string") {
    return "The attachment is invalid.";
  }
  if (attachment.type === "image") {
    if (!allowedImageTypes.has(attachment.mimeType) || typeof attachment.data !== "string") {
      return "Use a PNG, JPEG, or WebP image.";
    }
    const match = attachment.data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[1] !== attachment.mimeType) return "The image data is invalid.";
    const byteLength = Buffer.from(match[2], "base64").length;
    if (byteLength === 0 || byteLength > maxImageBytes) return "Images must be smaller than 5 MB.";
    return null;
  }
  if (attachment.type === "text") {
    if (!textExtensions.test(attachment.name) || typeof attachment.text !== "string") {
      return "That text-file type is not supported.";
    }
    if (attachment.text.length > maxTextCharacters) return "Text files must be smaller than 500,000 characters.";
    return null;
  }
  return "Only image and supported text/code file attachments are accepted.";
}

app.get("/api/health", async (_req, res) => {
  try {
    const data = await callOllama("/api/tags", { signal: AbortSignal.timeout(3000) });
    const models = Array.isArray(data.models) ? data.models : [];
    const modelInstalled = models.some((model) => model.name === ollamaModel || model.model === ollamaModel);
    res.json({
      ok: true,
      provider: "ollama",
      available: true,
      model: ollamaModel,
      modelInstalled,
      ready: modelInstalled,
      message: modelInstalled ? "" : `Download the local model by running: ollama pull ${ollamaModel}`
    });
  } catch (error) {
    res.json({
      ok: true,
      provider: "ollama",
      available: false,
      model: ollamaModel,
      modelInstalled: false,
      ready: false,
      message: error.message
    });
  }
});

app.post("/api/chat", apiLimiter, async (req, res, next) => {
  try {
    const { messages, webSearch = false, attachment } = req.body ?? {};
    const messageError = validateMessages(messages);
    if (messageError) return res.status(400).json({ error: messageError });
    const attachmentError = validateAttachment(attachment);
    if (attachmentError) return res.status(400).json({ error: attachmentError });
    if (webSearch) {
      return res.status(400).json({ error: "Web search is not available in local Ollama mode. Turn off web search to continue." });
    }

    const input = messages.slice(-12).map(({ role, content }) => ({ role, content }));
    if (attachment?.type === "image") {
      const lastUserIndex = input.findLastIndex((message) => message.role === "user");
      if (lastUserIndex < 0) return res.status(400).json({ error: "Ask a question along with the image." });
      input[lastUserIndex].images = [attachment.data.slice(attachment.data.indexOf(",") + 1)];
    } else if (attachment?.type === "text") {
      const lastUserIndex = input.findLastIndex((message) => message.role === "user");
      if (lastUserIndex < 0) return res.status(400).json({ error: "Ask a question along with the file." });
      input[lastUserIndex].content += `\n\nAttached file: ${attachment.name}\n\n${attachment.text}`;
    }

    const response = await callOllama("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        messages: [
          {
            role: "system",
            content: "You are Emex AI, a friendly, intelligent, practical assistant. Be clear and natural. Be honest about uncertainty and do not claim to search the web. Ask a concise clarifying question when important details are missing. Format code in fenced Markdown code blocks."
          },
          ...input
        ]
      })
    });
    res.json({
      text: response.message?.content || "I could not produce a text response. Please try again.",
      citations: []
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/images/generate", apiLimiter, async (req, res, next) => {
  try {
    const prompt = req.body?.prompt;
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
      return res.status(400).json({ error: "Enter an image description of up to 4,000 characters." });
    }
    res.status(501).json({
      error: "Image generation is not included with local Ollama chat. You can continue chatting without API billing."
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "The request is too large. Please reduce the attachment size." });
  }
  const status = Number.isInteger(error.status) ? error.status : 502;
  res.status(status).json({
    error: status === 503 || status === 502 ? error.message : "The request could not be processed."
  });
});

function startServer(startPort) {
  const server = app.listen(startPort, () => {
    console.log(`Emex AI is running at http://localhost:${startPort}`);
  });

  server.on("error", (error) => {
    if (error.code !== "EADDRINUSE") {
      throw error;
    }

    const nextPort = startPort + 1;
    if (!process.env.PORT) {
      console.warn(`Port ${startPort} is busy. Retrying on ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    console.error(`Port ${startPort} is already in use. Set PORT to a free port or stop the process using it.`);
    process.exitCode = 1;
  });
}

startServer(port);
