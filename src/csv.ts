import { parse } from "csv-parse/sync";
import { readFileSync, existsSync } from "fs";
import { Question } from "./types";

interface Row {
  question: string;
  answer: string;
  points: string;
}

export function loadQuestions(path: string): Question[] {
  if (!existsSync(path)) {
    console.warn(`[csv] no questions file at ${path} — starting empty`);
    return [];
  }
  const raw = readFileSync(path, "utf8");
  const rows = parse(raw, {
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  }) as Row[];

  const byQuestion = new Map<string, Question>();
  let nextId = 1;
  for (const row of rows) {
    const qText = (row.question ?? "").trim();
    const aText = (row.answer ?? "").trim();
    const pts = Number((row.points ?? "0").trim());
    if (!qText || !aText) continue;

    let q = byQuestion.get(qText);
    if (!q) {
      q = { id: nextId++, text: qText, answers: [] };
      byQuestion.set(qText, q);
    }
    q.answers.push({ text: aText, points: Number.isFinite(pts) ? pts : 0, revealed: false });
  }

  // Family Feud: highest-point answers on top.
  for (const q of byQuestion.values()) {
    q.answers.sort((a, b) => b.points - a.points);
  }

  return Array.from(byQuestion.values());
}
