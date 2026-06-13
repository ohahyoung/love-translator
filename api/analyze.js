/*
 * /api/analyze — 메시지 해석 서버리스 함수 (Vercel Serverless Function)
 *
 * 동작:
 *   1) ANTHROPIC_API_KEY 가 있으면 Claude 로 해석을 생성합니다.
 *   2) 키가 없거나 호출이 실패하면 presets.js 의 프리셋으로 안전하게 fallback 합니다.
 *
 * 안전 원칙(시스템 프롬프트에도 반영): 항상 "후보/가능성"으로 표현하고,
 * 상대를 조종하지 않으며, 관계 회복형 답장을 추천합니다.
 *
 * 로컬에서 `vercel dev` 로 띄우면 이 라우트가 살아납니다.
 * 정적(파일 더블클릭)으로 열면 프론트의 fetch 가 실패하고
 * presets.js 프리셋으로 자동 대체되므로 데모는 항상 동작합니다.
 */

const PRESETS = require("../presets.js");

function presetInterpret(text, coupleMode) {
  const entry = PRESETS.interpretations[text];
  if (!entry) return null;
  const picked = coupleMode && entry.couple ? entry.couple : entry.general;
  return { ...picked, riskyReply: entry.riskyReply, usedCouple: !!(coupleMode && entry.couple), source: "preset" };
}

const SYSTEM_PROMPT = `너는 "이 사랑 통역됩니다." 서비스의 관계 맥락 통역기다.
연인/부부가 주고받은 한국어 메시지의 숨은 마음을 해석한다.
반드시 지킬 원칙:
- 절대 단정하지 말고 "~일 수 있어요", "가능성이 높아요"처럼 후보로 표현한다.
- 상대를 조종/조작하는 답이 아니라, 관계 회복형 답장을 추천한다.
- 따뜻하고 조심스러운 말투를 쓴다.
다음 JSON 스키마로만 응답한다(설명 금지):
{
  "innerThoughts": [string, ...],   // 속마음 후보 1~3
  "wantedReaction": string,          // 원하는 반응
  "riskyReply": string,              // 사용자가 하기 쉬운 위험한 답
  "riskWhy": string,                 // 그 답이 위험한 이유
  "basis": [string, ...],            // 그렇게 해석한 근거 1~2
  "replies": [string, string, string]// 추천 답장 1~3 (다정/여지/솔직 순)
}`;

async function claudeInterpret(text, coupleMode) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const userMsg = `상대가 보낸 메시지: "${text}"\n` +
    (coupleMode ? "이 커플은 '우리 커플 모드'를 켰다. 반복되는 관계 패턴을 반영해 더 개인화된 해석을 해라." : "일반 연애 맥락으로 해석해라.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data?.content?.[0]?.text || "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return { ...parsed, usedCouple: !!coupleMode, source: "claude" };
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { text = "", coupleMode = false } = body;

    // 1) Claude 시도 → 2) 프리셋 → 3) 일반 안전 해석
    let result = await claudeInterpret(text, coupleMode).catch(() => null);
    if (!result) result = presetInterpret(text, coupleMode);
    if (!result) {
      result = {
        innerThoughts: ["글자 그대로의 뜻과 표현되지 않은 마음이 함께 있을 수 있어요."],
        wantedReaction: "단정하지 말고 한 번 더 부드럽게 확인해 주기",
        riskyReply: "그래서 어쩌라고.",
        riskWhy: "곧이곧대로 받아치면 대화가 닫힐 수 있어요.",
        basis: ["맥락이 부족할 땐 확인하는 질문이 오해를 줄여줘요."],
        replies: ["혹시 마음 상한 거 있으면 편하게 말해줘.", "너 마음부터 알고 싶어.", "내가 놓친 게 있으면 알려줘."],
        usedCouple: false,
        source: "generic",
      };
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(200).json({ error: String(err), innerThoughts: null });
  }
};
