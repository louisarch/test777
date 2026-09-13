const chatWindow = document.getElementById("chat-window");
const hero = document.getElementById("hero");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const modelPicker = document.getElementById("model-picker");
const modelPickerBtn = document.getElementById("model-picker-btn");
const modelPickerCurrent = document.getElementById("model-picker-current");
const modelPickerMenu = document.getElementById("model-picker-menu");

let selectedModel = "@cf/qwen/qwen2.5-coder-32b-instruct";
let history = [];

const modelOptions = Array.from(modelPickerMenu.querySelectorAll(".model-option"));

modelPickerBtn.addEventListener("click", () => {
  modelPicker.classList.toggle("open");
});

// Tutup dropdown kalau klik di luar
document.addEventListener("click", (e) => {
  if (!modelPicker.contains(e.target)) {
    modelPicker.classList.remove("open");
  }
});

modelOptions.forEach((option) => {
  option.addEventListener("click", () => {
    modelOptions.forEach((o) => o.classList.remove("active"));
    option.classList.add("active");
    selectedModel = option.dataset.model;
    modelPickerCurrent.textContent = option.dataset.label;
    modelPicker.classList.remove("open");
  });
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chatInput.value = chip.textContent;
    chatForm.requestSubmit();
  });
});

// ---------- Rendering pesan (markdown ringan: reasoning box, tabel, code block) ----------

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Pisahkan bagian <think>...</think> (proses berpikir) dari jawaban akhir
function extractReasoning(text) {
  const match = text.match(/<think>([\s\S]*?)(<\/think>|$)/i);
  if (!match) return { reasoning: null, answer: text, stillThinking: false };

  const reasoning = match[1].trim();
  const stillThinking = match[2] !== "</think>";
  const answer = text.slice(match.index + match[0].length).trim();
  return { reasoning, answer, stillThinking };
}

