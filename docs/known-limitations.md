# Known Limitations

Things that are currently wrong, missing, or knowingly deferred. Add to this list as
items are identified, and remove them as they are fixed.

## Backend Completeness

- `divisions` has a route and controller for round progression only. Every other
  division endpoint is missing, though the service and repository functions behind them
  exist.
- `fixtures` has a working service and repository, but an empty router and an empty
  controller file. The router is still mounted, so calls return 404.
- The frontend calls eleven endpoints that do not exist. `docs/api.md` lists them.
- `users.controller.js` `getUserProfile` is not implemented. It now returns 501 rather
  than hanging.
- Join, leave, start, end and delete tournament are commented out in
  `tournaments.route.js`.

## Code and Schema Drift

The schema in `docs/database.md` is correct; the code below is not.

- `users.repository.js` queries a `friends` table that does not exist. Reserved for a
  future social feature.

The `teams.division_id` drift is gone as of 2026-08-08. `createTeam` inserts
`(id, name, user_id)` with the organiser's id, `getTeamNames` is now `getTeamsByUserId`,
`getTeamsByDivisionIds` has been removed in favour of resolving `state.teams` through
`getTeamsByIds`, and `updateTeams` no longer asks for a `num_groups` column that does not
exist.

## API Contract

Settled on 2026-08-08 and now implemented throughout. Every endpoint answers with
exactly `success`, `message` and `data`; repositories throw and preserve `cause`;
services throw a typed `AppError` naming a condition; controllers do not catch; and one
middleware maps, builds the envelope and logs. See `docs/api.md` and the "Typed Errors
With A Central Handler" decision.

Nothing outstanding here.

## Stale Response Envelope In Repositories

`db.query` returns `res.rows`, a plain array. Five functions in
`users.repository.js` still test `result.success` and read `result.message`, which are
leftovers from an older response shape. On an array both are `undefined`, so every one
of these throws unconditionally:

- `addFriend`
- `getFriends`
- `joinTournament`
- `getSavedTournaments`
- `unfollowTournament`

None are reachable yet — `friends` does not exist as a table, and no route is wired to
the others — so they are latent rather than live. Fix each when wiring up the endpoint
that calls it, not as a batch.

The same bug in `loginUser` was live and broke every login attempt. It has been fixed;
that function is now `findUserByEmail`.

## Authentication

- No ownership checks. Any authenticated user can act on any tournament. Mutation
  endpoints should compare `req.user.id` against `tournaments.created_by` and return
  403 on mismatch. Not yet implemented, and it becomes urgent as soon as the pending
  division and fixture endpoints go in.
- No rate limiting on login or signup.
- No input validation at the service boundary. Input longer than the column width
  surfaces as a 500 from Postgres instead of a 400.
- `helmet` is not installed, so no baseline security headers are set.
- bcrypt `saltRounds` is 10. 12 is the current recommendation.

Recommendations for all of the above are in `docs/api.md`.

Fixed on 2026-08-07: the auth middleware not rejecting requests (added `requireAuth`),
the unguarded `req.user.id` in `createTournament`, the 7d token against 24h cookie
mismatch, the `headers:` versus `allowedHeaders:` CORS typo, unreachable login error
branches, and missing environment variables failing at request time instead of boot.

## Tournament Logic

- Knockout stages use placeholder fixtures for user reference. Real teams are only
  bound once the previous round's `results` are populated.
- Standings are recomputed on every tournament detail fetch rather than stored. Correct
  but unoptimised.
- `round.completedGames` is stored but nothing ever increments it, so the round progress
  bar in the UI sits at zero. `isRoundComplete` works around this by recomputing from
  the fixture rows. Fixed by the score-entry endpoint, per the F7 decision.
- Nothing enforces the shape of `divisions.state`. A malformed write only surfaces on
  read.

Ranking now matches `docs/tournament-rules.md` and is computed only in the backend.
`NextRoundModal.jsx` no longer calculates qualifiers, so the two cannot disagree.

Outstanding:

- **`NextRoundModal` is not rendered anywhere.** It was already orphaned before being
  rewritten — nothing imports it. Round progression is therefore unreachable from the
  UI until the modal is mounted and given a trigger.
- Round objects cannot express a match format, so the per-round best-of rule is
  undeliverable until `divisions.state` gains a key for it.

## Tournament View

From the redesign of 2026-08-08.

