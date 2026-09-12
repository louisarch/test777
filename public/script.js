const chatWindow = document.getElementById("chat-window");
const emptyState = document.getElementById("empty-state");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const resetBtn = document.getElementById("reset-btn");

// Riwayat percakapan disimpan di memori tab ini saja (hilang saat reload).
let history = [];

function addMessage(role, text) {
  emptyState.style.display = "none";
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = text;
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
  const pendingEl = addMessage("assistant pending", "Mengetik...");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });

    const data = await res.json();

    if (!res.ok) {
      pendingEl.remove();
      addMessage("error", data.error || "Terjadi kesalahan.");
      return;
    }

    pendingEl.classList.remove("pending");
    pendingEl.textContent = data.reply;
    history.push({ role: "assistant", content: data.reply });
  } catch (err) {
    pendingEl.remove();
    addMessage("error", "Tidak bisa menghubungi server. Coba lagi.");
  } finally {
    sendBtn.disabled = false;
    chatInput.focus();
  }
});

resetBtn.addEventListener("click", () => {
  history = [];
  chatWindow.innerHTML = "";
  chatWindow.appendChild(emptyState);
  emptyState.style.display = "block";
});
