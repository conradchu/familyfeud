import { GameState, Question, Round } from "./types";

export function makeInitialState(questions: Question[]): GameState {
  return {
    teams: [
      { name: "Team 1", score: 0 },
      { name: "Team 2", score: 0 },
    ],
    questions: cloneQuestions(questions),
    currentQuestionIndex: questions.length > 0 ? 0 : -1,
    round: { kind: "idle" },
    reveal: { questionVisible: false },
    audio: { muted: false, themePlaying: true, themeVolume: 0.7 },
    instructions: { visible: false, page: 0, total: INSTRUCTIONS_TOTAL },
  };
}

export const INSTRUCTIONS_TOTAL = 4;

export function migrateState(state: GameState): GameState {
  // Backfill blocks for states persisted before these fields existed.
  if (!state.audio) {
    state.audio = { muted: false, themePlaying: true, themeVolume: 0.7 };
  } else if (typeof state.audio.themeVolume !== "number") {
    state.audio.themeVolume = 0.7;
  }
  if (!state.instructions) {
    state.instructions = { visible: false, page: 0, total: INSTRUCTIONS_TOTAL };
  } else {
    state.instructions.total = INSTRUCTIONS_TOTAL;
  }
  if (state.round.kind === "playing" && typeof (state.round as { buzzFlash?: number }).buzzFlash !== "number") {
    state.round.buzzFlash = 0;
  }
  return state;
}

export function cloneQuestions(questions: Question[]): Question[] {
  return questions.map((q) => ({
    ...q,
    answers: q.answers.map((a) => ({ ...a, revealed: false })),
  }));
}

export function currentQuestion(state: GameState): Question | null {
  if (state.currentQuestionIndex < 0) return null;
  return state.questions[state.currentQuestionIndex] ?? null;
}

export function startRound(state: GameState): void {
  const q = currentQuestion(state);
  if (!q) return;
  // reset answer reveals for this question
  for (const a of q.answers) a.revealed = false;
  state.round = {
    kind: "playing",
    questionId: q.id,
    pot: 0,
    strikes: 0,
    strikeFlash: 0,
    buzzFlash: 0,
    controllingTeam: null,
  };
  state.reveal.questionVisible = true;
}

export function addBuzz(state: GameState): void {
  if (state.round.kind !== "playing") return;
  state.round.buzzFlash += 1;
}

export function revealAnswer(state: GameState, index: number): void {
  const q = currentQuestion(state);
  if (!q || state.round.kind !== "playing") return;
  const a = q.answers[index];
  if (!a || a.revealed) return;
  a.revealed = true;
  state.round.pot += a.points;
}

export function unrevealAnswer(state: GameState, index: number): void {
  const q = currentQuestion(state);
  if (!q || state.round.kind !== "playing") return;
  const a = q.answers[index];
  if (!a || !a.revealed) return;
  a.revealed = false;
  state.round.pot = Math.max(0, state.round.pot - a.points);
}

export function addStrike(state: GameState): void {
  if (state.round.kind !== "playing") return;
  if (state.round.strikes < 3) {
    state.round.strikes = (state.round.strikes + 1) as 0 | 1 | 2 | 3;
  }
  state.round.strikeFlash += 1;
}

export function clearStrikes(state: GameState): void {
  if (state.round.kind !== "playing") return;
  state.round.strikes = 0;
}

export function awardPotToTeam(state: GameState, team: 0 | 1): number {
  if (state.round.kind !== "playing") return 0;
  const pot = state.round.pot;
  state.teams[team].score += pot;
  state.round.pot = 0;
  return pot;
}

export function adjustScore(state: GameState, team: 0 | 1, delta: number): void {
  state.teams[team].score = Math.max(0, state.teams[team].score + delta);
}

export function setTeamName(state: GameState, team: 0 | 1, name: string): void {
  state.teams[team].name = name.trim() || `Team ${team + 1}`;
}

export function setControllingTeam(state: GameState, team: 0 | 1 | null): void {
  if (state.round.kind !== "playing") return;
  state.round.controllingTeam = team;
}

export function endRound(state: GameState): void {
  state.round = { kind: "idle" };
  state.reveal.questionVisible = false;
}

export function gotoQuestion(state: GameState, index: number): void {
  if (index < 0 || index >= state.questions.length) return;
  state.currentQuestionIndex = index;
  state.round = { kind: "idle" };
  state.reveal.questionVisible = false;
  // reset reveals on the new question
  const q = state.questions[index];
  for (const a of q.answers) a.revealed = false;
}

export function nextQuestion(state: GameState): void {
  if (state.currentQuestionIndex + 1 < state.questions.length) {
    gotoQuestion(state, state.currentQuestionIndex + 1);
  }
}

export function prevQuestion(state: GameState): void {
  if (state.currentQuestionIndex > 0) {
    gotoQuestion(state, state.currentQuestionIndex - 1);
  }
}

export function resetGame(state: GameState, questions: Question[]): GameState {
  return makeInitialState(questions);
}

export function setRound(state: GameState, round: Round): void {
  state.round = round;
}
