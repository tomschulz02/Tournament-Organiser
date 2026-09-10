# Handover: Round Robin — Multiple Legs & Limited Games Per Team (1.0.1 hotfix, batch 4)

## 1. Risk declaration

Risk Level: **Medium-High** (fixture generation and standings — the two most
load-bearing pieces of business logic in the app, per `docs/tournament-rules.md`'s "do
not reimplement any part of the ranking chain elsewhere").

This touches division generation (`api/src/services/divisions.service.js`), the
standings computation `docs/tournament-rules.md` names as implemented exactly once
(`api/src/utils/tournamentViewFormatter.js`'s `buildDivisionStandings`), and the
round-progression flow (`progression.service.js`, `NextRoundModal.jsx`). This document
is deliberately long and specific because getting the standings aggregation wrong is the
kind of bug that looks fine until someone checks the numbers. It is the explanation
CLAUDE.md's Medium/High Risk process requires — read Established Facts and Decisions in
full before writing any code.

## 2. How to use this document

Read Established Facts and Decisions fully first — several findings below overturn what
looks like the obvious approach, and re-deriving them by trial and error would cost far
more than reading them. Then do the steps in order: Step 1a and 1b (generation — two
independent modes, either order, both needed) before Step 2 (standings) before Step 3
(progression UI) before Step 4 (creation UI), since each depends on the shape the
previous step produces.

## 3. Established facts

**Only the League format is in scope.** `tourganiser-ui/src/components/create/
divisionFormats.js`'s `FORMATS` array has two entries: `league` (label "Round Robin",
currently `configurable: false`) and `classic` (Pool Play + Knockout,
`configurable: true`). This handover is about `league` only. Classic's own Pool Play
stage (also internally `type: "roundRobin"`) is untouched — see Non-goals.

**One full round-robin cycle already exists as a single mechanism.**
`api/src/services/fixtures.service.js`'s `generateRoundRobinFixtures(matchNo, round)`
takes a `round` object (`{ groups, name, ... }`) and produces one fixture between every
pair of teams in each group, exactly once, via the standard circle method
(`getFixturesForRound`/`rotateGroupTeams`). `api/src/services/divisions.service.js`'s
`createLeagueState(teams, num_teams)` currently builds **exactly one** such round,
named `"Round robin"`, with `groups: [teams]` (the whole division as one pool).

**A limited games-per-team schedule is a different mathematical object from a full
cycle, and needs its own construction — it is not a truncation of the existing one.**
Tom's correction to the original scope of this handover: "games per team" is not a
minimum that gets rounded up to a whole number of cycles, it's an exact figure — each
team plays *exactly* that many games, no more. In graph terms (teams are nodes, a
fixture is an edge), a full round-robin cycle is the complete graph `K_n` (every team
plays every other team, degree `n - 1` each); a limited games-per-team schedule for `g`
games each is a **`g`-regular graph on `n` nodes** — every node has degree exactly `g`.
This only makes sense for `g < n - 1` (at `g = n - 1` it's just a full cycle, i.e. one
leg, already covered by Step 1's leg count).

**Not every `(n, g)` combination is realisable, and this is a hard mathematical fact,
not an implementation gap.** A `g`-regular graph on `n` nodes exists if and only if
`n * g` is even (standard graph theory — think of it as: total degree is always even,
since every edge contributes 2 to the sum of degrees, so `n * g`, the sum of everyone's
degree, must itself be even). Concretely: **if the team count is odd, only an even
number of games-per-team is achievable** — 7 teams can each play 2, 4, or 6 games under
this option, but never 1, 3, or 5. If the team count is even, any `g` from 1 to `n - 2`
works. This must be validated (Step 4) and rejected with a clear message when violated,
not silently rounded or allowed to produce an uneven schedule.

**A correct, simple construction exists: a circulant graph over the seed order.**
Arrange the division's teams in their existing seed order (`state.teams`) around a
circle, positions `0` to `n - 1`. For each "distance" `d` from `1` up to some `k`,
connect every team at position `i` to the team at position `(i + d) mod n` — for a fixed
`d` where `2d ≠ n`, this connects each team to exactly two others (distance `d` forward
and distance `d` backward), so using distances `d = 1..k` gives every team degree `2k`.
That covers every even `g` (`k = g / 2`). For an odd `g` on an even team count, one more
distance is available that only every team once, not twice: `d = n / 2` — the team
diametrically opposite — because `i + n/2` and `i - n/2` land on the same team when `n`
is even, so this single distance contributes degree 1, not 2. Using distances `1..(g-1)/2`
plus the `n/2` distance gives exactly odd degree `g`. This is exactly why odd `g` needs
an even team count: the `n/2` distance that supplies the "+1" only exists when `n` is
even. **This is the whole algorithm** — no scheduling rounds, no bye-handling, and
notably no relationship to the circle-method rotation `generateRoundRobinFixtures`
already uses for a full cycle, which is a different (also correct) algorithm for the
`g = n - 1` case specifically and does not generalise cleanly to a partial degree
(taking its first few "rounds" would give some teams one more game than others whenever
`n` is odd, because each of its intermediate rounds involves a bye that lands on a
different team — verified by tracing `rotateGroupTeams`/`getFixturesForRound`, not
assumed).

**A round-robin round's `groups` never depend on a previous round's results.**
Per `docs/division-state.md`, a `roundRobin` round's `groups` holds team UUIDs directly
— unlike a `knockout` round, whose `groups` holds integer indices into the *previous*
round's `results`. This matters: a second (or third) round-robin cycle's `groups` can be
the exact same `[teams]` array used by the first, with nothing to resolve or wait on.

**The existing round-progression machinery already handles a round-robin round
followed by another round-robin round correctly, with no changes needed** — verified by
tracing the actual code, not assumed:

- `progression.service.js`'s `qualifierCount(nextRound)` returns `0` when `nextRound.
  groups` holds strings (team ids) rather than integers, since it only counts integer
  entries. Every caller that matters already falls back correctly: `getProposal` and
  `commit` both compute `qualifierCount(nextRound) || computed.length`, so `0` correctly
  becomes "every team" — right, because a round-robin leg has no real elimination, every
  team carries into the next leg.
- `computeRoundResults`'s own internal call to `seedAcrossGroups(rankedGroups,
  seedIndex, qualifierCount(nextRound))` passes `0` directly (no fallback) — but
  `standings.js`'s `seedAcrossGroups` treats `qualifyingTeams = 0` as "no tier is clean,
  sort every tier" (its own doc comment: "The default of 0 makes no tier clean, so every
  tier sorts: a caller that passes no count keeps the old behaviour untouched"). For a
  single-group round-robin division (`rankedGroups.length === 1`), this produces the
  correct full ranking regardless — the "0" is not a bug here, it's the same as not
  passing a qualifying count at all.
- `bindFixturesToResults(nextRound, confirmed)` skips every group where the entries
  aren't integers, so it correctly binds nothing for a round-robin next round — that's
  right, because round-robin fixtures already carry real teams from generation, unlike
  knockout's placeholder fixtures, so there's nothing to bind after the fact.

**Standings do NOT currently aggregate across rounds — this is the one place real
change is needed.** `tournamentViewFormatter.js`'s `buildDivisionStandings` (~line 193):

```js
rounds.forEach((round, roundIndex) => {
	if (round.type !== "roundRobin" || !Array.isArray(round.groups)) { ... continue ... }
	...
	standings.push(roundStandings);
});
```

It builds and pushes **one standings entry per round-robin round object**. Today this is
invisible because no division has ever had more than one `roundRobin` round (Classic has
exactly one, "Pool Play"; League has exactly one, "Round robin"). The instant League has
two or three round objects (one per leg, per the Decision below), this function as
written would show **two or three separate half-tables** instead of one combined table
covering the whole competition — not what an organiser building a double round robin
wants to see.

**`getProposal`'s response omits the next round's `type`.** `progression.service.js`,
`getProposal` (~line 65): `nextRound: nextRound ? { name: nextRound.name, groups:
nextRound.groups } : null`. The client currently has no way to tell "the next round is
another round-robin leg" from "the next round is a real knockout stage" without this.

**`NextRoundModal.jsx` is written entirely in "qualifiers" language** — heading
"Qualifying Teams", a `qualifier:` drag-payload prefix, "qualifying position" aria
labels. For a round-robin-to-round-robin transition every team is carried forward
(nobody is eliminated), so as-is this screen would ask the organiser to "confirm
qualifiers" for a round where there's no qualification happening — mechanically correct
(see the progression facts above) but conceptually confusing copy.

## 4. Decisions already made

- **The two configuration modes Tom asked for are two separate, mutually exclusive
  mechanisms, not one collapsing into the other.** "Multiple rounds" (double/triple round
  robin) is a whole-number leg count — every leg is a full cycle, `teamCount - 1` games
  per team per leg. "Limited games per team" is a single, **exact** degree constraint —
  the organiser picks `g`, every team plays exactly `g` games, and per Established Facts
  this is a `g`-regular graph, not a rounded-up cycle count, and it is **only offered when
  `g < teamCount - 1`** (at `g = teamCount - 1` it's just "1 leg", already covered by the
  other mode — don't let the two controls overlap). A League division picks one mode or
  the other at configuration time (Step 4); it does not mix "2 legs" with "and also limit
  the last one to 3 games."
- **Multiple-legs mode: each cycle is its own round object, not fixtures merged into
  one round.** Each cycle becomes its own entry in `state.rounds`, `type: "roundRobin"`,
  `groups: [teams]` (identical across every cycle), named distinctly — e.g. `"Round
  Robin (Leg 1)"`, `"Round Robin (Leg 2)"` for two cycles, `"Round Robin (Leg 1 of 3)"`
  style for three or more (exact naming is the implementer's call; it must be distinct
  per leg since fixtures use it as their `round` value and standings need to tell them
  apart to combine them — see below). This is what makes the existing progression
  machinery apply for free, per Established Facts, and it's also what gives each leg a
  clean identity in the Fixtures list and the schedule (an organiser scheduling "Round
  Robin (Leg 1)" vs "Round Robin (Leg 2)" as visibly separate blocks of fixtures).
- **Limited-games-per-team mode: a single round object, generated by the circulant
  construction, not the leg mechanism above.** Because a `g`-regular schedule has no
  natural "leg" structure (per Established Facts, it isn't rounds of anything — it's just
  a set of pairs), it produces exactly **one** `roundRobin` round object — `groups:
  [teams]`, name e.g. `"Round Robin"` (same as today's single-leg default, since from the
  standings/progression machinery's point of view it's indistinguishable from any other
  single round-robin round — only its fixture *list* is a subset of a full cycle's).
  Nothing about Steps 2 or 3 needs to know which mode produced a given round; both modes
  produce ordinary `roundRobin` round objects, so standings aggregation and progression
  language apply identically either way.
- **Standings show one combined table across every leg of a League division, not one
  per leg.** This is the real behaviour change to `buildDivisionStandings`: when a
  division's round-robin rounds all belong to the same repeated League cycle (i.e. every
  `roundRobin` round in the division shares the same `groups` shape — one group holding
  the same team set), treat their fixtures as one pool for standings purposes rather than
  building a separate table per round object. Concretely: instead of pushing one
  `roundStandings` entry per round, a League-format division's standings pass should
  gather every `COMPLETED` fixture across all of its round-robin rounds into one set of
  per-team rows before ranking. Classic's Pool Play is unaffected — it still has exactly
  one round-robin round, so "combine across every round-robin round in the division"
  produces the same single-round result it already does today; the change is additive,
  not a special case that could regress Classic.
- **The progression UI is updated to not say "qualifiers" when nobody is being
  eliminated.** `getProposal`'s response gains `nextRound.type` (add it to the object
  already being built, per Established Facts). `NextRoundModal.jsx` checks it: when the
  upcoming round is another `roundRobin` leg of the same division, swap the "Qualifying
  Teams" heading and related copy for language appropriate to "confirm the seeding order
  for the next leg" — the underlying mechanism (reorder, confirm) is identical, only the
  words change. Exact copy is the implementer's call; it must not say "qualify" for a
  transition where everyone advances.
- **The configuration is set once, at division creation/edit time, same as Classic's
  `num_groups`/`knockout_teams`** — not adjustable mid-competition. If Tom wants it
  editable after a division starts, that's out of scope here (Classic's own structure
  isn't editable after start either, for the same reasons — see `docs/known-limitations.
  md`, division structure discussion).

## 5. Non-goals

- Don't touch Classic's Pool Play generation, `createClassicState`, or its knockout
  stage — only `createLeagueState` and League-specific config are in scope.
- Don't change `generateRoundRobinFixtures` or the circle-method pairing algorithm
  itself — it's called once per leg, unchanged, from `createLeagueState`, for full-cycle
  legs. The limited-games-per-team mode is a new, separate function (Step 1b) — don't try
  to make `generateRoundRobinFixtures` itself produce a partial degree by truncating its
  rounds; per Established Facts this gives an uneven schedule whenever `n` is odd.
- Don't offer limited-games-per-team as a choice when `g` would equal or exceed
  `teamCount - 1` — that's a full cycle, i.e. "1 leg," and belongs to the other mode.
- Don't add a `players`/roster concept or touch anything about match format — unrelated.
- Don't make the leg count or games-per-team editable after the division has started —
  see Decisions above.
- Don't change how Classic's standings are computed or displayed — the aggregation
  change in Step 2 must be additive and must not alter Classic's existing single-round
  behaviour (verify this explicitly, don't just assume the code path is separate).

## 6. Numbered steps

### Step 1a — Generate multiple round-robin legs

**Why:** the state and fixture generation need to produce N round objects instead of 1.

**Files:** `api/src/services/divisions.service.js`, `docs/division-state.md`.

**Do:**
- Extend `createLeagueState(teams, num_teams)` to accept a leg count (e.g. a new
  parameter, `legs = 1`) and build that many round objects, each `type: "roundRobin"`,
  `groups: [teams]`, distinctly named per the Decision above, each with its own
  `results: []`, `totalGames: 0`, `completedGames: 0`, `fixtures: []` — i.e. the existing
  single-round object, repeated, not merged.
- Thread the leg count through `generateDivisionDetails`/`buildDivision` the same way
  `num_groups`/`knockout_teams` already reach `createClassicState` — follow that existing
  pattern rather than inventing a new one.
- Confirm `generateFixtures` (in `fixtures.service.js`) needs no change — it already
  iterates `rounds.forEach`, calling `generateRoundRobinFixtures` once per round object;
  N round objects simply means N calls, which is already what the function does for
  Classic's multi-round state.
- Update `docs/division-state.md`'s example/description if it currently implies a League
  division only ever has one round — add a short note that League can have more than one
  `roundRobin` round, each a repeat of the same `groups`.

**Don't:** don't touch `createClassicState` or knockout generation.

**Verify:**
- Create a League division with a leg count of 1 — output is byte-for-byte what today's
  single-round generation already produces (no regression).
- Create one with a leg count of 3 — `state.rounds` has 3 entries, each `type:
  "roundRobin"`, each `groups: [teams]` identical to the others, each with its own
  distinct `name`, and each generates the full n(n-1)/2 fixtures for its own leg (or the
  correct count for whatever the actual team count is).
- Every fixture's `round` field matches the leg it belongs to, and match numbers are
  sequential across the whole division (not reset per leg) — confirm against
  `generateFixtures`'s shared `matchNo` counter.

### Step 1b — Generate a limited/partial round robin via a regular-graph construction

**Why:** per Established Facts, an exact games-per-team constraint below a full cycle is
a different mathematical object (a `g`-regular graph) than a truncated leg, and needs its
own generation path.

**Files:** `api/src/services/fixtures.service.js` (or a new module alongside it, e.g.
`partialRoundRobin.js` if `fixtures.service.js` is getting large — implementer's call),
`api/src/services/divisions.service.js`, `docs/division-state.md`.

**Do:**
- Add a new function, e.g. `generatePartialRoundRobinPairs(teamIds, g)`, that takes the
  ordered team id list and a target degree `g`, validates `0 < g < teamIds.length - 1`
  and the parity constraint (`(teamIds.length * g) % 2 === 0`, per Established Facts —
  reject with a clear error otherwise rather than silently adjusting `g`), and returns
  the list of team-id pairs using the circulant construction from Established Facts:
  distances `1..Math.floor(g / 2)` (each contributing every team's two neighbours at that
  distance), plus, when `g` is odd, the single `n / 2` diametric distance.
- Have `createLeagueState` (or wherever legs are built in Step 1a) call this instead of
  `generateRoundRobinFixtures`'s circle method when the organiser picked
  limited-games-per-team mode, producing exactly one `roundRobin` round object whose
  fixture pairs are this function's output — otherwise built the same as any round-robin
  round (`results: []`, `totalGames` equal to the pair count, `completedGames: 0`, one
  fixture per pair, match numbers continuing the division's shared counter).
- Update `docs/division-state.md` alongside Step 1a's update — note that a League round's
  fixture set is not always a full cycle; a limited-games-per-team round has a smaller,
  regular-degree fixture set instead.

**Don't:** don't reuse or modify `generateRoundRobinFixtures`/`rotateGroupTeams` for
this — per Established Facts, truncating the circle method's rounds does not produce a
regular graph when `n` is odd. This needs the separate circulant construction.

**Verify:**
- 8 teams, `g = 3` (odd, even team count — valid): the returned pair list gives every
  team exactly 3 opponents, no team plays itself or the same opponent twice, and (since
  `8 * 3 = 24` is even) this matches the realisability check.
- 7 teams, `g = 4` (even, odd team count — valid): every team gets exactly 4 opponents.
- 7 teams, `g = 3` (odd, odd team count — invalid per the parity constraint): generation
  is rejected with a clear error rather than silently producing an uneven schedule —
  confirm by attempting it and checking every team's degree would NOT come out equal if
  the check were skipped (i.e. confirm the validation is actually doing something, not
  just present but unreachable).
- `g` equal to `teamCount - 1` or higher is rejected at this layer too (defence in depth
  — Step 4's UI should already prevent it, but this function shouldn't trust the caller).

### Step 2 — Combine standings across legs

**Why:** per Established Facts, `buildDivisionStandings` currently produces one table
per round object — for a multi-leg League division this needs to become one combined
table.

**Files:** `api/src/utils/tournamentViewFormatter.js`, and any of its unit tests that
pin the current one-table-per-round behaviour (search for them — per CLAUDE.md, "search
before creating").

**Do:** change `buildDivisionStandings` so that when a division's round-robin rounds
share the same `groups` shape (the repeated-League case — all single-group, same team
set), their `COMPLETED` fixtures are gathered together and ranked as one pool, producing
one combined standings entry for the whole division rather than one per round. Classic's
Pool Play (a division with exactly one round-robin round, or with multiple *different*
groups per round — verify this doesn't exist today, but guard for it) must continue to
produce exactly what it produces today.

**Don't:** don't change how a `knockout` round's standings/bracket are built — untouched
by this function's round-robin branch.

**Verify:**
- A single-leg League division's standings look byte-for-byte identical to before this
  change (same ranking, same one table).
- A 2-leg League division shows **one** standings table, with each team's `played` count
  reflecting both legs' completed fixtures, ranked per `docs/tournament-rules.md`'s chain
  applied across the combined set.
- A Classic division's Pool Play standings are unaffected — same output as before this
  change, division with pools + knockout still ranks and progresses exactly as today.
- Head-to-head tie-breaking (per `docs/tournament-rules.md`) is checked against fixtures
  from *either* leg, not just the leg currently being viewed — two teams that split 1-1
  across two legs should be tied on head-to-head, not resolved by one leg's result alone.

### Step 3 — Fix the progression UI's language for a leg-to-leg transition

**Why:** per Established Facts, the mechanism already works, but the copy says
"qualifiers" for a transition where nobody is eliminated.

**Files:** `api/src/services/progression.service.js`,
`tourganiser-ui/src/components/NextRoundModal.jsx`.

**Do:**
- In `progression.service.js`'s `getProposal`, add `type: nextRound.type` to the
  `nextRound` object already being returned.
- In `NextRoundModal.jsx`, branch on `proposal.nextRound?.type === 'roundRobin'` (this is
  true both for League's leg-to-leg case and, incidentally, for Classic's Pool Play → a
  hypothetical second Pool Play round, which doesn't exist today but the check should be
  correct in principle either way) to swap "Qualifying Teams" and related qualifier
  language for wording appropriate to "confirm next leg's order" — see Decisions above
  for the exact behavioural requirement, exact copy is your call.

**Don't:** don't change the underlying drag/reorder/confirm mechanism, `commit`'s
validation, or anything about how the confirmed list is applied — only the copy and the
one added `type` field.

**Verify:**
- Start a 2-leg League division, complete every fixture in Leg 1, trigger "Start Next
  Round" — the modal shows every team (not a subset), with copy that doesn't say
  "qualify", and confirming it correctly generates/binds Leg 2 (already-generated
  fixtures for Leg 2 should already have real teams from Step 1 — confirm the modal's
  confirm action doesn't error or double-generate anything).
- A Classic division's real pool-to-knockout progression is completely unaffected —
  same "Qualifying Teams" copy, same behaviour, as before this change.

### Step 4 — Expose the configuration in division creation/editing

**Why:** League needs a way for the organiser to choose one of the two modes; today it
has no configuration screen at all.

**Files:** `tourganiser-ui/src/components/create/divisionFormats.js`,
`tourganiser-ui/src/components/create/DivisionModal.jsx`.

**Do:**
- In `divisionFormats.js`, set `league`'s `configurable` to `true`, and add to
  `createEmptyDivision()` a mode field (e.g. `roundRobinMode: 'legs'`) plus one field per
  mode — a leg count (default `1`) and a games-per-team target (no default; only
  meaningful when the mode is the limited one). Extend `validateDivision` with: for
  `'legs'` mode, a positive-integer leg count with a sensible upper bound (an organiser
  shouldn't be able to request an absurd number of legs against a large team count and
  generate an enormous fixture list unintentionally — use judgement, this doesn't need to
  match Classic's bounds); for the limited mode, `0 < g < teamCount - 1` **and** the
  parity check from Step 1b (`(teamCount * g) % 2 === 0`) — reject an odd `g` against an
  odd team count with a message that says why (e.g. "7 teams can only use an even number
  of games per team for this option"), not a generic validation error.
- In `DivisionModal.jsx`, the `screensFor`/`isConfigurableFormat` machinery already
  routes any `configurable` format through a `configuration` screen between Basics and
  Teams (see `screensFor`, ~line 20-22, and `SCREEN_TITLES`). Inspect how that screen
  currently renders Classic's `num_groups`/`knockout_teams` inputs (further down in this
  file than what's been read for this handover) and extend it to render League-specific
  controls when `draft.type === 'league'`: a mode switch (full round robin / limited
  games per team) that shows exactly one of two controls beneath it — a leg-count input
  for the full mode, or a games-per-team input for the limited mode. **The limited mode's
  input should react live to the current team count** — as teams are added/removed on the
  Teams screen, or if the count is already known at this point in the flow, disable or
  clearly flag values of `g` that would fail the parity or range check, rather than
  letting the organiser submit an invalid combination and only find out from a
  validation error. If the current team count isn't known yet at this screen (teams may
  be entered on a later screen), the parity/range constraint can only be enforced at
  submit time — check `screensFor`'s actual ordering to see which applies, and surface
  the constraint as inline help text either way so it isn't a surprise.
- Confirm the payload sent to `POST /api/tournaments/create` (and to `PUT /api/
  divisions/:divisionId` for an edit) carries the mode and its one relevant value, and
  that the backend (`divisions.service.js`, wherever the creation/update payload is read)
  picks it up and routes to Step 1a (legs) or Step 1b (limited) accordingly.

**Don't:** don't touch Classic's existing configuration screen fields — add League's
alongside them, branching on `draft.type`, not replacing anything. Don't let the UI
submit a limited-games-per-team value that Step 1b's own validation would reject — the
constraint should be visible before submission, not just enforced after.

**Verify:**
- Creating a League division still works with the default (full mode, 1 leg) exactly as
  before — no behaviour change for an organiser who ignores the new control.
- Setting 2 or 3 legs produces a division matching Step 1a's Verify list.
- Setting a valid limited games-per-team value produces a division matching Step 1b's
  Verify list.
- Attempting an invalid limited value (too high, or odd against an odd team count) is
  blocked in the UI with a clear explanation before submission, and `validateDivision`
  independently rejects it too if somehow submitted anyway (defence in depth, same as
  Step 1b's function-level check).

## 7. Final validation

- `npm test` from `api/` — the suite is gated at 100% coverage; new branches in
  `divisions.service.js`, `fixtures.service.js` (or wherever Step 1b's function lands),
  `tournamentViewFormatter.js` and `progression.service.js` need tests, not just manual
  verification, to keep that gate honest. Add cases for: a single-leg League (no
  regression), a multi-leg League's generation and combined standings and leg-to-leg
  progression (Step 1a), and the limited-games-per-team generation across even and odd
  team counts including the rejected odd/odd combination (Step 1b).
- `npm test` from `tourganiser-ui/` — extend the pure-module suite if any of the changed
  logic ends up in a tested file; `DivisionModal`/`NextRoundModal` aren't currently
  covered (no component render tests exist yet, per `docs/known-limitations.md`), so
  their changes lean on manual verification per the steps above.
- `npm run lint` and `npm run build` from `tourganiser-ui/` — confirm both still pass.
- Walk every step's Verify list once more end to end: create a 3-leg League division and
  play all three legs to completion, confirming one combined standings table throughout
  and progression copy that never says "qualify"; separately, create a limited
  games-per-team League division (pick a valid `(n, g)` pair) and confirm every team's
  played count reaches exactly `g` once its fixtures are complete, with no leftover
  fixtures and no team facing an opponent twice. Confirm the final division state in both
  cases matches what `docs/division-state.md` (as updated in Steps 1a/1b) now describes.
