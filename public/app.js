const STORAGE_KEY = "emex-ai-conversations-v1";
const THEME_KEY = "emex-ai-theme";
const $ = (selector) => document.querySelector(selector);

const elements = {
  sidebar: $("#sidebar"), sidebarScrim: $("#sidebarScrim"), conversationList: $("#conversationList"),
  chatView: $("#chatView"), welcome: $("#welcome"), messages: $("#messages"), imageView: $("#imageView"),
  generatedResult: $("#generatedResult"), composer: $("#composer"), input: $("#messageInput"),
  sendButton: $("#sendButton"), fileInput: $("#fileInput"), attachmentPreview: $("#attachmentPreview"),
  toast: $("#toast"), composerHint: $("#composerHint")
};

let conversations = loadConversations();
let activeId = conversations[0]?.id || null;
let attachment = null;
let isGenerating = false;
let selectedMode = "chat";
let toastTimer;

function loadConversations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages)) : [];
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function activeConversation() {
  return conversations.find((chat) => chat.id === activeId);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 4200);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function safeLink(href) {
  try {
    const url = new URL(href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(text) {
  let output = escapeHtml(text);
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*(.+?)\*/g, "<em>$1</em>");
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, href) => {
    const valid = safeLink(href);
    return valid ? `<a href="${escapeHtml(valid)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  return output;
}

function renderMarkdown(markdown) {
  const codeBlocks = [];
  let source = markdown.replace(/```([\w#+.-]*)\n?([\s\S]*?)```/g, (_match, language, code) => {
    const id = codeBlocks.length;
    codeBlocks.push({ language: language || "code", code });
    return `\u0000CODE${id}\u0000`;
  });
  const lines = source.split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length) blocks.push(`<${listType}>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${listType}>`);
    listItems = [];
    listType = "";
  };
  for (const line of lines) {
    const codeMatch = line.match(/^\u0000CODE(\d+)\u0000$/);
    if (codeMatch) {
      flushParagraph(); flushList();
      const item = codeBlocks[Number(codeMatch[1])];
      blocks.push(`<div class="code-wrap"><div class="code-header"><span>${escapeHtml(item.language)}</span><button class="copy-code" type="button">Copy code</button></div><pre><code>${escapeHtml(item.code)}</code></pre></div>`);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      const level = Math.min(heading[1].length + 1, 3);
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const listMatch = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      const nextType = /^\s*\d+\./.test(line) ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType; listItems.push(listMatch[1]);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushParagraph(); flushList();
      blocks.push(`<blockquote>${inlineMarkdown(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(line); }
  }
  flushParagraph(); flushList();
  return blocks.join("");
}

function addMessageElement(message, index) {
  const row = document.createElement("article");
  row.className = `message ${message.role}`;
  const avatar = document.createElement("div");
  avatar.className = `avatar ${message.role === "assistant" ? "assistant-avatar" : ""}`;
  avatar.textContent = message.role === "assistant" ? "✦" : "Y";
  avatar.setAttribute("aria-hidden", "true");
  const body = document.createElement("div");
  body.className = "message-body";
  body.innerHTML = renderMarkdown(message.content || "");
  row.append(avatar, body);

  body.querySelectorAll(".copy-code").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.closest(".code-wrap").querySelector("pre").innerText;
      try { await navigator.clipboard.writeText(code); button.textContent = "Copied"; setTimeout(() => button.textContent = "Copy code", 1300); }
      catch { toast("Clipboard access was blocked by the browser."); }
    });
  });

  if (message.role === "assistant") {
    const citations = Array.isArray(message.citations) ? message.citations : [];
    if (citations.length) {
      const links = document.createElement("div");
      links.className = "citations";
      citations.forEach((citation) => {
        const href = safeLink(citation.url);
        if (!href) return;
        const link = document.createElement("a");
        link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.textContent = citation.title || href;
        links.append(link);
      });
      body.append(links);
    }
    const tools = document.createElement("div");
    tools.className = "message-tools";
    const copy = document.createElement("button");
    copy.type = "button"; copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(message.content); copy.textContent = "Copied"; setTimeout(() => copy.textContent = "Copy", 1300); }
      catch { toast("Clipboard access was blocked by the browser."); }
    });
    const speak = document.createElement("button");
    speak.type = "button"; speak.textContent = "Read aloud";
    speak.addEventListener("click", () => speakText(message.content));
    tools.append(copy, speak);
    if (index === activeConversation()?.messages.length - 1) {
      const rename = document.createElement("button");
      rename.type = "button"; rename.textContent = "New chat";
      rename.title = "Start a new conversation";
      rename.addEventListener("click", startNewChat);
      tools.append(rename);
    }
    body.append(tools);
  }
  elements.messages.append(row);
}

function renderConversation() {
  const conversation = activeConversation();
  elements.messages.replaceChildren();
  const isEmpty = !conversation || conversation.messages.length === 0;
  elements.welcome.classList.toggle("hidden", !isEmpty || selectedMode !== "chat");
  elements.chatView.classList.toggle("hidden", selectedMode !== "chat");
  elements.imageView.classList.toggle("hidden", selectedMode !== "image");
  if (conversation) conversation.messages.forEach(addMessageElement);
  elements.chatView.scrollTop = elements.chatView.scrollHeight;
  renderConversationList();
}

function renderConversationList() {
  elements.conversationList.replaceChildren();
  conversations.forEach((conversation) => {
    const row = document.createElement("div");
    row.className = `conversation-item${conversation.id === activeId ? " selected" : ""}`;
    const glyph = document.createElement("span"); glyph.className = "chat-glyph"; glyph.textContent = "◷";
    const title = document.createElement("span"); title.textContent = conversation.title || "New conversation"; title.title = title.textContent;
    const actions = document.createElement("span"); actions.className = "chat-actions";
    const rename = document.createElement("button"); rename.type = "button"; rename.textContent = "✎"; rename.title = "Rename conversation";
    rename.addEventListener("click", (event) => { event.stopPropagation(); renameConversation(conversation.id); });
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.title = "Delete conversation";
    remove.addEventListener("click", (event) => { event.stopPropagation(); deleteConversation(conversation.id); });
    actions.append(rename, remove); row.append(glyph, title, actions);
    row.addEventListener("click", () => { activeId = conversation.id; selectedMode = "chat"; updateModeButtons(); renderConversation(); closeSidebar(); });
    elements.conversationList.append(row);
  });
}

function renameConversation(id) {
  const conversation = conversations.find((chat) => chat.id === id);
  if (!conversation) return;
  const title = prompt("Rename this conversation:", conversation.title);
  if (title === null) return;
  if (!title.trim()) return toast("A conversation name cannot be empty.");
  conversation.title = title.trim().slice(0, 80);
  persist(); renderConversationList();
}

function deleteConversation(id) {
  conversations = conversations.filter((chat) => chat.id !== id);
  if (activeId === id) activeId = conversations[0]?.id || null;
  persist(); renderConversation();
}

function startNewChat() {
  activeId = null; selectedMode = "chat"; updateModeButtons(); renderConversation(); elements.input.focus(); closeSidebar();
}

function getOrCreateConversation() {
  let conversation = activeConversation();
  if (!conversation) {
    conversation = { id: makeId(), title: "New conversation", messages: [], updatedAt: Date.now() };
    conversations.unshift(conversation); activeId = conversation.id;
  }
  return conversation;
}

function setBusy(busy) {
  isGenerating = busy;
  elements.sendButton.disabled = busy;
  elements.sendButton.setAttribute("aria-label", busy ? "Waiting for response" : "Send message");
}

async function submitChat() {
  const text = elements.input.value.trim();
  if (isGenerating) return;
  if (!text && !attachment) return;
  if (!text && attachment) return toast("Add a question or instruction before sending the attachment.");
  const conversation = getOrCreateConversation();
  conversation.messages.push({ role: "user", content: text });
  if (conversation.messages.length === 1) conversation.title = text.slice(0, 38) + (text.length > 38 ? "…" : "");
  const upload = attachment;
  attachment = null; elements.attachmentPreview.classList.add("hidden"); elements.attachmentPreview.replaceChildren();
  elements.input.value = ""; resizeInput(); persist(); renderConversation();
  setBusy(true);
  const typing = document.createElement("div");
  typing.className = "message assistant"; typing.id = "typing";
  typing.innerHTML = '<div class="avatar assistant-avatar">✦</div><div class="message-body"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
  elements.messages.append(typing); elements.chatView.scrollTop = elements.chatView.scrollHeight;
  try {
    const response = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conversation.messages.slice(-12).map(({ role, content }) => ({ role, content })),
        webSearch: $("#webSearch").checked,
        attachment: upload
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The request failed (${response.status}).`);
    conversation.messages.push({ role: "assistant", content: data.text, citations: data.citations || [] });
    conversation.updatedAt = Date.now(); persist();
    if ($("#speakResponses").checked) speakText(data.text);
  } catch (error) {
    conversation.messages.push({ role: "assistant", content: `**I couldn't complete that request.** ${error.message}` });
    persist();
  } finally {
    setBusy(false); renderConversation();
  }
}

function resizeInput() {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 150)}px`;
}

function attachFile(file) {
  if (!file) return;
  const imageAllowed = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
  const textAllowed = /\.(txt|md|markdown|html|css|js|mjs|ts|tsx|jsx|json|py|java|php|c|h|cpp|cs|go|rs|rb|sh|sql|xml|yaml|yml)$/i.test(file.name);
  if (!imageAllowed && !textAllowed) return toast("Choose a PNG, JPEG, WebP image or supported text/code file.");
  if (file.size > 5 * 1024 * 1024) return toast("Attachments must be smaller than 5 MB.");
  if (imageAllowed) {
    const reader = new FileReader();
    reader.onerror = () => toast("The selected image could not be read.");
    reader.onload = () => {
      attachment = { type: "image", name: file.name, mimeType: file.type, data: reader.result };
      renderAttachmentPreview(file.name, reader.result);
    };
    reader.readAsDataURL(file);
  } else {
    const reader = new FileReader();
    reader.onerror = () => toast("The selected file could not be read.");
    reader.onload = () => {
      attachment = { type: "text", name: file.name, text: String(reader.result) };
      renderAttachmentPreview(file.name);
    };
    reader.readAsText(file);
  }
}

function renderAttachmentPreview(name, imageData) {
  const image = imageData ? `<img alt="" src="${imageData}">` : "";
  elements.attachmentPreview.innerHTML = `${image}<span>${escapeHtml(name)}</span><button type="button" aria-label="Remove attachment">×</button>`;
  elements.attachmentPreview.classList.remove("hidden");
  elements.attachmentPreview.querySelector("button").addEventListener("click", () => {
    attachment = null; elements.fileInput.value = ""; elements.attachmentPreview.classList.add("hidden"); elements.attachmentPreview.replaceChildren();
  });
}

async function generateImage() {
  const promptText = elements.input.value.trim();
  if (!promptText || isGenerating) {
    if (!promptText) toast("Describe the image you would like to create.");
    return;
  }
  setBusy(true); elements.composerHint.textContent = "Creating your image...";
  elements.generatedResult.classList.add("hidden");
  try {
    const response = await fetch("/api/images/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: promptText })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The request failed (${response.status}).`);
    const image = document.createElement("img"); image.src = data.image; image.alt = `AI-generated image: ${promptText}`;
    const link = document.createElement("a"); link.href = data.image; link.download = "emex-ai-image.png"; link.textContent = "Download image";
    elements.generatedResult.replaceChildren(image, link); elements.generatedResult.classList.remove("hidden");
    elements.input.value = ""; resizeInput();
  } catch (error) { toast(error.message); }
  finally {
    setBusy(false);
    elements.composerHint.textContent = selectedMode === "image"
      ? "Image generation is not available in local Ollama mode."
      : "Emex AI can make mistakes. Check important info.";
  }
}

