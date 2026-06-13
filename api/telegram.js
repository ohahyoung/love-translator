/*
 * /api/telegram — Telegram Bot API 연동 골격 (Vercel Serverless Function)
 *
 * MVP 데모에서는 실제 토큰이 없어도 동작하도록 설계했습니다.
 *   - action=getRooms : 봇이 초대된 대화방 목록 (실제 연동 시 getUpdates 등으로 대체)
 *   - action=sendMessage : 추천 답장 전송 (실제 연동 시 sendMessage 호출)
 *
 * 토큰이 유효하지 않거나 호출이 실패하면 빈 결과를 돌려주고,
 * 프론트엔드가 presets.js 프리셋으로 자동 전환합니다.
 *
 * 실제 연동을 켜려면 아래 TODO 부분을 Telegram Bot API 호출로 채우세요.
 *   docs: https://core.telegram.org/bots/api
 */

async function tgCall(token, method, params) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params || {}),
  });
  return r.json();
}

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || "getRooms";
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch {}
  const token = body.token || process.env.TELEGRAM_BOT_TOKEN;

  // 토큰이 없으면 데모로 넘어가도록 빈 결과
  if (!token) {
    res.status(200).json({ ok: false, reason: "no-token", rooms: [] });
    return;
  }

  try {
    if (action === "getRooms") {
      // TODO(실연동): getUpdates 로 봇이 속한 chat 들을 수집해 매핑
      const me = await tgCall(token, "getMe");
      if (!me.ok) { res.status(200).json({ ok: false, reason: "invalid-token", rooms: [] }); return; }
      const updates = await tgCall(token, "getUpdates", { allowed_updates: ["message"], limit: 100 });
      const chats = new Map();
      (updates.result || []).forEach((u) => {
        const c = u.message?.chat;
        if (c) chats.set(c.id, { id: String(c.id), name: c.title || c.first_name || "대화방", lastMessage: u.message.text || "" });
      });
      res.status(200).json({ ok: true, bot: me.result, rooms: [...chats.values()] });
      return;
    }

    if (action === "sendMessage") {
      const { chatId, text } = body;
      // TODO(실연동): 실제 전송
      const r = await tgCall(token, "sendMessage", { chat_id: chatId, text });
      res.status(200).json(r);
      return;
    }

    res.status(400).json({ ok: false, reason: "unknown-action" });
  } catch (err) {
    res.status(200).json({ ok: false, reason: String(err), rooms: [] });
  }
};
