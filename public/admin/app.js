/* global io */
const socket = io();

const els = {
  conn: document.getElementById("conn"),
  reload: document.getElementById("reload"),
  reset: document.getElementById("reset"),
  mute: document.getElementById("mute"),
  theme: document.getElementById("theme"),
  insToggle: document.getElementById("ins-toggle"),
  insPrev: document.getElementById("ins-prev"),
  insNext: document.getElementById("ins-next"),
  insPage: document.getElementById("ins-page"),
  insChips: document.querySelectorAll(".ins-chip"),
  vol: document.getElementById("vol"),
  volNum: document.getElementById("vol-num"),
  volPresets: document.querySelectorAll(".vol-preset"),
  scoreA: document.getElementById("score-0"),
  scoreB: document.getElementById("score-1"),
  nameInputs: document.querySelectorAll(".team__name"),
  nameRefs: document.querySelectorAll(".team-name-ref"),
  prevQ: document.getElementById("prev-q"),
  nextQ: document.getElementById("next-q"),
  gotoQ: document.getElementById("goto-q"),
  qmeta: document.getElementById("qmeta"),
  potDisplay: document.getElementById("pot-display"),
  roundQuestion: document.getElementById("round-question"),
  showQ: document.getElementById("show-q"),
  startRound: document.getElementById("start-round"),
  endRound: document.getElementById("end-round"),
  strike: document.getElementById("strike"),
  buzz: document.getElementById("buzz"),
  clearStrikes: document.getElementById("clear-strikes"),
  strikesPill: document.getElementById("strikes-pill"),
  answers: document.getElementById("answers"),
  csvInfo: document.getElementById("csv-info"),
};

let lastState = null;
let nameEditing = [false, false];
let volEditing = false;

function send(cmd) { socket.emit("cmd", cmd); }

