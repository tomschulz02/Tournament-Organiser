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

- `divisions.repository.js` `getTeamsByDivisionIds`, `getTeamNames` and `createTeam`
  still read and write a `teams.division_id` column. The `teams` table has `user_id`,
  not `division_id`. Division membership lives in `state.teams`. This breaks team names
  in the tournament detail view, and it breaks tournament creation outright —
  `createTeam` cannot insert at all. `getTeamsByIds` was added for round progression and
  does it correctly, looking up ids from `state.teams`. Use it as the pattern when
  fixing the rest.
- `createTeam` also never populates `teams.user_id`, which is `NOT NULL`. Deciding what
  belongs there is an open design question — see `docs/gap-analysis.md`, item B7.
- `divisions.repository.js` `updateTeams` uses `RETURNING num_groups`. The `divisions`
  table has no such column.
- `users.repository.js` queries a `friends` table that does not exist. Reserved for a
  future social feature.

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
- Fixture status has two vocabularies — the `fixture_status` enum, and the
  `WAITING`/`ONGOING` pair used in `tournamentViewFormatter.js` and `ViewTabs.jsx`. The
  enum won on 2026-08-08; until the translation is removed, known bug 5 stands.

  This is not only untidy. `normalizeFixture` does **not** translate the enum — it only
  defaults a null status to `WAITING`. So a real fixture keeps its `UPCOMING` status and
  is then excluded by the filter in `buildDivisionOverview`, which looks for `WAITING`
  or `ONGOING`. **"Upcoming Fixtures" is therefore empty on both the tournament
  dashboard and the division overview for every real fixture**, and
  `FIXTURE_STATUS_LABELS` never resolves a label for `UPCOMING` or `LIVE` either. Same
  cause in `ViewTabs.jsx`, where the `upcoming` and `live` filters match nothing.
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

## Scheduling

- The `divisions.schedule` column was added on 2026-08-07 and
  `divisionsRepository.updateSchedule` writes to it, but no route or controller calls
  that yet, so schedules still cannot be saved.
- Nothing validates a schedule. Under the split settled on 2026-08-08 the server must
  reject impossible schedules on write — court clashes, a team in two places at once,
  fixtures outside the division. None of that exists.
- The shape of `divisions.schedule` is undocumented. It is implicit in `scheduleUtils.js`
  and `ScheduleMakerModal.jsx`. The validator cannot be written until it is recorded.
- Officials assignment is described in `docs/tournament-rules.md` as optional but is not
  implemented anywhere.

## Project

- `tourganiser-ui/` has no tests and no test runner. `api/` has Vitest, with unit and
  integration suites gated at 100% coverage, plus the deliberately failing known-bug
  suite in `api/test/known-bugs/`.
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
