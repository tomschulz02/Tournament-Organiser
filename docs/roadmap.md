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
- ~~**B7**~~ — **settled 2026-08-08: `teams.user_id` holds the id of the organiser who
  created the tournament.** No schema change, and it matches how teams are actually
  entered — the organiser types the names in. `createTeam` therefore needs the creating
  user's id passed down from `createTournament`. Leaves room to reassign a team to a
  captain account later without forcing that decision now.
- **C2** — make `createDivision` genuinely transactional. Team and fixture inserts
  currently bypass the transaction client, and the fixture loop is not awaited, so
  `COMMIT` runs before the writes complete.
- **C3** — stop the creation form offering Single Elimination, which the backend rejects,
  and make `location` required to match the schema.

Related drift to fix while in these files: `getTeamsByDivisionIds` and `getTeamNames`
(same `division_id` problem), and the `RETURNING num_groups` in `updateTeams`.

## Phase 2 — Settle the contracts

Decisions that constrain everything after them. Mostly discussion, little code.

- ~~**S2**~~ — **settled 2026-08-08: the server has authority.** Recorded in
  `docs/decisions.md`. Consequences, to be applied as each endpoint is built:
  `updateRounds` is deleted from `requests.js` rather than implemented, since the
  progression endpoints supersede it; `updateScore` narrows to `(fixtureId, scores)`,
  with the server deriving winner, status and round completion; `updateTeams` keeps its
  shape, with the server validating membership before rewriting `state.teams`.
- ~~**B1, B2, B3, B4, F5, F6**~~ — **done 2026-08-08: typed errors with a central
  handler.** Contract in `docs/api.md`, reasoning in `docs/decisions.md`. This was the
  one piece of Phase 2 that was substantial code rather than a decision, and it was High
  Risk under `CLAUDE.md` — architecture plus shared business logic.

  Delivered: `api/src/errors.js` (the `AppError` type and the catalogue, generalised from
  `ERROR_STATUS`); `notFound` and `errorHandler` middleware wired last in `app.js`;
  `requireAuth` handing its 401 to the same middleware; one `request` helper in
  `requests.js` that reads `message`, preserves the HTTP status and throws an `ApiError`;
  and every endpoint converted with its callers. Repositories throw and wrap `cause`,
  services throw typed errors naming a condition, no controller catches.

  Cleared three live defects — "Welcome, undefined", the object stored as a username, and
  the empty error toast — plus the 500 on a duplicate signup email, which is now a 409.

- ~~**F7**~~ — **settled 2026-08-08: the `fixture_status` enum is the only vocabulary,
  and the server derives the status.** Recorded in `docs/decisions.md` and
  `docs/tournament-rules.md`. The work: remove the translation in
  `tournamentViewFormatter.js` and the `statusMap` in `ViewTabs.jsx`, and change that
  component's filters to the enum values. **Known bug 5 is fixed by this** — move its
  test out of the known-bug suite. Best done immediately before score entry in Phase 3,
  since that endpoint is what writes the status.
- ~~**X5**~~ — **settled 2026-08-08: the check stays in the service.** Recorded in
  `docs/decisions.md`. `requireAuth` proves identity, the service proves permission, and
  every mutating service function takes `userId` as a required parameter. Two resolvers
  still to write — one for a fixture id, one for a tournament id — each returning the
  row plus its owner. Build them with the Phase 3 endpoints that need them.
- Path naming for the pending endpoints. `docs/api.md` already flags the verbs-in-paths
  and the `collection`/`collections` inconsistency.

## Phase 3 — Make the tournament runnable

The largest single gain in usable product, and the reason to do Phases 1 and 2 first.

- **Score entry** — implement `fixtures.controller.js` and
  `POST /api/fixtures/result/:fixtureId`, and mount `ScoreUpdateModal`. The payload is
  `(fixtureId, sets, finished)`; the server derives the status per the F7 decision, and
  maintains `round.completedGames` in the same transaction, which settles **B5**.
- **Round progression** — mount `NextRoundModal` and give it a trigger. The backend is
  finished; this is UI wiring.
- **Tournament lifecycle** — implement start, end and delete, with the Phase 2 ownership
  check.
- **F3** — organiser controls in `TournamentView`. Without these, none of the above is
  reachable. The `creator` flag already reaches the component and is currently used only
  to change a button label.

## Phase 4 — Close the loop on scheduling

The generator stays in the client and the server validates on write — settled
2026-08-08, see `docs/decisions.md`. The planned move of the generator to a backend
service is cancelled, so this phase is smaller than it was.

- **Document the shape of `divisions.schedule`.** It is currently implicit in
  `scheduleUtils.js` and `ScheduleMakerModal.jsx`. This blocks the validator, which
  cannot be specified against an undocumented payload. Either a new `docs/schedule.md`
  or a section in `docs/division-state.md`.
- Write the validator: fixtures belong to the division and appear once, no court clash,
  no team in two places at once, slots within the tournament dates, no knockout fixture
  before the round that feeds it. Partial schedules are legal.
- Implement `POST /api/divisions/updateSchedule/:divisionId` on top of it. The column and
  the repository function already exist.
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
