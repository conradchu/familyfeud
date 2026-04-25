/* global io */
const socket = io();

const els = {
  stage: document.querySelector(".stage"),
  questionBanner: document.getElementById("question-banner"),
  questionText: document.getElementById("question-text"),
  board: document.getElementById("board"),
  pot: document.getElementById("pot"),
  strikes: document.getElementById("strikes"),
  nameLeft: document.getElementById("name-left"),
  nameRight: document.getElementById("name-right"),
  numLeft: document.getElementById("num-left"),
  numRight: document.getElementById("num-right"),
  gate: document.getElementById("audio-gate"),
  instructions: document.getElementById("instructions"),
  instructionsPages: document.querySelectorAll(".instructions__page"),
  instructionsPageNum: document.getElementById("instructions-page-num"),
};

let lastStrikeFlash = 0;
let lastBuzzFlash = 0;
let lastRevealed = new Map(); // questionId -> Set of revealed indices
let audioReady = false;
let audioCtx = null;
let masterGain = null;
let themeAudio = null;
let lastState = null;

// ----- Audio engine -----
function initAudio() {
  if (audioReady) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1.0;
  masterGain.connect(audioCtx.destination);

  themeAudio = new Audio("/theme.m4a");
  themeAudio.loop = true;
  themeAudio.volume = lastState?.audio?.themeVolume ?? 0.7;
  themeAudio.preload = "auto";

  audioReady = true;
  applyAudioState(lastState);
}

// Iconic "ding!" — short bell stack with quick attack, exponential decay.
function playReveal() {
  if (!audioReady || lastState?.audio?.muted) return;
  const t = audioCtx.currentTime;
  const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6 — major triad + octave
  freqs.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = i === 0 ? "triangle" : "sine";
    osc.frequency.value = freq;
    const start = t + i * 0.012;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.28, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.85);
    osc.connect(g).connect(masterGain);
    osc.start(start);
    osc.stop(start + 0.9);
  });
}

// Iconic "EH-EH-EH!" buzzer: low sawtooth with tremolo + lowpass.
function playStrike() {
  if (!audioReady || lastState?.audio?.muted) return;
  const t = audioCtx.currentTime;
  const dur = 0.85;

  const osc = audioCtx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(165, t);
  osc.frequency.linearRampToValueAtTime(140, t + dur);

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1200;
  filter.Q.value = 1.5;

  // Tremolo — pulses ~7Hz to give that "EH-EH-EH" feel
  const tremolo = audioCtx.createOscillator();
  tremolo.type = "sine";
  tremolo.frequency.value = 7;
  const tremGain = audioCtx.createGain();
  tremGain.gain.value = 0.35;
  tremolo.connect(tremGain);

  const gain = audioCtx.createGain();
  // baseline level + tremolo modulation
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.4, t + 0.02);
  gain.gain.linearRampToValueAtTime(0.4, t + dur - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  tremGain.connect(gain.gain);

  osc.connect(filter).connect(gain).connect(masterGain);
  osc.start(t);
  osc.stop(t + dur);
  tremolo.start(t);
  tremolo.stop(t + dur);
}

// Theme management — driven by state.
function applyAudioState(state) {
  if (!audioReady || !themeAudio || !state) return;
  const targetVol = Math.max(0, Math.min(1, state.audio.themeVolume ?? 0.7));
  if (Math.abs(themeAudio.volume - targetVol) > 0.005) {
    themeAudio.volume = targetVol;
  }
  const wantPlaying = state.audio.themePlaying && !state.audio.muted;
  if (wantPlaying && themeAudio.paused) {
    themeAudio.play().catch(() => { /* user hasn't clicked yet, gate handles it */ });
  } else if (!wantPlaying && !themeAudio.paused) {
    themeAudio.pause();
  }
}

