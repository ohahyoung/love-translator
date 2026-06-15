/* =========================================================
   이 사랑 통역됩니다. — 프론트엔드 로직
   데모 모드로 완결 동작. /api/analyze 가 살아있으면 그쪽을 쓰고,
   실패하면 presets.js 의 프리셋으로 안전하게 fallback 합니다.
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  activeRoomId: PRESETS.rooms[0].id,
  selectedMessage: null,
  coupleMode: PRESETS.rooms[0].coupleMode,
  pickedReply: null,
  botSetup: { relation: null, worry: null },
};

/* ---------------- 온보딩 ---------------- */
const onboarding = $("#onboarding");

function showStep(step) {
  $$(".ob-step").forEach((s) => s.classList.toggle("ob-step--active", s.dataset.step === step));
}

// 칩 선택
$$(".chip-row").forEach((row) => {
  row.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$(".chip", row).forEach((c) => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    const group = row.dataset.group;
    if (group === "relation") state.botSetup.relation = chip.dataset.value;
    if (group === "worry") state.botSetup.worry = chip.dataset.value;
  });
});

// 온보딩 버튼 라우팅
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  switch (action) {
    case "go-bot": showStep("bot"); break;
    case "real-connect": showStep("real"); break;
    case "back-intro": showStep("intro"); break;

    case "create-bot": {
      if (!state.botSetup.relation) { toast("어떤 사이인지 먼저 골라주세요 🙂"); return; }
      showStep("created");
      break;
    }
    case "copy-key": {
      const key = $("#botKey").textContent;
      navigator.clipboard?.writeText(key).catch(() => {});
      toast("봇 키를 복사했어요 📋");
      break;
    }
    case "enter-app": enterApp(); break;

    case "connect-real": {
      const token = $("#tokenInput").value.trim();
      const status = $("#realStatus");
      if (!token) { status.textContent = "토큰이 비어 있어요. 데모 프리셋으로 진행할 수 있어요."; return; }
      status.textContent = "연결 시도 중…";
      tryRealConnect(token).then((ok) => {
        status.textContent = ok
          ? "연결 성공! 방을 불러왔어요."
          : "연결에 실패해 데모 프리셋으로 안전하게 전환했어요.";
        setTimeout(enterApp, 700);
      });
      break;
    }
    case "reissue": showStep("bot"); onboarding.hidden = false; break;
    case "send": sendReply(); break;
  }
});

