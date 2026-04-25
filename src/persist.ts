import Database from "better-sqlite3";
import { GameState } from "./types";

export class Store {
  private db: Database.Database;
  private getStmt: Database.Statement<[]>;
  private setStmt: Database.Statement<[string]>;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    this.getStmt = this.db.prepare("SELECT json FROM state WHERE id = 1");
    this.setStmt = this.db.prepare(`
      INSERT INTO state (id, json, updated_at) VALUES (1, ?, unixepoch())
      ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
    `);
  }

  load(): GameState | null {
    const row = this.getStmt.get() as { json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.json) as GameState;
    } catch (err) {
      console.error("[persist] failed to parse saved state, starting fresh:", err);
      return null;
    }
  }

  save(state: GameState): void {
    this.setStmt.run(JSON.stringify(state));
  }

  clear(): void {
    this.db.prepare("DELETE FROM state WHERE id = 1").run();
  }

  close(): void {
    this.db.close();
  }
}
