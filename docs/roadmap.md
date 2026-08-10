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

- ~~**C1**~~ — **done 2026-08-09: team creation works.** `createTeam` takes an id and
  inserts `(id, name, division_id)`, on the caller's client. `divisions.service.js`
  generates the ids up front, writes the division row first — teams carry a foreign key
  to it — then the teams, then the fixtures, and rejects a team entered twice or an entry
  carrying no name. First done on 2026-08-08 against `user_id`, which the schema does not
  have; see B7.
- ~~**B7**~~ — **reversed 2026-08-09: there is no `teams.user_id`.** The 2026-08-08
  settlement had `createTeam` insert the organiser's id, which no column could hold, so
  every tournament creation returned a 500. The reversal took the code down to the schema
  rather than migrating the schema up to the code: a team belongs to exactly one
  division, `getTeamsByUserId` is gone, and selecting an existing team by id is gone with
  it. What that gives up is recorded in `docs/decisions.md` — a team can no longer be
  followed across tournaments.
- ~~**C2**~~ — **done 2026-08-08: creating a tournament is one transaction.** A
  `withTransaction` helper on the connection in `api/src/config/db.js` owns the client;
  `createTournament` opens the boundary and threads it through every division, team and
  fixture insert. `createDivision` no longer opens its own client, both loops are
  sequential because one pg client cannot run concurrent queries, and the compensating
  `deleteTournament` is gone — the rollback does that work, and it also covers the case
  the delete never could, where the tournament insert itself failed.
- ~~**C3**~~ — **done 2026-08-08: the form no longer produces input the backend
  rejects.** Single Elimination is offered but disabled, `location` is required and
  capped at the 50 characters the column allows, `name` is capped at 50 as a soft limit,
  and the oversize-location error now reports on the location field rather than the name
  field. `generateDivisionDetails` throws `AppError` for both unsupported-format cases,
  so client-side validation is not the only check.

The related drift is fixed with C1: `getTeamsByDivisionIds` is gone, with
`tournaments.service.js` resolving each division's teams from `state.teams` through
`getTeamsByIds`, which stays the way teams are resolved because `state.teams` owns seed
order; `getTeamNames` is gone entirely; and the `RETURNING num_groups` in `updateTeams`
is dropped.

### Also critical, found 2026-08-09 — all three fixed 2026-08-09

- **Round-robin fixture generation produces nothing.** This is known bug 2.
  `createLeagueState` writes `groups: [[teams]]` — one level too deep — so
  `generateRoundRobinFixtures` sees a single "team" that is itself an array, pairs it
  with a `BYE`, and skips the fixture. A League division therefore has zero fixtures and
  an empty standings table. `createClassicState` uses `populateGroups`, which nests
  correctly, so pool play inside a Classic division is unaffected. One-line fix; move
  known bug 2's test into `divisions.service.test.js` with it.
- **Logging out leaves the page stale.** `creator` is resolved server-side and held in
  the tournament view's single request, so after logout the organiser controls stay
  visible until something else triggers a refetch. Logout should invalidate the cached
  tournament data, not just the session flag.
- **Creating a tournament appears to do nothing.** `TournamentCreation` does navigate on
  success — to `/tournaments`, which is the route that renders `Browse`, which is where
  the creation form already lives. The navigation succeeds and nothing visibly changes.
  Redirect to `/tournaments/view/:id` instead; the id is in `data.id` on the creation
  response.

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

- ~~**F7**~~ — **done 2026-08-08: the `fixture_status` enum is the only vocabulary,
  and the server derives the status.** Recorded in `docs/decisions.md` and
  `docs/tournament-rules.md`. The work: remove the translation in
  `tournamentViewFormatter.js` and the `statusMap` in the old tournament view, and change that
  component's filters to the enum values. **Known bug 5 is fixed by this** — move its
  test out of the known-bug suite. Best done immediately before score entry in Phase 3,
  since that endpoint is what writes the status.
- ~~**X5**~~ — **settled 2026-08-08: the check stays in the service.** Recorded in
  `docs/decisions.md`. `requireAuth` proves identity, the service proves permission, and
  every mutating service function takes `userId` as a required parameter. Two resolvers
  still to write — one for a fixture id, one for a tournament id — each returning the
  row plus its owner. Build them with the Phase 3 endpoints that need them.