// Ubah teks markdown jadi HTML: code block, tabel, heading, bold/italic/inline-code, list
function renderMarkdown(text) {
  const codeBlocks = [];

  // 1. Ambil semua ```lang\n...\n``` lebih dulu biar isinya nggak kena parsing lain
  let working = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || "text", code: code.replace(/\n$/, "") });
    return `\u0000CODEBLOCK${idx}\u0000`;
  });

  const lines = working.split("\n");
  const htmlParts = [];
  let i = 0;
  let paragraphBuf = [];
  let listBuf = [];
  let listType = null;

  function flushParagraph() {
    if (paragraphBuf.length) {
      htmlParts.push(`<p>${inlineFormat(paragraphBuf.join(" "))}</p>`);
      paragraphBuf = [];
    }
  }

  function flushList() {
    if (listBuf.length) {
      const tag = listType === "ol" ? "ol" : "ul";
      htmlParts.push(`<${tag}>${listBuf.map((li) => `<li>${inlineFormat(li)}</li>`).join("")}</${tag}>`);
      listBuf = [];
      listType = null;
    }
  }

  function inlineFormat(str) {
    let s = escapeHtml(str);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
    return s;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Placeholder code block
    const codeMatch = trimmed.match(/^\u0000CODEBLOCK(\d+)\u0000$/);
    if (codeMatch) {
      flushParagraph();
      flushList();
      const block = codeBlocks[Number(codeMatch[1])];
      htmlParts.push(
        `<div class="code-block">` +
          `<div class="code-block-bar"><span class="code-lang">${escapeHtml(block.lang)}</span>` +
          `<button type="button" class="copy-btn">Copy</button></div>` +
          `<pre><code>${escapeHtml(block.code)}</code></pre>` +
        `</div>`
      );
      i++;
      continue;
    }

    // Tabel markdown: baris | ... | diikuti baris pemisah |---|---|
    if (trimmed.startsWith("|") && lines[i + 1] && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(lines[i + 1].trim())) {
      flushParagraph();
      flushList();
      const headerCells = trimmed.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      let tableHtml = `<div class="table-wrap"><table class="msg-table"><thead><tr>${headerCells
        .map((c) => `<th>${inlineFormat(c)}</th>`)
        .join("")}</tr></thead><tbody>`;
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const rowCells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        tableHtml += `<tr>${rowCells.map((c) => `<td>${inlineFormat(c)}</td>`).join("")}</tr>`;
        i++;
      }
      tableHtml += "</tbody></table></div>";
      htmlParts.push(tableHtml);
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level + 3}>${inlineFormat(headingMatch[2])}</h${level + 3}>`);
      i++;
      continue;
    }

    // List
    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      flushParagraph();
      const newType = ulMatch ? "ul" : "ol";
      if (listType && listType !== newType) flushList();
      listType = newType;
      listBuf.push(ulMatch ? ulMatch[1] : olMatch[1]);
      i++;
      continue;
    }

    // Baris kosong -> pemisah paragraf
    if (trimmed === "") {
      flushParagraph();
      flushList();
      i++;
      continue;
    }

    // Teks biasa
    flushList();
    paragraphBuf.push(trimmed);
    i++;
  }

  flushParagraph();
  flushList();

  return htmlParts.join("");
}

function buildReasoningBoxHtml(reasoning, stillThinking) {
  return (
    `<div class="reasoning-box${stillThinking ? " open" : ""}">` +
      `<button type="button" class="reasoning-toggle">` +
        `<span class="reasoning-dot"></span>` +
        `<span>${stillThinking ? "Sedang berpikir..." : "Proses berpikir"}</span>` +
        `<span class="reasoning-chevron">▾</span>` +
      `</button>` +
      `<div class="reasoning-body">${escapeHtml(reasoning).replace(/\n/g, "<br>")}</div>` +
    `</div>`
  );
}

function renderAssistantContent(el, rawText) {
  const { reasoning, answer, stillThinking } = extractReasoning(rawText);
  let html = "";
  if (reasoning) {
    html += buildReasoningBoxHtml(reasoning, stillThinking);
  }
  html += renderMarkdown(answer);
  el.innerHTML = html;
}

// Delegasi klik: toggle reasoning box & tombol copy code
chatWindow.addEventListener("click", (e) => {
  const toggleBtn = e.target.closest(".reasoning-toggle");
  if (toggleBtn) {
    toggleBtn.parentElement.classList.toggle("open");
    return;
  }

  const copyBtn = e.target.closest(".copy-btn");
  if (copyBtn) {
    const code = copyBtn.closest(".code-block").querySelector("code").textContent;
    navigator.clipboard.writeText(code).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = "Tersalin!";
      setTimeout(() => (copyBtn.textContent = original), 1500);
    });
  }
});

// ---------- Chat flow ----------

function addMessage(role, text) {
  if (hero.parentNode) hero.remove();
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = text;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return el;
}

function showTyping() {
  if (hero.parentNode) hero.remove();
  const el = document.createElement("div");
  el.className = "typing";
  el.innerHTML = "<span></span><span></span><span></span>";
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return el;
}

function autoResize() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
}

chatInput.addEventListener("input", autoResize);

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  addMessage("user", text);
  history.push({ role: "user", content: text });
  chatInput.value = "";
  autoResize();

  sendBtn.disabled = true;
  const typingEl = showTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, model: selectedModel }),
    });

    typingEl.remove();

    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try {
        const d = await res.json();
        msg = d.error || msg;
        if (d.detail) {
          const det = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
          msg += `\n\nDETAIL: ${det.slice(0, 400)}`;
        }
      } catch {}
      addMessage("error", msg);
      return;
    }

    const msgEl = addMessage("assistant", "");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let reply = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          let delta = j.choices?.[0]?.delta?.content;
          if (delta === undefined || delta === null) {
            delta = j.response ?? "";
          }
          if (delta) {
            reply += delta;
            // Selama streaming, render ulang tiap chunk biar reasoning box & code block
            // langsung kelihatan progresif (bukan cuma nempel di akhir)
            renderAssistantContent(msgEl, reply);
            chatWindow.scrollTop = chatWindow.scrollHeight;
          }
        } catch {}
      }
    }

    if (reply) {
      renderAssistantContent(msgEl, reply);
      history.push({ role: "assistant", content: reply });
    } else {
      addMessage("error", "Respons dari AI kosong.");
    }
  } catch (err) {
    typingEl.remove();
    console.error(err);
    addMessage("error", `Error: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
    chatInput.focus();
  }
});