// ----- State + render -----
function render(state) {
  // Diff sounds before mutating lastState
  fireSoundDiffs(state);
  lastState = state;

  els.nameLeft.textContent = state.teams[0].name.toUpperCase();
  els.nameRight.textContent = state.teams[1].name.toUpperCase();
  els.numLeft.textContent = state.teams[0].score;
  els.numRight.textContent = state.teams[1].score;

  const q = state.questions[state.currentQuestionIndex];
  const playing = state.round.kind === "playing";

  els.stage.classList.toggle("idle", !playing);

  if (state.reveal.questionVisible && q) {
    els.questionText.textContent = q.text;
    els.questionBanner.classList.remove("hidden");
  } else {
    els.questionText.textContent = "Get ready…";
  }

  els.pot.textContent = playing ? state.round.pot : 0;

  els.board.innerHTML = "";
  const answers = q?.answers ?? [];
  const slotCount = Math.max(8, answers.length);
  for (let i = 0; i < slotCount; i++) {
    const a = answers[i];
    const slot = document.createElement("div");
    slot.className = "slot";
    if (a?.revealed) slot.classList.add("revealed");
    slot.innerHTML = `
      <div class="slot__num">${i + 1}</div>
      <div class="slot__answer">${a ? escapeHtml(a.text) : ""}</div>
      <div class="slot__points">${a ? a.points : ""}</div>
    `;
    els.board.appendChild(slot);
  }

  if (playing && state.round.strikeFlash > lastStrikeFlash) {
    lastStrikeFlash = state.round.strikeFlash;
    flashStrikes(state.round.strikes);
  }
  const buzzFlash = playing ? (state.round.buzzFlash ?? 0) : 0;
  if (playing && buzzFlash > lastBuzzFlash) {
    lastBuzzFlash = buzzFlash;
    flashBuzz();
  }
  if (!playing) { lastStrikeFlash = 0; lastBuzzFlash = 0; }

  applyAudioState(state);
  applyInstructions(state);
}

function applyInstructions(state) {
  const ins = state.instructions;
  if (!ins) return;
  els.instructions.hidden = !ins.visible;
  const page = Math.max(0, Math.min(ins.total - 1, ins.page));
  els.instructionsPages.forEach((el) => {
    el.classList.toggle("is-active", Number(el.dataset.page) === page);
  });
  if (els.instructionsPageNum) {
    els.instructionsPageNum.textContent = `${page + 1} / ${ins.total}`;
  }
}

function fireSoundDiffs(state) {
  if (!lastState) {
    // First state — initialize the revealed map without firing sounds
    const q = state.questions[state.currentQuestionIndex];
    if (q) {
      const set = new Set();
      q.answers.forEach((a, i) => { if (a.revealed) set.add(i); });
      lastRevealed.set(q.id, set);
    }
    return;
  }
  const q = state.questions[state.currentQuestionIndex];
  if (q) {
    const prev = lastRevealed.get(q.id) ?? new Set();
    const next = new Set();
    q.answers.forEach((a, i) => { if (a.revealed) next.add(i); });
    // Newly revealed
    for (const i of next) if (!prev.has(i)) playReveal();
    lastRevealed.set(q.id, next);
  }
  // Strike sound
  if (
    state.round.kind === "playing" &&
    lastState.round.kind === "playing" &&
    state.round.strikeFlash > lastState.round.strikeFlash
  ) {
    playStrike();
  } else if (
    state.round.kind === "playing" &&
    lastState.round.kind !== "playing" &&
    state.round.strikeFlash > 0
  ) {
    // round (re)started with strikes recorded — don't replay
  }
}

function flashStrikes(count) {
  const xs = els.strikes.querySelectorAll(".x");
  xs.forEach((x, i) => {
    x.style.visibility = i < count ? "visible" : "hidden";
  });
  els.strikes.hidden = false;
  els.strikes.style.animation = "none";
  void els.strikes.offsetWidth;
  els.strikes.style.animation = "";
  setTimeout(() => { els.strikes.hidden = true; }, 1600);
}

// Wrong-answer buzz (face-off) — single X, shorter flash, same buzzer sound.
function flashBuzz() {
  const xs = els.strikes.querySelectorAll(".x");
  xs.forEach((x, i) => {
    x.style.visibility = i === 0 ? "visible" : "hidden";
  });
  els.strikes.hidden = false;
  els.strikes.style.animation = "none";
  void els.strikes.offsetWidth;
  els.strikes.style.animation = "";
  playStrike();
  setTimeout(() => { els.strikes.hidden = true; }, 900);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ----- Audio gate (browser autoplay restriction) -----
function dismissGate() {
  initAudio();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  els.gate?.classList.add("dismissed");
  setTimeout(() => els.gate?.remove(), 400);
}
els.gate?.addEventListener("click", dismissGate);
window.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") dismissGate();
});

socket.on("state", render);
socket.on("connect", () => console.log("display connected"));
socket.on("disconnect", () => console.log("display disconnected"));
