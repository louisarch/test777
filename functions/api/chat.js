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

  if (!env.AI) {
    return jsonResponse({ error: "Binding Workers AI (nama: AI) belum diset. Cek Settings > Bindings lalu redeploy." }, 500);
  }

  try {
    const stream = await env.AI.run(
      model || "@cf/meta/llama-3.1-8b-instruct",
      { messages, stream: true }
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    return jsonResponse(
      { error: "Workers AI gagal memproses.", detail: String(err) },
      502
    );
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
