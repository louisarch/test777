const chatWindow = document.getElementById("chat-window");
const hero = document.getElementById("hero");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const modelSwitch = document.getElementById("model-switch");
const carouselPrev = document.getElementById("carousel-prev");
const carouselNext = document.getElementById("carousel-next");
const carouselDots = document.getElementById("carousel-dots");

let selectedModel = "@cf/qwen/qwen2.5-coder-32b-instruct";
let history = [];

const modelCards = Array.from(modelSwitch.querySelectorAll(".model-card"));

// Bikin dot indikator sesuai jumlah kartu
modelCards.forEach((card, i) => {
  const dot = document.createElement("span");
  dot.className = "dot" + (i === 0 ? " active" : "");
  dot.addEventListener("click", () => {
    card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setActiveCard(card);
  });
  carouselDots.appendChild(dot);
});

function setActiveCard(card) {
  modelCards.forEach((c) => c.classList.remove("active"));
  card.classList.add("active");
  selectedModel = card.dataset.model;

  const index = modelCards.indexOf(card);
  carouselDots.querySelectorAll(".dot").forEach((d, i) => {
    d.classList.toggle("active", i === index);
  });
}

// Klik kartu -> langsung pilih & scroll ke tengah
modelCards.forEach((card) => {
  card.addEventListener("click", () => {
    card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setActiveCard(card);
  });
});

// Swipe/scroll -> kartu yang paling dekat ke tengah otomatis terpilih
let scrollDebounce;
modelSwitch.addEventListener("scroll", () => {
  clearTimeout(scrollDebounce);
  scrollDebounce = setTimeout(() => {
    const wrapRect = modelSwitch.getBoundingClientRect();
    const center = wrapRect.left + wrapRect.width / 2;
    let closest = null;
    let closestDist = Infinity;
    modelCards.forEach((card) => {
      const r = card.getBoundingClientRect();
      const cardCenter = r.left + r.width / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < closestDist) {
        closestDist = dist;
        closest = card;
      }
    });
    if (closest) setActiveCard(closest);
  }, 120);
});

// Tombol panah kiri/kanan
carouselPrev.addEventListener("click", () => {
  modelSwitch.scrollBy({ left: -130, behavior: "smooth" });
});
carouselNext.addEventListener("click", () => {
  modelSwitch.scrollBy({ left: 130, behavior: "smooth" });
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

    // Baca stream SSE dari Workers AI
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
          const delta = j.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            reply += delta;
            msgEl.textContent = reply;
            chatWindow.scrollTop = chatWindow.scrollHeight;
          }
        } catch {}
      }
    }

    if (reply) {
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