function speakText(text) {
  if (!("speechSynthesis" in window)) return toast("Read-aloud is not supported in this browser.");
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, " code block "));
  window.speechSynthesis.speak(utterance);
}

function setupMicrophone() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast("Speech input is not supported by this browser. Try Chrome.");
  const recognition = new Recognition();
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = false;
  recognition.onresult = (event) => { elements.input.value += `${elements.input.value ? " " : ""}${event.results[0][0].transcript}`; resizeInput(); elements.input.focus(); };
  recognition.onerror = (event) => {
    const messages = { "not-allowed": "Microphone permission was denied. Allow microphone access in Chrome's site settings.", "service-not-allowed": "Speech recognition is unavailable for this browser or region.", "no-speech": "No speech was detected. Try again." };
    toast(messages[event.error] || "Speech recognition failed. Please try again.");
  };
  try { recognition.start(); } catch { toast("The microphone is already listening."); }
}

function setTheme() {
  const theme = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  document.documentElement.classList.toggle("light-theme", theme === "light");
  document.documentElement.style.colorScheme = theme;
}

function toggleTheme() {
  const next = localStorage.getItem(THEME_KEY) === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next); setTheme();
}

function updateModeButtons() {
  $("#chatMode").classList.toggle("active", selectedMode === "chat");
  $("#imageMode").classList.toggle("active", selectedMode === "image");
  $("#composerHint").textContent = selectedMode === "image" ? "Image generation is not available in local Ollama mode." : "Emex AI can make mistakes. Check important info.";
  elements.input.placeholder = selectedMode === "image" ? "Describe an image to generate..." : "Message Emex AI...";
  renderConversation();
}