function render(state) {
  lastState = state;

  // Teams
  els.scoreA.textContent = state.teams[0].score;
  els.scoreB.textContent = state.teams[1].score;
  els.nameInputs.forEach((inp) => {
    const t = Number(inp.dataset.team);
    if (!nameEditing[t]) inp.value = state.teams[t].name;
  });
  els.nameRefs.forEach((s) => {
    s.textContent = state.teams[Number(s.dataset.team)].name;
  });

  // Question dropdown
  if (els.gotoQ.options.length !== state.questions.length) {
    els.gotoQ.innerHTML = "";
    state.questions.forEach((q, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `${i + 1}. ${truncate(q.text, 40)}`;
      els.gotoQ.appendChild(o);
    });
  }
  els.gotoQ.value = String(state.currentQuestionIndex);

  const q = state.questions[state.currentQuestionIndex];
  els.qmeta.textContent = q
    ? `Q ${state.currentQuestionIndex + 1} / ${state.questions.length} · ${q.answers.length} answers`
    : "no question";
  els.roundQuestion.textContent = q ? q.text : "—";

  const playing = state.round.kind === "playing";
  els.potDisplay.textContent = playing ? state.round.pot : 0;
  els.strikesPill.textContent = playing ? state.round.strikes : 0;
  els.startRound.disabled = playing || !q;
  els.endRound.disabled = !playing;
  els.strike.disabled = !playing;
  els.buzz.disabled = !playing;
  els.clearStrikes.disabled = !playing;
  els.showQ.textContent = state.reveal.questionVisible ? "Hide question on TV" : "Show question on TV";

  // Audio buttons
  els.mute.textContent = state.audio.muted ? "🔇 Muted" : "🔊";
  els.mute.classList.toggle("is-active", state.audio.muted);
  els.theme.textContent = state.audio.themePlaying ? "🎵 Theme: ON" : "🎵 Theme: OFF";
  els.theme.classList.toggle("is-active", state.audio.themePlaying);

  // Volume
  if (!volEditing) {
    const v = Math.round((state.audio.themeVolume ?? 0.7) * 100);
    els.vol.value = String(v);
    els.volNum.textContent = String(v);
  }
  els.volPresets.forEach((b) => {
    const want = Number(b.dataset.vol);
    const cur = Math.round((state.audio.themeVolume ?? 0.7) * 100);
    b.classList.toggle("is-active", want === cur);
  });

  // Instructions
  const ins = state.instructions;
  if (ins) {
    els.insToggle.textContent = ins.visible ? "Hide from TV" : "Show on TV";
    els.insToggle.classList.toggle("btn-primary", !ins.visible);
    els.insToggle.classList.toggle("btn-warn", ins.visible);
    els.insPage.textContent = `${ins.page + 1} / ${ins.total}`;
    els.insPrev.disabled = ins.page <= 0;
    els.insNext.disabled = ins.page >= ins.total - 1;
    els.insChips.forEach((b) => {
      b.classList.toggle("is-active", Number(b.dataset.insPage) === ins.page);
    });
  }

  // Control highlight
  document.querySelectorAll('[data-act="control"]').forEach((b) => {
    const t = b.dataset.team === "" ? null : Number(b.dataset.team);
    const active = playing && state.round.controllingTeam === t;
    b.classList.toggle("is-active", active);
  });

  // Answers
  els.answers.innerHTML = "";
  if (!q) {
    const empty = document.createElement("div");
    empty.className = "answers__empty";
    empty.textContent = "No question loaded. Drop a questions.csv in the project root and click Reload CSV.";
    els.answers.appendChild(empty);
    return;
  }
  q.answers.forEach((a, i) => {
    const row = document.createElement("div");
    row.className = "answer" + (a.revealed ? " revealed" : "");
    row.innerHTML = `
      <div class="answer__num">${i + 1}</div>
      <div class="answer__text">${escapeHtml(a.text)}</div>
      <div class="answer__pts">${a.points}</div>
    `;
    const btn = document.createElement("button");
    btn.className = "btn answer__btn " + (a.revealed ? "btn-ghost" : "btn-primary");
    btn.textContent = a.revealed ? "Hide" : "Reveal";
    btn.disabled = !playing;
    btn.onclick = () =>
      send({ type: a.revealed ? "unreveal_answer" : "reveal_answer", index: i });
    row.appendChild(btn);
    els.answers.appendChild(row);
  });
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Wire UI
els.startRound.onclick = () => send({ type: "start_round" });
els.endRound.onclick   = () => send({ type: "end_round" });
els.strike.onclick     = () => send({ type: "strike" });
els.buzz.onclick       = () => send({ type: "buzz" });
els.clearStrikes.onclick = () => send({ type: "clear_strikes" });
els.prevQ.onclick      = () => send({ type: "prev_question" });
els.nextQ.onclick      = () => send({ type: "next_question" });
els.gotoQ.onchange     = () => send({ type: "goto_question", index: Number(els.gotoQ.value) });
els.showQ.onclick      = () =>
  send({ type: "show_question", visible: !(lastState?.reveal?.questionVisible) });
els.reset.onclick      = () => {
  if (confirm("Reset the whole game (scores + reveals)?")) send({ type: "reset_game" });
};
els.reload.onclick     = () => {
  if (confirm("Reload questions.csv? This resets the game state (team names kept).")) {
    send({ type: "reload_csv" });
  }
};
els.mute.onclick       = () => send({ type: "set_muted", muted: !lastState?.audio?.muted });
els.theme.onclick      = () => send({ type: "set_theme_playing", playing: !lastState?.audio?.themePlaying });

els.vol.addEventListener("pointerdown", () => { volEditing = true; });
els.vol.addEventListener("pointerup",   () => { volEditing = false; });
els.vol.addEventListener("input", () => {
  const v = Number(els.vol.value);
  els.volNum.textContent = String(v);
  send({ type: "set_theme_volume", volume: v / 100 });
});
els.volPresets.forEach((b) => {
  b.onclick = () => send({ type: "set_theme_volume", volume: Number(b.dataset.vol) / 100 });
});

els.insToggle.onclick = () =>
  send({ type: "set_instructions_visible", visible: !lastState?.instructions?.visible });
els.insPrev.onclick = () =>
  send({ type: "set_instructions_page", page: (lastState?.instructions?.page ?? 0) - 1 });
els.insNext.onclick = () =>
  send({ type: "set_instructions_page", page: (lastState?.instructions?.page ?? 0) + 1 });
els.insChips.forEach((b) => {
  b.onclick = () => send({ type: "set_instructions_page", page: Number(b.dataset.insPage) });
});

document.querySelectorAll('[data-act="adjust"]').forEach((b) => {
  b.onclick = () =>
    send({ type: "adjust_score", team: Number(b.dataset.team), delta: Number(b.dataset.delta) });
});
document.querySelectorAll('[data-act="award"]').forEach((b) => {
  b.onclick = () => send({ type: "award_pot", team: Number(b.dataset.team) });
});
document.querySelectorAll('[data-act="control"]').forEach((b) => {
  b.onclick = () => {
    const t = b.dataset.team === "" ? null : Number(b.dataset.team);
    send({ type: "set_controlling_team", team: t });
  };
});

els.nameInputs.forEach((inp) => {
  const t = Number(inp.dataset.team);
  inp.addEventListener("focus", () => { nameEditing[t] = true; });
  inp.addEventListener("blur", () => {
    nameEditing[t] = false;
    send({ type: "set_team_name", team: t, name: inp.value });
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
});

// Connection status
socket.on("connect", () => { els.conn.textContent = "live"; els.conn.className = "conn ok"; });
socket.on("disconnect", () => { els.conn.textContent = "offline"; els.conn.className = "conn bad"; });
socket.on("hello", (info) => {
  els.csvInfo.textContent = `${info.questionCount} questions loaded · ${info.csvPath}`;
});
socket.on("state", render);
socket.on("error_msg", (m) => alert("Server error: " + m));
