# Known Limitations

Things that are currently wrong, missing, or knowingly deferred. Add to this list as
items are identified, and remove them as they are fixed.

## Backend Completeness

- `divisions` has a route and controller for round progression only. Every other
  division endpoint is missing, though the service and repository functions behind them
  exist.
- `fixtures` has one route as of 2026-08-09: `PUT /api/fixtures/:fixtureId/result`
  records a result and maintains the round's `completedGames`. The rest of the router is
  still empty.
- The frontend calls endpoints that do not exist. `docs/api.md` lists them; start, end,
  delete and score entry came off that list on 2026-08-09.
- `users.controller.js` `getUserProfile` is not implemented. It now returns 501 rather
  than hanging.
- Join and leave tournament are still stubs answering 501. Start, end and delete were
  built on 2026-08-09 and are live on the resource-first paths in `docs/api.md`.

## Code and Schema Drift

The schema in `docs/database.md` is correct; the code below is not.

- `users.repository.js` queries a `friends` table that does not exist. Reserved for a
  future social feature.

The `teams` drift is gone as of 2026-08-09, closed in favour of the schema rather than
against it. The code briefly inserted `(id, name, user_id)` against a table that has
`division_id`, which broke tournament creation outright; B7 was reversed and the code
brought down to the schema instead. `createTeam` now takes an id and inserts
`(id, name, division_id)`, `getTeamsByUserId` is gone, and selecting an existing team by
id is gone with it — a team belongs to exactly one division. `updateTeams` no longer asks
for a `num_groups` column that does not exist.

`getTeamsByDivisionIds` stays removed: `state.teams` is authoritative for seed order, so
resolution goes through `getTeamsByIds`. See `docs/division-state.md`.

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
- ~~`round.completedGames` is stored but nothing ever increments it~~ — **fixed
  2026-08-09.** The score-entry endpoint recounts the round's `COMPLETED` fixtures from
  the rows and writes the count back in the same transaction as the result, so an edited
  result cannot double-count and a reopened one drops the count again.

  Correcting a claim repeated in `gap-analysis.md` (B5) and the Phase 3 handover: **no
  UI reads `completedGames`**, so the progress bar was never sitting at zero because of
  it. The Overview card shows `dashboard.completedFixtureCount`, which
  `tournamentViewFormatter` recomputes from the fixture rows, and the formatter does not
  surface `completedGames` at all. The field is now correct because
  `docs/division-state.md` defines it and `isRoundComplete` would otherwise be the only
  thing keeping the contract — not because anything on screen changed.
- Nothing enforces the shape of `divisions.state`. A malformed write only surfaces on
  read.

Ranking now matches `docs/tournament-rules.md` and is computed only in the backend.
`NextRoundModal.jsx` no longer calculates qualifiers, so the two cannot disagree.

Outstanding:

- ~~**`NextRoundModal` is not rendered anywhere.**~~ — **fixed 2026-08-09.** `View.jsx`
  mounts it, triggered from the Standings tab by a Start Next Round button that appears
  for the organiser once the division's current round is complete and another round
  follows. The check is a deliberate mirror of `isRoundComplete` in
  `progression.service.js`; the server revalidates regardless.
- **`commit`'s re-progression guard is unreachable.** `NEXT_ROUND_ALREADY_STARTED` fires
  only when `state.rounds[currentRound].results` is already populated, but committing
  advances `currentRound` past that round in the same write. A second commit therefore
  fails earlier, with `ROUND_NOT_COMPLETE`, because the round now under examination is
  the unplayed next one. Correcting a progression is consequently not possible through
  the API at all. Left alone: `progression.service.js` was out of scope for Phase 3.
- Round objects cannot express a match format, so the per-round best-of rule is
  undeliverable until `divisions.state` gains a key for it.

## Phase 3

From making the tournament runnable, 2026-08-09.

- **`round.completedGames` is now maintained, and nothing reads it.** The field is
  recounted from the fixture rows on every result, which is what
  `docs/division-state.md` specifies. But no part of the UI uses it — the Overview card
  shows `dashboard.completedFixtureCount`, which `tournamentViewFormatter.js` recomputes
  from the fixtures on every read. Keep the field correct because the contract says so,
  but do not expect a screen to change when it does, and do not delete it as dead.
- **Round completeness is expressed in two places.** `canProgress` in `StandingsTab.jsx`
  mirrors `isRoundComplete` in `progression.service.js` to decide whether to offer the
  progression trigger. It is presentation only — the server revalidates and answers 409 —
  but the two must be changed together.
- **Two verification items still need a signed-in session.** The lifecycle Verify list
  was checked against the test suite rather than by hand, because the database had no
  usable tournament at the time; and the full end-to-end walk, plus the second-user 403
  check, have not been done in a browser. The backend paths for both are covered by
  integration tests.

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
  decision has been taken about it, unlike `NextRoundModal` and `Tooltip`, which are
  deliberately retained. `ScoreUpdateModal` is no longer in this list — `View.jsx` mounts
  it as of 2026-08-09.
- **A division can hold team ids that no longer exist.** The development database has a
  division whose `state.teams` lists eight ids with no matching rows, so Overview reports
  eight teams while Teams shows its empty state and every standings row reads `TBD`. The
  UI is correct on the payload it is given; the count comes from `state.teams` rather
  than from resolved rows. Worth deciding whether the dashboard should count resolved
  teams instead.

  The same tournament also has knockout fixtures but no pool fixtures, while its
  `currentRound` is Pool Play. Both oddities point at one cause: it was created before
  the `createTeam` fix, under a schema the code no longer matches. **Recreate the
  development data rather than debugging it** — nothing created through the current code
  path can reach that state.
- **`calculateScheduledStats` counts schedule entries, not distinct fixtures.** Those
  agree only while no fixture is placed twice, and nothing enforces that — the
  server-side rejection of a duplicate fixture id is specified in `docs/decisions.md` and
  unwritten. `ScheduleTab` counts the distinct set itself for its "x of y" line.
- ~~**The bracket showed rank placeholders after progression.**~~ — **fixed 2026-08-09.**
  `buildDivisionBracket` resolved participants from `round.groups`, which hold positional
  indices permanently; progression binds teams to the fixture instead. The bracket now
  prefers the fixture's bound teams. Separate from the connector problem below.
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