async function checkLocalAI() {
  try {
    const response = await fetch("/api/health");
    const status = await response.json();
    if (!response.ok || !status.ready) toast(status.message || "The local AI model is not ready.");
  } catch {
    toast("Could not check Ollama. Make sure it is installed and running.");
  }
}

function closeSidebar() {
  elements.sidebar.classList.remove("open"); elements.sidebarScrim.classList.remove("visible");
}

$("#newChat").addEventListener("click", startNewChat);
$("#chatMode").addEventListener("click", () => { selectedMode = "chat"; updateModeButtons(); });
$("#imageMode").addEventListener("click", () => { selectedMode = "image"; updateModeButtons(); });
$("#themeToggle").addEventListener("click", toggleTheme);
$("#themeToggleTop").addEventListener("click", toggleTheme);
$("#openSidebar").addEventListener("click", () => { elements.sidebar.classList.add("open"); elements.sidebarScrim.classList.add("visible"); });
$("#closeSidebar").addEventListener("click", closeSidebar);
elements.sidebarScrim.addEventListener("click", closeSidebar);
$("#webSearch").checked = false;
$("#webSearch").disabled = true;
$("#attachButton").addEventListener("click", () => {
  if (selectedMode === "image") return toast("Attachments are available in AI Assistant mode.");
  elements.fileInput.click();
});
elements.fileInput.addEventListener("change", (event) => attachFile(event.target.files[0]));
$("#micButton").addEventListener("click", setupMicrophone);
elements.input.addEventListener("input", resizeInput);
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); elements.composer.requestSubmit(); }
});
elements.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  if (selectedMode === "image") generateImage(); else submitChat();
});
document.querySelectorAll(".suggestion-card").forEach((button) => button.addEventListener("click", () => {
  elements.input.value = button.dataset.prompt; resizeInput(); elements.input.focus();
}));
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); startNewChat(); }
  if (event.key === "Escape") closeSidebar();
});

setTheme();
renderConversation();
checkLocalAI();
