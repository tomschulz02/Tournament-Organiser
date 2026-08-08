# Roadmap

Ordered by dependency, not by appetite. Each phase is a coherent unit that leaves the
application in a better state than it found it.

Item codes (`C1`, `B7`, `F3`…) refer to `docs/gap-analysis.md`, which describes each one
in full. This document says what to do and in what order; that one says why.

Last reviewed 2026-08-08.

---

## Phase 0 — Establish ground truth

Complete.

- **C1 confirmed.** `docs/database.md` is correct. The `teams` table has `id`, `name`
  and `user_id`, and no `division_id`. Tournament creation is therefore broken in
  production, not merely fragile.
- **D1–D4 fixed.** `CLAUDE.md`, `README.md`, `architecture.md` and
  `known-limitations.md` now describe the repository that exists, including the test
  suite they previously denied.
- **B12 fixed.** The known-bug suite no longer runs as part of `npm test`, so the
  default test command is a usable signal again.
- **X1 decided: no migration tooling.** Schema changes are rare enough that applying
  them by hand and updating `docs/database.md` to match is proportionate.
  `docs/database.md` stays the source of truth and is overwritten rather than
  accumulating historical schemas; git holds the history.

## Phase 1 — Restore the critical path

Nothing else can be exercised end to end until a tournament can be created.

- **C1** — fix `createTeam`. It is called with no arguments, and it writes to a
  `division_id` column that does not exist. Follow `getTeamsByIds`, which already does
  this correctly.
- **B7** — decide what `teams.user_id` holds. It is `NOT NULL` and nothing populates it,
  so C1 cannot be fixed without answering this.
- **C2** — make `createDivision` genuinely transactional. Team and fixture inserts
  currently bypass the transaction client, and the fixture loop is not awaited, so
  `COMMIT` runs before the writes complete.
- **C3** — stop the creation form offering Single Elimination, which the backend rejects,
  and make `location` required to match the schema.

Related drift to fix while in these files: `getTeamsByDivisionIds` and `getTeamNames`
(same `division_id` problem), and the `RETURNING num_groups` in `updateTeams`.

## Phase 2 — Settle the contracts

Decisions that constrain everything after them. Mostly discussion, little code.

- **S2** — does the server own tournament state, or does the client? `progression.service.js`
  says the server; `requests.js` still assumes the client. Every pending endpoint
  depends on the answer.
- **B1** — one repository error convention. Currently some functions throw and some
  return an error string, so callers cannot tell success from failure.
- **F7** — one fixture status vocabulary. `UPCOMING`/`LIVE` in the database against
  `WAITING`/`ONGOING` in the frontend is the direct cause of known bug 5.
- **X5** — one ownership-check pattern, generalised from `progression.service.js`.
- **B3, B4** — typed errors and a central error handler, so the `ERROR_STATUS` table in
  `divisions.controller.js` generalises instead of being copied.
- Path naming for the pending endpoints. `docs/api.md` already flags the verbs-in-paths
  and the `collection`/`collections` inconsistency.

## Phase 3 — Make the tournament runnable

The largest single gain in usable product, and the reason to do Phases 1 and 2 first.

- **Score entry** — implement `fixtures.controller.js` and
  `POST /api/fixtures/result/:fixtureId`, and mount `ScoreUpdateModal`. Settle **B5**
  (`completedGames` is stored but never maintained) while in there.
- **Round progression** — mount `NextRoundModal` and give it a trigger. The backend is
  finished; this is UI wiring.
- **Tournament lifecycle** — implement start, end and delete, with the Phase 2 ownership
  check.
- **F3** — organiser controls in `TournamentView`. Without these, none of the above is
  reachable. The `creator` flag already reaches the component and is currently used only
  to change a button label.

## Phase 4 — Close the loop on scheduling

- Implement `POST /api/divisions/updateSchedule/:divisionId`. The column and the
  repository function already exist, so this is the cheapest complete feature available.
- Then decide separately whether the generator moves to the backend, as
  `docs/architecture.md` intends.
- **B6** — editing groups before the tournament starts does not regenerate fixtures.

## Phase 5 — Correctness and consolidation

- The remaining known bugs in `api/test/known-bugs/`, worked through as the surrounding
  code is touched, per the existing "fix drift when you touch it" rule.
- **B9** input validation, and the deferred security items in `docs/api.md` — rate
  limiting, `helmet`, `saltRounds`.
- **B2** the pool-poisoning return in `updateResult`, **B10** health endpoint and
  graceful shutdown, **B11** dead repository code.
- Frontend consolidation: **F5** the repetition in `requests.js`, **F6** the dead retry,
  **F8** direct DOM manipulation, **F11** the CSS.
- **X3** CI, **X4** a linter for `api/`, **F12** frontend tests.

## Phase 6 — Decide what is real

Each of these is currently a stub with no schema behind it. Either it enters the roadmap
properly or the stub is removed.

- **F4** Collections — two request functions, a component, and a field in the creation
  summary, with no table and no endpoint.
- **F9** Profile, Friends, Saved Tournaments — inert menu items, plus a `getUserProfile`
  route that hangs.
- Live scoring, officials assignment, configurable ranking basis, and the rest of
  `docs/future-features.md`.
