export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Body request harus JSON valid." }, 400);
  }

  const { messages, model } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: "Field 'messages' wajib diisi (array)." }, 400);
  }

  if (!env.UNIKEY_API_KEY) {
    return jsonResponse(
      { error: "UNIKEY_API_KEY belum diset di Cloudflare Pages (Settings > Environment variables)." },
      500
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  let upstream;
  try {
    upstream = await fetch("https://api.getunikey.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.UNIKEY_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || env.UNIKEY_MODEL || "kimi-k3",
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      return jsonResponse({ error: "getunikey.ai tidak merespons dalam 25 detik (timeout)." }, 504);
    }
    return jsonResponse({ error: "Gagal menghubungi getunikey.ai.", detail: String(err) }, 502);
  }

  // Headers sudah diterima = upstream merespons, streaming akan mengalir
  clearTimeout(timeout);

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return jsonResponse(
      { error: "getunikey.ai menolak request.", detail: text.slice(0, 500) },
      upstream.status
    );
  }

  // Teruskan aliran SSE apa adanya ke frontend
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