- **Around 70 `App.css` classes are referenced by no source file**, left after the sweep
  removed 1,000 lines. They are not a deletion list: `Browse.jsx` builds
  `tournament-card-${statusVariant}`, so several appear unused while being alive. Any
  further removal needs the same per-class proof the sweep used — a selector is dead when
  *any* class in it is dead, not when all of them are. Largest clusters: the old
  `overview-tab-*` block, `tournament-standings` / `pools-standings` / `round-header`,
  `tournament-teams*` / `teams-grid` / `team-card*`, `division-schedule-summary*`,
  `schedule-maker-launcher*`, and the `fixtures-doc` print template.
- **`SummaryPage.jsx` (80 lines) is orphaned.** Nothing imports it. Kept because no
  decision has been taken about it, unlike `NextRoundModal`, `ScoreUpdateModal` and
  `Tooltip`, which are deliberately retained.
- **A division can hold team ids that no longer exist.** The development database has a
  division whose `state.teams` lists eight ids with no matching rows, so Overview reports
  eight teams while Teams shows its empty state and every standings row reads `TBD`. The
  UI is correct on the payload it is given; the count comes from `state.teams` rather
  than from resolved rows. Worth deciding whether the dashboard should count resolved
  teams instead.
- **`calculateScheduledStats` counts schedule entries, not distinct fixtures.** Those
  agree only while no fixture is placed twice, and nothing enforces that — the
  server-side rejection of a duplicate fixture id is specified in `docs/decisions.md` and
  unwritten. `ScheduleTab` counts the distinct set itself for its "x of y" line.
- **The knockout bracket infers progression rather than reading it.** Nothing in the
  payload says which match feeds which; knockout groups hold rank indices, not bracket
  positions. Connectors are drawn only where the match counts halve exactly, and omitted
  otherwise — an uneven round such as `Round of 9` renders with no lines rather than
  wrong ones. A real progression link in the data is the only way to close this.
- **`DivisionSelector`'s live pills-to-dropdown transition is unverified.** It is correct
  at both widths when loaded fresh, but the in-app browser pane delivers neither `resize`
  events nor `ResizeObserver` callbacks, so the transition itself has never been
  observed. Worth one check in a real browser.
- **The scheduled state of Fixtures & Schedule has never run against a real row.** Both
  halves of the round trip are tested, but `PUT /tournaments/:id/schedule` answers 501,
  so nothing can write the column through the UI. Confirming it needs a schedule inserted
  directly into `tournaments.schedule`.

## Scheduling

- `tournamentRepository.updateSchedule` writes `tournaments.schedule`, but
  `PUT /api/tournaments/:tournamentId/schedule` throws `NOT_IMPLEMENTED`, so schedules
  still cannot be saved through the API. Of the stubbed routes this is the one where only
  the controller is missing.
- Nothing validates a schedule. Under the split settled on 2026-08-08 the server must
  reject impossible schedules on write — court clashes, a team in two places at once,
  fixtures outside the tournament. None of that exists.
- The shape of `tournaments.schedule` is undocumented. It is implicit in
  `scheduleUtils.js` and `ScheduleMakerModal.jsx`. The validator cannot be written until
  it is recorded.
- `ScheduleMakerModal.jsx` and `scheduleGenerator.js` still work from a single division,
  which no longer matches where the schedule is stored. Rescoping them to the tournament
  is step 8 of the tournament view redesign.
- Officials assignment is described in `docs/tournament-rules.md` as optional but is not
  implemented anywhere.

## Project

- `tourganiser-ui/` has no tests and no test runner. `api/` has Vitest, with unit and
  integration suites gated at 100% coverage, plus the deliberately failing known-bug
  suite in `api/test/known-bugs/`.
- **The coverage gate is set to 95, not 100.** `vitest.config.js` sets 95 for all four
  metrics while `CLAUDE.md` and this file describe a 100% gate. Actual coverage is 100%,
  so nothing required the reduction. Either restore the threshold or change the claim —
  a gate five points below actual lets coverage fall silently.
- Nothing runs the test suite automatically. There is no CI, so the coverage gate only
  binds when someone remembers to run it.
- `api/` has no lint setup. `tourganiser-ui/` has ESLint.
- Single environment. No staging, and no migration tooling — schema changes are applied
  by hand against Neon and `docs/database.md` is updated by hand to match. This is a
  deliberate choice given how rarely the schema is expected to change; revisit it if
  that stops being true.
- `docs/` and `CLAUDE.md` are untracked by git.
- Claude's sandbox can create but not delete files under `.git/`, so any git command it
  runs can leave a stale `.git/index.lock` that blocks the developer's commits. Claude
  is barred from running git at all; see `docs/git-hygiene.md`.