- ~~**Path naming**~~ — **settled 2026-08-08: REST conventions.** Nouns only, plural
  collections, actions as sub-resources. The full replacement table is in `docs/api.md`.
  Collections are removed outright, since a tournament with multiple divisions replaced
  them — this also closes **F4** ahead of Phase 6.

Phase 2 is complete. Everything below is implementation.

## Phase 3 — Make the tournament runnable

**Complete 2026-08-09.** A tournament can now be created, started, scored, progressed and
finished from the UI, which had never been possible end to end before.

- ~~**Score entry**~~ — `PUT /api/fixtures/:fixtureId/result` takes `{ sets, finished }`
  and derives the status per the F7 decision, maintaining `round.completedGames` in the
  same transaction, which settles **B5**. `ScoreUpdateModal` is mounted from `View.jsx`
  and offered only on fixtures whose teams are bound.
- ~~**Round progression**~~ — `NextRoundModal` is mounted, triggered from the Standings
  tab once the current round is complete and another follows.
- ~~**Tournament lifecycle**~~ — start, end and delete are live on the resource-first
  paths, each checking ownership in the service so that "no such tournament" and "not
  yours" are distinguishable.
- ~~**X5's fixture resolver**~~ — `fixturesRepository.getFixtureWithOwner` joins fixtures
  to divisions to tournaments. The tournament-level one is `getTournamentById`, which
  already returned `created_by`.
- ~~**F3**~~ — done 2026-08-08 by the tournament view redesign.

Two things outside the plan had to be fixed to get here, both recorded in
`docs/known-limitations.md`: a trigger on `divisions` that made **every** UPDATE to that
table fail, and a bracket that read rank placeholders instead of the teams progression
had bound.

### Tournament view polish

Small, and independent of the endpoints above.

- **The fixture card's right-hand side is cramped and does not align.** Division, stage
  and status are squeezed together, and a longer stage label shifts the division column
  on that row. Give the trailing fields fixed columns so they line up down the list.
- **Status should be a colour indicator, not a word** — it is the least-read text on a
  row and the most repeated. Keep the label accessible to screen readers and to a title
  attribute; show a dot.

## Phase 3.5 — Teams

Reverses B7. The schema is already changed: `teams (id, name, division_id)`, with no
`user_id`. Do this before Phase 4, because changing a team invalidates fixtures and any
schedule built on them.

- ~~**Rework team creation for the new schema**~~ — **done 2026-08-09.** `createTeam`
  takes a team id and a division id. `getTeamsByUserId` is gone, and selecting an
  existing team by id with it, along with `TEAM_NOT_OWNED`. `getTeamsByDivisionIds` was
  **not** restored: a query by division cannot preserve seed order.
- ~~**Decide which side owns membership**~~ — **settled 2026-08-09**, recorded in
  `docs/division-state.md`. `state.teams` is authoritative for order; `teams.division_id`
  is the foreign key, carrying cascade delete and cheap lookup.
- ~~**Blast radius**~~ — **settled 2026-08-09**, recorded in `docs/decisions.md`.
  Changing a division's teams regenerates its structure; renaming does not. Build it in
  this order:

  1. **One endpoint, `PUT /api/divisions/:divisionId`**, taking the division's full
     intended team list plus `num_groups` and `knockout_teams`. The three 501 team stubs
     are removed rather than implemented — teams and structure cannot be changed
     independently, so three endpoints would be three ways to leave a division
     inconsistent.
  2. **The service derives intent from the data**, comparing incoming ids against
     `state.teams`. Same set means a rename: update names, stop. Different set means
     rebuild. The client never declares which it is doing, per the server-authority
     decision.
  3. **Gate on `status === 'Not Started'`**, plus no `COMPLETED` fixture in the division.
     Note this gate is permanently open until the Phase 3 lifecycle endpoints exist,
     since nothing currently moves a tournament off `Not Started` — ship them together
     or the restriction is decorative.
  4. **Rebuild** = delete the division's fixtures, regenerate `state.rounds` through
     `generateDivisionDetails`, regenerate fixtures through `generateFixtures`, write the
     new `state.teams`.
  5. **Repair the schedule, do not discard it.** It spans the tournament, so remove only
     the changed division's entries from `tournaments.schedule` and leave the rest
     placed. Nulling the column throws away unrelated work.
  6. **Batch on the client.** Edits accumulate and commit once, so the structural
     confirmation is asked a single time.

