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
  delete and score entry came off that list on 2026-08-09, and team editing on
  2026-08-10.
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

`updateTeams` and `updateGroups` are gone entirely as of 2026-08-10. Both wrote part of
`divisions.state` directly, neither was called, and `updateGroups` was B6 — it changed
pool composition without regenerating the fixtures those pools no longer matched. Both
are replaced by `PUT /api/divisions/:divisionId`, which regenerates and writes `state` in
full.

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

## Teams

- **A division's group and qualifier counts are not stored.** `divisions` has no
  `num_groups` or `knockout_teams` column — the organiser's choices are consumed by
  `generateDivisionDetails` and survive only as the shape of `state.rounds`. The
  structural confirmation in `TeamsTab` therefore reverse-engineers them: group count
  from the pool round's group count, qualifier count from the flattened first knockout
  round, with a special case for a Finals round that carries four ranks because of the
  bronze match. It works, but it is inference rather than recall, and it will need
  revisiting if generation ever changes shape. Storing both on the division would remove
  the guesswork.

## Dates Are Converted Two Different Ways

**Fixed 2026-08-13.** Kept here because the shape of the fault is worth remembering.

Saving any schedule failed with "An entry falls outside the tournament dates" on a server
not running in UTC. `pg` had no type parser configured for the `date` OID, so
`tournaments.start_date` and `end_date` arrived as JavaScript `Date` objects set to
**local** midnight, and two places turned that back into a string differently:
`DateHandler.getISODate` in **UTC** via `toISOString()`, and `scheduleValidator.toIsoDate`
in **local time** via `getFullYear` / `getMonth` / `getDate`. East of UTC they differ by a
day, so the client was told the tournament started a day early, built its schedule days
from that, and the validator rejected every entry on them.

The fix is one type parser in `api/src/config/db.js`: OID 1082 is handed through as the
stored `'YYYY-MM-DD'` string, so there is no instant to render and nothing left to
disagree about. Both conversion sites now take that string and reject anything else rather
than defending against a `Date` that no longer arrives. `timestamp` (1114) and
`timestamptz` (1184) keep their default parsers, so the ETag change key is untouched —
confirmed against the running server, where `last_update` still comes back as an instant.

`test/setup.js` pins `TZ=UTC`, which is why the suite was blind to it.
`test/unit/utils/scheduleDates.test.js` is the one file that sets a non-UTC zone
deliberately, and drives the whole round trip — what the formatter reports, and what the
validator will then accept. Do not tidy the timezone out of it.

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
  agree only while no fixture is placed twice. Since 2026-08-10 the server rejects a
  duplicate fixture id on write, so a saved schedule cannot disagree — but an unsaved one
  in the modal still can, which is where this count is read. `ScheduleTab` counts the
  distinct set itself for its "x of y" line.
- ~~**The bracket showed rank placeholders after progression.**~~ — **fixed 2026-08-09.**
  `buildDivisionBracket` resolved participants from `round.groups`, which hold positional
  indices permanently; progression binds teams to the fixture instead. The bracket now
  prefers the fixture's bound teams. Separate from the connector problem below.
- **`DivisionSelector`'s live pills-to-dropdown transition is unverified.** It is correct
  at both widths when loaded fresh, but the in-app browser pane delivers neither `resize`
  events nor `ResizeObserver` callbacks, so the transition itself has never been
  observed. Worth one check in a real browser.
- ~~**The scheduled state of Fixtures & Schedule has never run against a real row.**~~ —
  **closed 2026-08-10.** `PUT /tournaments/:id/schedule` is implemented, and the state was
  exercised end to end against the development database: generated, saved, reloaded, and
  read back with its fixtures and a break intact.

## Scheduling

Phase 4 closed most of this section on 2026-08-10. What it settled — the endpoint, the
validator, the documented payload, round order in the generator, and the schedule maker's
layout and interaction defects — is recorded in `docs/roadmap.md` and is not repeated
here. What is left:

- ~~**Officials assignment** is described in `docs/tournament-rules.md` as optional but is
  not implemented anywhere.~~ — **done 2026-08-22.** The generator assigns one team per
  match as a pass over the placed schedule, behind a toggle in the generation settings that
  defaults off; a team never officiates a match overlapping one it is playing, nor one
  outside its own division, and matches with no eligible team are left blank and counted in
  the warnings. The server validates the overlap rule on write (`SCHEDULE_OFFICIAL_PLAYING`),
  resolving the `officials` name against the fixture's own division only. A name that
  resolves to no team is left alone. See `docs/schedule.md`.
- **A fixture whose round name is not in its division's `state.rounds` is exempt from the
  round-order rule**, in both the generator and the validator. It constrains nothing and
  nothing constrains it. That is drift rather than an impossible schedule, and refusing
  the save over it would strand the organiser, but it does mean the rule has a hole that
  bad data can fall through.
- **`getEntrySlotSpan` and `buildTimeSlots` in `scheduleUtils.js` are called by nothing.**
  The fixed-axis work of 2026-08-13 left both behind: the grid derives a span from
  `getEntryRowPlacement`, which floors the start and ceils the end so an unaligned entry
  covers the rows it actually overlaps — `getEntrySlotSpan` counts duration alone and
  would draw it a row short. `buildTimeSlots` was the old row builder. Both left in place
  rather than deleted — deleting code is High Risk under `CLAUDE.md` — and both still
  carry tests.