async function tryRealConnect(token) {
  // 서버리스 골격 호출. 실패/미배포면 false → 프리셋 fallback.
  try {
    const r = await fetch("/api/telegram?action=getRooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    return Array.isArray(data.rooms) && data.rooms.length > 0;
  } catch {
    return false; // 로컬/정적 환경에서는 자연스럽게 데모로
  }
}

function enterApp() {
  onboarding.hidden = true;
  $("#app").hidden = false;
  renderRooms();
  selectRoom(state.activeRoomId);
}

/* ---------------- 좌측: 방 목록 ---------------- */
function renderRooms() {
  const list = $("#roomList");
  list.innerHTML = "";
  PRESETS.rooms.forEach((room) => {
    const li = document.createElement("li");
    li.className = "room" + (room.id === state.activeRoomId ? " is-active" : "");
    li.dataset.roomId = room.id;
    li.innerHTML = `
      <div class="room__avatar">${room.name.match(/\p{Emoji}/u)?.[0] || "💬"}</div>
      <div class="room__body">
        <div class="room__top">
          <span class="room__name">${stripEmoji(room.name)}</span>
          <span class="room__rel">${room.relationship}</span>
        </div>
        <div class="room__last">${room.lastMessage}</div>
        <div class="room__badge">🔮 통역 가능 ${room.translatableCount}건</div>
      </div>`;
    li.addEventListener("click", () => selectRoom(room.id));
    list.appendChild(li);
  });
}

function stripEmoji(s) { return s.replace(/\p{Emoji}/gu, "").trim(); }

function getRoom(id) { return PRESETS.rooms.find((r) => r.id === id); }

function selectRoom(id) {
  state.activeRoomId = id;
  state.selectedMessage = null;
  const room = getRoom(id);
  state.coupleMode = room.coupleMode;
  $("#coupleMode").checked = room.coupleMode;

  $$(".room").forEach((el) => el.classList.toggle("is-active", el.dataset.roomId === id));

  $("#chatAvatar").textContent = room.name.match(/\p{Emoji}/u)?.[0] || "💬";
  $("#chatName").textContent = stripEmoji(room.name);
  $("#chatMeta").textContent = `${room.relationship} · 봇 연결됨`;

  renderChat(room);
  resetTranslation();
}

/* ---------------- 중앙: 채팅 ---------------- */
function renderChat(room) {
  const body = $("#chatBody");
  body.innerHTML = "";
  room.messages.forEach((m) => {
    const wrap = document.createElement("div");
    wrap.className = `msg msg--${m.from}` + (m.highlight ? " msg--highlight" : "");
    wrap.innerHTML = `
      <div class="msg__name">${m.name}</div>
      <div class="bubble">${escapeHtml(m.text)}</div>
      <div class="msg__time">${m.time}</div>`;
    if (m.from === "them" && m.canTranslate) {
      const btn = document.createElement("button");
      btn.className = "msg__translate";
      btn.innerHTML = "🔮 통역하기";
      btn.addEventListener("click", () => translate(m, btn));
      wrap.appendChild(btn);
    }
    body.appendChild(wrap);
  });
  body.scrollTop = body.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- 우측: 통역 ---------------- */
function resetTranslation() {
  $("#transEmpty").hidden = false;
  $("#transResult").hidden = true;
  state.pickedReply = null;
}

$("#coupleMode").addEventListener("change", async (e) => {
  state.coupleMode = e.target.checked;
  // 이미 통역한 메시지가 있으면 모드 반영해 다시 해석
  if (state.selectedMessage) {
    const data = await fetchInterpretation(state.selectedMessage.text, state.coupleMode);
    state.selectedMessage._data = data;
    renderTranslation(state.selectedMessage);
  }
});

async function translate(message, btn) {
  state.selectedMessage = message;
  $$(".msg__translate").forEach((b) => b.classList.remove("is-done"));
  if (btn) { btn.classList.add("is-done"); btn.innerHTML = "🔮 통역됨"; }

  // 로딩 느낌
  $("#transEmpty").hidden = false;
  $("#transEmpty").innerHTML = `<div class="trans-empty__icon">💭</div><p>마음을 통역하는 중…</p>`;
  $("#transResult").hidden = true;

  const data = await fetchInterpretation(message.text, state.coupleMode);
  state.selectedMessage._data = data;
  renderTranslation(message);
}

async function fetchInterpretation(text, coupleMode) {
  // 1) 서버리스 우선 시도
  try {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, coupleMode }),
    });
    if (r.ok) {
      const data = await r.json();
      if (data && data.innerThoughts) return data;
    }
  } catch { /* 정적 호스팅/오프라인 → 프리셋 */ }

  // 2) 프리셋 fallback (항상 동작)
  return presetInterpret(text, coupleMode);
}

function presetInterpret(text, coupleMode) {
  const entry = PRESETS.interpretations[text];
  if (!entry) return genericInterpret(text);
  const base = entry.general;
  const couple = entry.couple;
  const picked = coupleMode && couple ? couple : base;
  return { ...picked, riskyReply: entry.riskyReply, usedCouple: !!(coupleMode && couple) };
}