- **The confirmation UI reuses the creation form's division step.** Format, group count
  and qualifier count already exist there. Default to the organiser's current values,
  validate against the new team count, and flag rather than silently recompute.
- **Add and remove division** as their own capability, independent of the above.
- **B6** — the same problem from the other direction: editing groups before the
  tournament starts does not regenerate fixtures either.

## Phase 4 — Close the loop on scheduling

The generator stays in the client and the server validates on write — settled
2026-08-08, see `docs/decisions.md`. The schedule now lives on `tournaments.schedule`.

### Persistence

- **Document the shape of `tournaments.schedule`.** It is currently implicit in
  `scheduleUtils.js` and `ScheduleMakerModal.jsx`. This blocks the validator, which
  cannot be specified against an undocumented payload. A new `docs/schedule.md`.
- Write the validator: fixtures belong to the tournament and appear once, no court clash,
  no team in two places at once, slots within the tournament dates, no knockout fixture
  before the round that feeds it. Partial schedules are legal.
- Implement `PUT /api/tournaments/:tournamentId/schedule` on top of it, replacing the 501
  stub. The column and `tournamentRepository.updateSchedule` already exist, so this is
  the controller and the validator only.

### Generator correctness

- **Rounds must not overlap in time.** The generator currently places a semifinal at 9am
  on court 2 while pool play runs at 9am on court 1. A round cannot begin until the round
  feeding it has finished — the same rule the validator enforces, applied at generation
  time. This is a domain rule and belongs in `docs/tournament-rules.md`.

### Schedule maker UX

The modal's design is sound; these are layout and interaction defects.

- **The modal is sized wrong.** Its top is hidden behind the fixed site header, and its
  bottom behind the footer when the footer is in view, so controls are cut off.
- **Multiple fixtures render in the same court-and-time cell.** The assignment is
  correct; only the rendering collides.
- **Placed fixtures cannot be moved.** Once a fixture is in a slot it is fixed, so
  correcting a generated schedule means editing every entry individually. Make placed
  fixtures draggable.
- **There is no manual placement at all.** The only route to a schedule is to generate
  one and then edit it. Allow dragging a fixture from the unscheduled list straight into
  a slot, so generating is one option rather than the only one.
- **PDF export should open the browser's print dialog** rather than downloading
  immediately, so the organiser can preview before sharing. This also removes the reason
  `scheduleExport` pulls in jsPDF and html2canvas — worth checking whether the dependency
  can go entirely, which would take roughly 400kB out of the lazy chunk.

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
- **Restore the coverage gate to 100.** `vitest.config.js` sets 95 while `CLAUDE.md`
  claims 100 and actual coverage is 100.

### Client-side caching

- Cache the tournament payload in the client and refetch only when the server says it has
  changed, keyed on `last_update`. Fetching only the changed slice would be better than
  refetching the whole payload, but is not the point — avoiding the refetch entirely is.
- **Every write to `divisions` must stamp `last_update`.** Several currently do not.
- **`tournaments` has no `last_update` column.** Tournament-level changes — name, status,
  and now `schedule` — are therefore invisible to a cache keyed on the division. Either
  add the column or derive a tournament-level value from `max(divisions.last_update)`,
  which does not cover a schedule edit. Decide before building the cache.
- Interacts with the logout bug in Phase 1: whatever holds the cache has to be cleared
  when the session changes, or a logged-out viewer keeps the organiser's payload.

## Planned redesigns

- **Tournament creation page.** To be redesigned in the same way the tournament view was,
  with a specification supplied separately. Wait for it — the walkthrough is written from
  the specification, not invented.

## Phase 6 — Decide what is real

Each of these is currently a stub with no schema behind it. Either it enters the roadmap
properly or the stub is removed.

- **F9** Profile, Friends, Saved Tournaments — inert menu items, plus a `getUserProfile`
  route that hangs.
- Live scoring, officials assignment, configurable ranking basis, and the rest of
  `docs/future-features.md`.
