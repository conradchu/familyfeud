import express from "express";
import http from "http";
import path from "path";
import { Server as IOServer } from "socket.io";
import { loadQuestions } from "./csv";
import { Store } from "./persist";
import {
  addBuzz,
  addStrike,
  adjustScore,
  awardPotToTeam,
  clearStrikes,
  endRound,
  gotoQuestion,
  makeInitialState,
  migrateState,
  nextQuestion,
  prevQuestion,
  resetGame,
  revealAnswer,
  setControllingTeam,
  setTeamName,
  startRound,
  unrevealAnswer,
} from "./state";
import { GameState } from "./types";

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const CSV_PATH = path.join(ROOT, "questions.csv");
const DB_PATH = process.env.DB_PATH ?? path.join(ROOT, "familyfeud.db");

const DISPLAY_PORT = Number(process.env.DISPLAY_PORT ?? 3000);
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 4000);

const store = new Store(DB_PATH);
let questions = loadQuestions(CSV_PATH);

let state: GameState;
const saved = store.load();
if (saved) {
  state = migrateState(saved);
  console.log(
    `[persist] restored state from ${DB_PATH}: Q${state.currentQuestionIndex + 1}/${state.questions.length}, scores ${state.teams[0].score}/${state.teams[1].score}`
  );
} else {
  state = makeInitialState(questions);
  store.save(state);
  console.log(`[persist] no saved state; initialized from CSV at ${DB_PATH}`);
}

function persist() {
  try {
    store.save(state);
  } catch (err) {
    console.error("[persist] save failed", err);
  }
}

// ----- Display server (port 3000): audience screen + read-only socket -----
const THEME_PATH = path.join(ROOT, "audio", "sfx", "theme.m4a");
const displayApp = express();
displayApp.use(express.static(path.join(PUBLIC, "display")));
displayApp.get("/health", (_req, res) => res.json({ ok: true, role: "display" }));
displayApp.get("/theme.m4a", (_req, res) => {
  res.sendFile(THEME_PATH, (err) => {
    if (err && !res.headersSent) res.status(404).send("theme not found");
  });
});
const displayServer = http.createServer(displayApp);
const displayIo = new IOServer(displayServer, { cors: { origin: "*" } });

displayIo.on("connection", (socket) => {
  socket.emit("state", state);
});

// ----- Admin server (port 4000): admin UI + control socket -----
const adminApp = express();
adminApp.use(express.json());
adminApp.use(express.static(path.join(PUBLIC, "admin")));
adminApp.get("/health", (_req, res) => res.json({ ok: true, role: "admin" }));

const adminServer = http.createServer(adminApp);
const adminIo = new IOServer(adminServer, { cors: { origin: "*" } });

function broadcast() {
  displayIo.emit("state", state);
  adminIo.emit("state", state);
}

type Cmd =
  | { type: "start_round" }
  | { type: "end_round" }
  | { type: "next_question" }
  | { type: "prev_question" }
  | { type: "goto_question"; index: number }
  | { type: "reveal_answer"; index: number }
  | { type: "unreveal_answer"; index: number }
  | { type: "strike" }
  | { type: "buzz" }
  | { type: "clear_strikes" }
  | { type: "award_pot"; team: 0 | 1 }
  | { type: "adjust_score"; team: 0 | 1; delta: number }
  | { type: "set_team_name"; team: 0 | 1; name: string }
  | { type: "set_controlling_team"; team: 0 | 1 | null }
  | { type: "reset_game" }
  | { type: "show_question"; visible: boolean }
  | { type: "reload_csv" }
  | { type: "set_muted"; muted: boolean }
  | { type: "set_theme_playing"; playing: boolean }
  | { type: "set_theme_volume"; volume: number }
  | { type: "set_instructions_visible"; visible: boolean }
  | { type: "set_instructions_page"; page: number };

adminIo.on("connection", (socket) => {
  socket.emit("state", state);
  socket.emit("hello", {
    questionCount: state.questions.length,
    csvPath: CSV_PATH,
    dbPath: DB_PATH,
  });

  socket.on("cmd", (cmd: Cmd) => {
    try {
      handle(cmd);
      persist();
      broadcast();
    } catch (err) {
      console.error("[cmd] error", cmd, err);
      socket.emit("error_msg", String((err as Error).message ?? err));
    }
  });
});

function handle(cmd: Cmd) {
  switch (cmd.type) {
    case "start_round":
      startRound(state);
      break;
    case "end_round":
      endRound(state);
      break;
    case "next_question":
      nextQuestion(state);
      break;
    case "prev_question":
      prevQuestion(state);
      break;
    case "goto_question":
      gotoQuestion(state, cmd.index);
      break;
    case "reveal_answer":
      revealAnswer(state, cmd.index);
      break;
    case "unreveal_answer":
      unrevealAnswer(state, cmd.index);
      break;
    case "strike":
      addStrike(state);
      break;
    case "buzz":
      addBuzz(state);
      break;
    case "clear_strikes":
      clearStrikes(state);
      break;
    case "award_pot":
      awardPotToTeam(state, cmd.team);
      break;
    case "adjust_score":
      adjustScore(state, cmd.team, cmd.delta);
      break;
    case "set_team_name":
      setTeamName(state, cmd.team, cmd.name);
      break;
    case "set_controlling_team":
      setControllingTeam(state, cmd.team);
      break;
    case "reset_game": {
      const names: [string, string] = [state.teams[0].name, state.teams[1].name];
      const audio = state.audio;
      const instructions = state.instructions;
      state = resetGame(state, questions);
      state.teams[0].name = names[0];
      state.teams[1].name = names[1];
      state.audio = audio;
      state.instructions = instructions;
      break;
    }
    case "show_question":
      state.reveal.questionVisible = cmd.visible;
      break;
    case "reload_csv": {
      const names: [string, string] = [state.teams[0].name, state.teams[1].name];
      const audio = state.audio;
      questions = loadQuestions(CSV_PATH);
      state = resetGame(state, questions);
      state.teams[0].name = names[0];
      state.teams[1].name = names[1];
      state.audio = audio;
      break;
    }
    case "set_muted":
      state.audio.muted = cmd.muted;
      break;
    case "set_theme_playing":
      state.audio.themePlaying = cmd.playing;
      break;
    case "set_theme_volume":
      state.audio.themeVolume = Math.max(0, Math.min(1, cmd.volume));
      break;
    case "set_instructions_visible":
      state.instructions.visible = cmd.visible;
      break;
    case "set_instructions_page": {
      const max = state.instructions.total - 1;
      state.instructions.page = Math.max(0, Math.min(max, cmd.page));
      break;
    }
  }
}

// Graceful shutdown — flush state and close DB cleanly on signals.
function shutdown(signal: string) {
  console.log(`\n[shutdown] ${signal} — flushing state and closing DB`);
  try { persist(); } catch {}
  try { store.close(); } catch {}
  process.exit(0);
}
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("[uncaught]", err);
  try { persist(); } catch {}
  try { store.close(); } catch {}
  process.exit(1);
});

displayServer.listen(DISPLAY_PORT, () => {
  console.log(`[display] http://localhost:${DISPLAY_PORT}  (audience screen — share this)`);
});
adminServer.listen(ADMIN_PORT, () => {
  console.log(`[admin]   http://localhost:${ADMIN_PORT}  (game master controls — open on phone)`);
  console.log(`[csv]     ${state.questions.length} question(s) in play (loaded ${questions.length} from ${CSV_PATH})`);
  console.log(`[db]      ${DB_PATH}`);
});
