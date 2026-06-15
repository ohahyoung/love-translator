/* =========================================================
   히어로 번역기 타이핑 연출 (concept/translator-hero)
   "들은 말" 타이핑 → 통역 중 → "진짜 속뜻" 또르르 → 다음 예시 순환
   온보딩 인트로가 보일 때만 동작.
   ========================================================= */
(function () {
  const PAIRS = [
    { said: '"됐어 오지마"', mean: "와서 달래줬으면 좋겠어💕" },
    { said: '"아무거나"', mean: "내 취향 기억해서 골라줘" },
    { said: '"나 괜찮아"', mean: "사실 아직 안 괜찮아…" },
    { said: '"먼저 자"', mean: "조금만 더 붙잡아줘" },
  ];

  const inEl = document.querySelector(".tr__pane--in .tr__text");
  const outEl = document.querySelector(".tr__text--out");
  const divEl = document.querySelector(".tr__divider span");
  if (!inEl || !outEl) return;

  const timers = [];
  const wait = (ms) => new Promise((r) => timers.push(setTimeout(r, ms)));

  async function type(el, text, speed) {
    el.textContent = "";
    for (let i = 0; i < text.length; i++) {
      el.textContent = text.slice(0, i + 1);
      await wait(speed);
    }
  }

  function introVisible() {
    const onb = document.getElementById("onboarding");
    const intro = document.querySelector('.ob-step[data-step="intro"]');
    return onb && !onb.hidden && intro && intro.classList.contains("ob-step--active");
  }

  async function loop() {
    let idx = 0;
    // 첫 진입 시 정적 HTML이 잠깐 보이지 않도록 출력 비우기
    outEl.style.transition = "opacity .4s ease";
    while (true) {
      if (!introVisible()) { await wait(400); continue; }

      const p = PAIRS[idx % PAIRS.length];
      outEl.style.opacity = "0";
      outEl.textContent = "";
      if (divEl) divEl.textContent = "통역 중 ⋯";

      await type(inEl, p.said, 80);   // 들은 말 타이핑
      await wait(450);

      // 통역 중 점 애니메이션
      for (let k = 0; k < 3; k++) {
        if (divEl) divEl.textContent = "통역 중 " + ".".repeat(k + 1);
        await wait(260);
      }

      outEl.style.opacity = "1";
      await type(outEl, p.mean, 60);  // 진짜 속뜻 또르르
      await wait(2400);
      idx++;
    }
  }

  loop();
})();
