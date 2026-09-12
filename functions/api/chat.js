// functions/api/chat.js
//
// Cloudflare Pages Function — proxy ke API getunikey.ai, sekaligus
// menyimpan pesan user & balasan asisten ke D1 supaya riwayat chat tersimpan.

import { verifySession } from "../_lib/session.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const uid = await verifySession(request.headers.get("Cookie"), env.SESSION_SECRET);
  if (!uid) {
    return jsonResponse({ error: "Kamu harus login dulu." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: "Body request harus JSON valid." }, 400);
  }

  const { messages, model, conversationId } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: "Field 'messages' wajib diisi (array)." }, 400);
  }

  if (!env.UNIKEY_API_KEY) {
    return jsonResponse(
      { error: "UNIKEY_API_KEY belum diset di Cloudflare Pages (Settings > Environment variables)." },
      500
    );
  }

  // Pastikan conversation ini milik user yang login, atau buat baru kalau belum ada
  let convoId = conversationId;
  if (convoId) {
    const convo = await env.DB.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
      .bind(convoId, uid)
      .first();
    if (!convo) return jsonResponse({ error: "Obrolan tidak ditemukan." }, 404);
  } else {
    const lastUserMessage = messages[messages.length - 1];
    const title = (lastUserMessage.content || "Obrolan baru").slice(0, 40);
    const inserted = await env.DB.prepare(
      "INSERT INTO conversations (user_id, title) VALUES (?, ?) RETURNING id"
    )
      .bind(uid, title)
      .first();
    convoId = inserted.id;
  }

  // Simpan pesan user (pesan terakhir dalam array) ke database
  const lastUserMessage = messages[messages.length - 1];
  await env.DB.prepare(
    "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)"
  )
    .bind(convoId, lastUserMessage.role, lastUserMessage.content)
    .run();

  try {
    const upstreamResponse = await fetch("https://api.getunikey.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.UNIKEY_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || env.UNIKEY_MODEL || "kimi-k3",
        messages,
        stream: false,
      }),
    });

    const rawText = await upstreamResponse.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      // Responsnya bukan JSON biasa (mungkin format stream/SSE walau sudah minta stream:false)
      return jsonResponse(
        {
          error: "Respons dari getunikey.ai bukan format JSON yang diharapkan.",
          detail: rawText.slice(0, 500),
        },
        502
      );
    }

    if (!upstreamResponse.ok) {
      return jsonResponse(
        { error: data?.error?.message || "Gagal memanggil API getunikey.ai.", detail: data },
        upstreamResponse.status
      );
    }

    const reply = data?.choices?.[0]?.message?.content ?? "";

    // Simpan balasan asisten ke database
    await env.DB.prepare(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)"
    )
      .bind(convoId, reply)
      .run();

    return jsonResponse({ reply, conversationId: convoId });
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
