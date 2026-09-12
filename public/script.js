const chatWindow = document.getElementById("chat-window");
const hero = document.getElementById("hero");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const modelSwitch = document.getElementById("model-switch");

let selectedModel = "kimi-k3";
let history = [];

// Ganti model aktif lewat pill selector
modelSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest(".model-btn");
  if (!btn) return;
  modelSwitch.querySelectorAll(".model-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  selectedModel = btn.dataset.model;
});

// Klik chip prompt -> isi input lalu langsung kirim
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chatInput.value = chip.textContent;
    chatForm.requestSubmit();
  });
});

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

    const data = await res.json();
    typingEl.remove();

    if (!res.ok) {
      addMessage("error", data.error || "Terjadi kesalahan.");
      return;
    }

    addMessage("assistant", data.reply);
    history.push({ role: "assistant", content: data.reply });
  } catch (err) {
    typingEl.remove();
    console.error(err);
    addMessage("error", `Tidak bisa menghubungi server: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
    chatInput.focus();
  }
});