// 사전에 없는 메시지를 위한 규칙 기반 안전 해석
function genericInterpret(text) {
  return {
    innerThoughts: [
      "이 말 안에는 글자 그대로의 뜻과, 표현되지 않은 마음이 함께 있을 수 있어요.",
      "지금 감정이 정리되지 않아 짧게/모호하게 말한 신호일 수 있어요.",
    ],
    wantedReaction: "단정하지 말고, 한 번 더 부드럽게 마음을 확인해 주기",
    riskWhy: "곧이곧대로 받아치면 대화가 닫힐 수 있어요. 먼저 감정을 알아주는 게 안전해요.",
    basis: ["맥락이 충분치 않을 땐 '확인하는 질문'이 오해를 가장 잘 줄여줘요."],
    replies: [
      "혹시 지금 마음 상한 거 있으면 편하게 말해줘. 들을 준비 됐어.",
      "내가 놓친 게 있으면 알려줘. 너 마음부터 알고 싶어.",
    ],
    riskyReply: "그래서 어쩌라고.",
    usedCouple: false,
  };
}

function renderTranslation(message) {
  const d = message._data;
  $("#transEmpty").hidden = true;
  $("#transEmpty").innerHTML = `<div class="trans-empty__icon">🔍</div><p>통역할 말을 선택해 주세요.<br><span class="muted">상대 말풍선 옆 <b>통역하기</b> 버튼을 누르면 돼요.</span></p>`;
  const result = $("#transResult");
  result.hidden = false;

  $("#selText").textContent = message.text;
  fillList($("#innerThoughts"), d.innerThoughts);
  $("#wantedReaction").textContent = d.wantedReaction;
  $("#riskyReply").textContent = d.riskyReply;
  $("#riskWhy").textContent = d.riskWhy;
  fillList($("#basis"), d.basis);

  const repliesBox = $("#replies");
  repliesBox.innerHTML = "";
  d.replies.forEach((text, i) => {
    const b = document.createElement("button");
    b.className = "reply";
    const tag = ["다정하게 다가가기", "여지 남기기", "솔직하게 풀기"][i] || "추천";
    b.innerHTML = `<span class="reply__tag">${d.usedCouple ? "💞 우리 커플 맞춤 · " : ""}${tag}</span>${escapeHtml(text)}`;
    b.addEventListener("click", () => pickReply(text, b));
    repliesBox.appendChild(b);
  });

  if (d.usedCouple) toast("우리 커플 모드로 해석했어요 💞");
}

function fillList(ul, items) {
  ul.innerHTML = "";
  (items || []).forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    ul.appendChild(li);
  });
}

/* ---------------- 답장 선택 → 입력창 삽입 → 전송 ---------------- */
function pickReply(text, btn) {
  state.pickedReply = text;
  $$(".reply").forEach((b) => b.classList.remove("is-picked"));
  btn.classList.add("is-picked");
  const input = $("#composerInput");
  input.value = text;
  input.classList.add("is-filled");
  input.focus();
  toast("입력창에 넣었어요. 편집 후 보내보세요 ✍️");
}

function sendReply() {
  const input = $("#composerInput");
  const text = input.value.trim();
  if (!text) { toast("보낼 답장을 입력해 주세요 🙂"); return; }

  const room = getRoom(state.activeRoomId);
  const msg = { id: "sent-" + room.messages.length, from: "me", name: "나", text, time: nowTime() };
  room.messages.push(msg);
  room.lastMessage = text;
  renderChat(room);
  renderRooms();
  $$(".room").forEach((el) => el.classList.toggle("is-active", el.dataset.roomId === state.activeRoomId));

  input.value = "";
  input.classList.remove("is-filled");
  toast("텔레그램으로 전송되었어요 ✈️");
}

function nowTime() {
  // Date 사용 (브라우저에서는 안전). 실패 대비 기본값.
  try {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return "지금"; }
}

$("#composerInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendReply(); });

/* ---------------- 토스트 ---------------- */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.hidden = false;
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("is-show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("is-show");
    setTimeout(() => (t.hidden = true), 300);
  }, 2200);
}
