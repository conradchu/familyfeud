# Contributing

Thanks for your interest! This is a small project, so the bar is low: open an issue first if you're planning a non-trivial change so we can agree on direction before you write code.

## Setup

```bash
npm install
npm run dev   # tsc --watch + nodemon, picks up TS and static changes
```

Then open `http://localhost:3000` (audience) and `http://localhost:4000` (admin) in two browser windows.

## Before sending a PR

There's no test suite. Please verify your change manually:

1. `npm run build` succeeds with no TypeScript errors.
2. Server boots cleanly (no errors in the console).
3. The change works end-to-end on both screens. For game-logic changes: start a round, reveal a few answers, hit a strike, award the pot, advance to the next question — make sure nothing regressed.
4. State survives restart: kill the server mid-game, restart, and confirm the audience screen comes back exactly where you left it.

## Code style

- Architecture and conventions live in [`CLAUDE.md`](./CLAUDE.md). Skim it before making structural changes — especially the rules around the `Cmd` protocol, persistence migrations, and the display-is-read-only invariant.
- Frontend is plain HTML/CSS/JS — no build step, no framework. Keep it that way.
- New game-state fields need a backfill in `migrateState()` so existing saved games don't break.

## Reporting bugs

Open an issue with:
- Node version (`node -v`)
- Steps to reproduce
- What you expected vs. what happened
- Browser console output (for display/admin issues)

## What's in scope

- Bug fixes.
- Quality-of-life admin improvements (better mobile UX, keyboard shortcuts, etc.).
- New question packs (PRs to `questions.csv` welcome — keep them generic / family-friendly).
- Sound effect tweaks.

## What's out of scope (without a discussion first)

- Adding a frontend framework or build pipeline.
- Swapping SQLite for another database.
- Multiplayer / multi-room support.
- Auth / accounts.

## A note on the audio file

`audio/sfx/theme.m4a` is gitignored. Don't commit any third-party media files — they're not covered by this project's MIT license.
