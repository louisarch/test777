// functions/api/chat.js
//
// Cloudflare Pages Function — jalan otomatis di edge saat ada request ke /api/chat
// Tugasnya: terima pesan dari frontend, teruskan ke API getunikey.ai, kirim balik jawabannya.
// API key TIDAK ditulis di sini. Diambil dari env.UNIKEY_API_KEY (Cloudflare secret).

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (err) {
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

  try {
    const upstreamResponse = await fetch("https://api.getunikey.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.UNIKEY_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || env.UNIKEY_MODEL || "gpt-4o-mini",
        messages,
      }),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      return jsonResponse(
        { error: data?.error?.message || "Gagal memanggil API getunikey.ai.", detail: data },
        upstreamResponse.status
      );
    }

    const reply = data?.choices?.[0]?.message?.content ?? "";

    return jsonResponse({ reply, raw: data });
  } catch (err) {
    return jsonResponse({ error: "Terjadi kesalahan saat menghubungi getunikey.ai.", detail: String(err) }, 502);
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