- **An entry that does not begin and end on a slot boundary is drawn across the slots it
  covers, not at its exact time.** Its stored times are untouched and shown on the block,
  and the block carries a dashed inset and a title saying so, but the grid cannot express
  a 12:35 start on a 30-minute axis. The alternative was to leave it off the grid
  entirely, which hides a real entry. An entry outside the day's configured hours *is*
  left off, and listed beneath the grid with its reason.
- **The rest minimum cannot reach across the pool-to-knockout boundary.** A semifinal's
  teams are unbound at generation time — the fixture carries `Rank 1` and a null
  `team_1` — so the generator has nobody to give rest to and will place it in the slot
  immediately after the last pool match of its division. Found while auditing the
  2026-08-13 rewrite. It is playable, because the round-order rule still holds, and it is
  not fixable without either guessing who advances or inventing a per-round gap that the
  server's validator would not share. An organiser who wants the gap adds a break. See
  `docs/tournament-rules.md`.
- **Unbound teams do not constrain the generator at all**, which is the same rule seen
  from the other side and is deliberate: two semifinals both waiting on the pools are not
  the same team and must be free to run at once. `Rank 1` in one division and `Rank 1` in
  another are likewise unrelated. Before 2026-08-13 team exclusivity was a score rather
  than a constraint, so conflating them merely produced an odd schedule; now it would
  report those fixtures as unschedulable, which is why the placeholder case is handled
  explicitly rather than left to the name fallback.
- **The generator is greedy and does not backtrack.** A fixture that takes a slot another
  needed more is never reconsidered, so `unscheduledFixtures` can name fixtures that some
  arrangement would have fitted. Settled deliberately in the 2026-08-13 rewrite: the
  honest fix is backtracking, and surfacing the failure with the constraint that caused it
  was judged to serve the organiser better than a much larger algorithm. The warning names
  the constraint precisely so the reported failure is actionable.
- **A schedule is stored as it is sent, beyond the structural checks.** There is no cap
  on entry count or on the length of `title`, `notes` and `officials`, so the column will
  hold whatever an authenticated organiser sends. That belongs with **B9** input
  validation in Phase 5 rather than with the schedule rules.
- **There is no `tournaments.last_update`**, so a schedule write stamps nothing and is
  invisible to a cache keyed on `divisions.last_update`. Phase 5 has to decide this
  before building the client-side cache.

## Overlays and stacking

- ~~**`.modal-overlay` and `.modal-backdrop` sit at `z-index: 5`, below the site header's
  `1000` and the footer's `10`**, so `ScoreUpdateModal` and `NextRoundModal` render
  *underneath* both.~~ **Fixed 2026-08-16.** Both are now portalled onto `document.body`
  and both backdrop classes sit on `--z-modal`. The whole application moved onto a named
  stacking scale at the same time, so nothing else inherits the old fault. The scale is
  tabulated in `docs/architecture.md` under frontend traps.

- **Tap targets in the `App.css` site chrome are below the 44px floor.** The 44px minimum
  was established by the tournament view's responsive pass and applied in
  `create-tournament.css` and `tournament-view.css`; it never reached the header, the menu
  or the footer. At 320px the footer links are 21px tall, the menu items 23px, the donate
  button 39px and `.tv-icon-button` 40px. None of this was introduced by the mobile
  refresh — the spacing pass left the floor where it found it. Fixing it means giving the
  chrome controls their own `min-height`, which is a piece of work in its own right.

## Project

- `api/` has Vitest, with unit and integration suites gated at 100% coverage, plus the
  deliberately failing known-bug suite in `api/test/known-bugs/`. `tourganiser-ui/` has
  Vitest too as of 2026-08-11, but it covers the **pure modules only** — `scheduleUtils`,
  `scheduleGenerator`, `fixtureUtils`, `requests` and the tournament cache. No component
  renders under test, and there is deliberately no coverage threshold: a gate over five
  files out of forty would be theatre. Add one when the suite covers enough to mean
  something.
- CI runs both packages on every push — `.github/workflows/api-tests.yml` and
  `ui-checks.yml`.
- **The UI lint step asserts the error count has not grown, rather than that it is zero.**
  `tourganiser-ui/` carries a baseline of 5 pre-existing ESLint errors — three
  `react-refresh/only-export-components` and two `react-hooks/set-state-in-effect` —
  because clearing them means moving exports into new files and reworking two effects.
  A red lint build therefore means a **new** error. When the five are fixed, drop
  `LINT_BASELINE` to 0 in the workflow and it becomes an ordinary gate.
- `api/` has no lint setup. `tourganiser-ui/` has ESLint.
- Single environment. No staging, and no migration tooling — schema changes are applied
  by hand against Neon and `docs/database.md` is updated by hand to match. This is a
  deliberate choice given how rarely the schema is expected to change; revisit it if
  that stops being true.
- `docs/` and `CLAUDE.md` are untracked by git.
- Claude's sandbox can create but not delete files under `.git/`, so any git command it
  runs can leave a stale `.git/index.lock` that blocks the developer's commits. Claude
  is barred from running git at all; see `docs/git-hygiene.md`.
