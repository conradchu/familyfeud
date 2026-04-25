export interface Answer {
  text: string;
  points: number;
  revealed: boolean;
}

export interface Question {
  id: number;
  text: string;
  answers: Answer[];
}

export interface Team {
  name: string;
  score: number;
}

export type Round =
  | { kind: "idle" }
  | {
      kind: "playing";
      questionId: number;
      pot: number;
      strikes: 0 | 1 | 2 | 3;
      strikeFlash: number; // increments to trigger client-side X flash
      buzzFlash: number;   // wrong-answer buzz that does NOT count as a strike (face-off)
      controllingTeam: 0 | 1 | null;
    };

export interface AudioState {
  muted: boolean;
  themePlaying: boolean;
  themeVolume: number; // 0.0 – 1.0
}

export interface InstructionsState {
  visible: boolean;
  page: number; // 0-indexed
  total: number;
}

export interface GameState {
  teams: [Team, Team];
  questions: Question[];
  currentQuestionIndex: number; // index into questions array; -1 if none
  round: Round;
  // UI hints
  reveal: {
    questionVisible: boolean;
  };
  audio: AudioState;
  instructions: InstructionsState;
}
