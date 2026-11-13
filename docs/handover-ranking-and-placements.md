# Handover: ranking rules and placement matches

From the tournament view redesign (mockups: the "Round 2 · picks" page of
https://claude.ai/artifact/3e3f9xNTDtGrfxeoiEA1Gq, board "Settings · Divisions"). Written
2026-11-08. Delete this file when the work is done; the durable record goes into
`docs/tournament-rules.md`, `docs/division-state.md`, `docs/database.md` (the meaning of
`placement_depth = 1`) and `docs/decisions.md`.

Companion handovers: `handover-pool-draws.md` (adds a Pool draw section above the ones
built here). The rest of the view was redesigned already; see `DESIGN.md`, "Tournament view".

## 1. Risk declaration

**High.** This changes shared business logic (the ranking chain every standings table,
every qualification and every final ranking goes through), knockout generation (the
3rd-place playoff becomes optional) and the documented shape of `divisions.state`.
**No schema change:** the rules are stored in `divisions.state`, and "final only" uses a
new value in the existing `placement_depth` integer column.

Specific risks:

- **Changing who qualified.** Ranking feeds `progression.service.js`. A comparator bug
  silently sends the wrong team to the knockout. Step 3 ports every existing ranking test
  through the mapping in section 3 before any new behaviour is added, so the four current
  bases must rank identically before and after.
- **Existing divisions.** Production holds real tournaments (TuksVolleyball HST 2026).
  Every existing division must keep its ranking. No row is migrated: a division without
  `state.rankingRules` has its rules derived from `ranking_basis` by the mapping in
  section 3, and step 3 proves the mapping.
- **Regeneration drops state keys.** A seed reorder or team rebuild writes a freshly
  generated state over the old one (`replaceState`), so rules kept in state would be lost
  unless carried across. Step 2 carries them; see section 3, "Settings in state".
- **The 3rd-place playoff is found by position today.** `fixtures.service.js:462` names
  group 0 of the "Finals" round "3rd Place Playoff". Remove that group and the **final**
  becomes group 0 and is labelled as the 3rd-place match. Step 5 replaces the positional
  check before anything can generate a Finals round without it.
- **Head-to-head anywhere in a custom order.** Today it is always 4th, and its cycle rule
  ("fall straight through to seeding") is written for that position. Section 4 settles
  the generalised rule; it needs tests for head-to-head first, middle and last.
- **Settings can be changed mid-event.** Ranking can be changed at any time today, and
  placement depth only until the knockout starts. Both stay that way. A ranking change
  after results exist re-sorts live tables; that is existing behaviour, not new.

This document is the explanation the High Risk process requires. Nothing is implemented
until it is approved.

## 2. How to use this document

One step per session, in order: each step depends on the one before. Each ends with the
application working and can ship alone. Do not re-inspect anything section 3 states.
Read only the files a step names. Run the final validation once, at the end.

Step 2 needs the shared `carryStateSettings` helper also specified in
`handover-pool-draws.md` step 3. Whichever handover runs first adds it; the other adds its
key to the list.

## 3. Established facts

### Storage today

`divisions` (see `docs/database.md`, "Release 1.1 additions"):

| Column | Type | Meaning |
|---|---|---|
| `ranking_basis` | `varchar(30) DEFAULT 'MATCHES_WON' NOT NULL` | `MATCHES_WON`, `FIVB_POINTS`, `SIMPLIFIED_POINTS` or `SETS_WON`. |
| `placement_depth` | `integer` null | Lowest rank decided by a played match. Null = final and 3rd-place only; otherwise odd, ≥ 5, ≤ knockout size. |

### Settings in state: how state is written

`docs/division-state.md` is the source of truth for the shape. Today's top-level keys are
`teams`, `rounds`, `currentRound` and the optional `color`. `color` is the precedent for a
setting kept in state: absent means the default, it is written with its own patch, and
clearing it removes the key.

- Writers live in `api/src/repositories/divisions.repository.js`. Every narrow write is a
  `jsonb_set` on one key: `updateStateRounds` (line 205, result entry and depth changes),
  `updateRounds` (170, progression), `updateStateColor` (225). Result entry locks the row
  with `getStateForUpdate` (`SELECT ... FOR UPDATE`) and writes `rounds` only, so a rules
  write done as its own `jsonb_set` cannot clobber a result or be clobbered by one, even
  mid-event.
- `replaceState` (line 122) writes the whole object. It is used by `reorderTeams`
  (`divisions.service.js` line 389) and `rebuildDivision` (472), which build the new state
  with `buildDivision` and so keep only what `createClassicState` / `createLeagueState`
  put in it. **This already drops `color`** on a reorder or rebuild.
- `normalizeDivisionState` (`api/src/utils/tournamentViewFormatter.js` line 939) names
  every key it passes on, so a new key must be added there to reach the client.
- `progression.service.js` and `tournamentViewFormatter.js` already have `division.state`
  wherever they have `division.ranking_basis` (the repository select at line 269 returns
  both), so reading rules from state needs no new query.

**The shared helper:** a pure `carryStateSettings(oldState, newState)` in
`divisions.service.js` that copies the setting keys (`color`, `rankingRules`, and
`poolDraw` once that handover lands) from old to new when present. `reorderTeams` and
`rebuildDivision` call it before `replaceState`. It fixes the `color` loss as a side effect.

### The ranking chain today — `api/src/utils/standings.js`

- `createStandingsRow` (line 13): `played, won, lost, setsWon, setsLost, pointsFor,
  pointsAgainst, setOutcomes, setsRatio, pointsRatio`. `setOutcomes` counts finished
  matches by scoreline from the team's side: `{"2-0": 3, "1-2": 1}`. Best of five gives
  `3-0, 3-1, 3-2, 2-3, 1-3, 0-3`.
- `RANKING_BASES` (line 174) and `primaryScore(row, basis)` (line 180). Match points come
  from `setOutcomes` via `matchPoints`, `fivbPoints`, `simplifiedPoints`, `decidingSet`
  (a match went to a deciding set when the loser took a set and the margin is one).
- `compareTeams(a, b, { headToHead, seedIndex, basis })` (line 222): primary → set ratio →
  point ratio → head-to-head → seeding.
- `rankGroup(rows, { headToHead, seedIndex, basis })` (line 248) forms tiers with
  `groupTiedRows` / `compareBeforeHeadToHead` (everything before head-to-head), and for a
  tier of three or more whose head-to-head results loop (`headToHeadCycle`) sorts by
  seeding alone.
- `seedAcrossGroups(rankedGroups, seedIndex, qualifyingTeams, basis)` (line 343) compares
  same-position teams across pools with `compareTeams` and **no** head-to-head map, which
  is how head-to-head is skipped across pools.
- Undefined ratios (won sets, lost none) are tied with each other and fall through; see
  `docs/tournament-rules.md`, "Undefined ratios". `compareRatio` (line 101) implements it.

Callers that pass `basis`, all reading `division.ranking_basis`:

| File | Lines | Purpose |
|---|---|---|
| `api/src/services/progression.service.js` | 42, 110, 260–295 | Ranking a finished pool round to fill the knockout. |
| `api/src/utils/tournamentViewFormatter.js` | 85, 119, 315 | Standings tables in the view payload; `ranking_basis` is sent to the client. |
| `api/src/utils/tournamentViewFormatter.js` | 891, 901 | Final rankings tiebreaks (no basis passed — matches won). |

### Mapping the four bases onto the new model

| `ranking_basis` | `method` | Values |
|---|---|---|
| `MATCHES_WON` | `wins` | `wins: "matches"` |
| `SETS_WON` | `wins` | `wins: "sets"` |
| `FIVB_POINTS` | `points` | straight win 3, deciding win 2, deciding loss 1, straight loss 0 |
| `SIMPLIFIED_POINTS` | `points` | straight win 2, deciding win 2, deciding loss 1, straight loss 0 |

All four use the tiebreaker order `SET_RATIO, POINT_RATIO, HEAD_TO_HEAD`, then seeding.

### Tiebreakers that can be computed from a standings row

| Key | Definition | Row fields |
|---|---|---|
| `SET_RATIO` | sets won ÷ sets lost (undefined-ratio rule applies) | `setsRatio` |
| `POINT_RATIO` | points won ÷ points lost (undefined-ratio rule applies) | `pointsRatio` |
| `HEAD_TO_HEAD` | result between the tied teams; skipped across pools | head-to-head map |
| `SET_DIFFERENCE` | sets won − sets lost | `setsWon`, `setsLost` |
| `POINT_DIFFERENCE` | points won − points lost | `pointsFor`, `pointsAgainst` |
| `POINTS_SCORED` | total rally points won | `pointsFor` |
| `SETS_WON` | total sets won | `setsWon` |
| `SEEDING` | position in `state.teams` | always last, not stored |

### The settings endpoint today

`PUT /api/divisions/:divisionId/settings` (`divisions.route.js:28`) →
`divisions.controller.js` `updateDivisionSettings` → `divisions.service.js`
`updateDivisionSettings` (line 167). Body `{ rankingBasis?, placementDepth? }`, each
optional. Gated by `assertManagesSetup` (`manageSetup`: co-organiser and organiser).
`readRankingBasis` validates the enum; `readPlacementDepth` (line 211) refuses a League,
refuses once `currentRound >= firstKnockout` (`KNOCKOUT_ALREADY_STARTED`), accepts null,
otherwise requires an odd integer from 5 to the knockout size (`INVALID_PLACEMENT_DEPTH`).
A depth change runs `replaceKnockoutRounds` (line 246) in a transaction.

### The 3rd-place playoff today

- Generated in `createClassicState` (`divisions.service.js` ~line 942): in the round named
  "Finals", `round.groups.unshift([2,3])`. So Finals groups are `[[2,3],[0,1]]` and the
  final is `[0,1]`.
- Identified **by position or by name**, never by a marker:
  - `fixtures.service.js:462` — `round.name === "Finals" && index === 0` → "3rd Place Playoff".
  - `fixtures.service.js:213` and `utils/scheduleValidator.js:355` — `THIRD_PLACE` constant.
  - `utils/tournamentViewFormatter.js:415, 654–658` — by the fixture's round text.
- `addPlacementMatches` (line 1008) assumes the semifinal losers already play for 3rd
  (comment at ~line 1026), so depths ≥ 5 always include the 3rd-place match.

### Client today

- `tourganiser-ui/src/components/tournament/SettingsTab.jsx`: `RANKING_BASES` labels
  (line ~355), `DivisionSettingsBand`, `DivisionSettingsRow` (two selects, saves on
  change, full-screen `LoadingScreen` while a depth change regenerates), `knockoutOf`,
  `placementOptions` (odd from 5), `ordinal`.
- `tourganiser-ui/src/requests.js`: `updateDivisionSettings(divisionId, settings)`.
- Reordering UI to copy for the tiebreaker list: the seed list in
  `components/tournament/TeamsTab.jsx` (up/down buttons on every row, drag handle only
  under `(pointer: fine)`, keyboard arrows).

### Tests that cover this

`api/test/unit/utils/standings.test.js`, `unit/services/divisionSettings.test.js`,
`unit/services/placementMatches.test.js`, `unit/services/progression.service.test.js`,
`integration/routes/divisions.route.test.js`, `integration/repositories/divisions.repository.test.js`.
`npm test` in `api/` is gated at 100% coverage.

### What the design asks for that the data cannot support yet

| Asked for | Status |
|---|---|
| A "Draw" points row | Volleyball has no draws (an equal set counts for neither team). Store nothing; hide the row. |
| A preview of how a table would reorder | Dropped by the owner. Do not build. |

## 4. Decisions already made

Not to be revisited.

- **Full control.** The organiser chooses **Points** or **Wins**. Points: a number for each
  result type (win in straight sets, win in the deciding set, loss in the deciding set,
  loss in straight sets). Wins: match wins or set wins. Preset chips (FIVB 3·2·1·0,
  Simple 2·1) only fill in the numbers.
- **Tiebreak deciders are an ordered list** the organiser reorders like seeding, with
  remove and add. **Seeding is always last** and cannot be removed or moved.
- **Placement options are the place each match is played for:** 1st (final only), 3rd
  (the default: final and 3rd-place match), 5th, 7th, … up to the knockout size. The
  3rd-place match is on by default and can be removed.
- **Layout:** one "Divisions" settings section per division, sub-sections **stacked
  vertically**, never side by side. Headings are short nouns with a one-line subtitle:
  "Ranking", "Tiebreak deciders", "Placement matches".
- **Head-to-head in a custom position** (proposed here, confirm at approval): it applies
  only to the teams still level on every decider above it. If three or more of them form a
  loop, head-to-head is skipped **for that group** and the list carries on with the next
  decider, then seeding. With today's default order this is exactly the current rule.
- **Storage: in `divisions.state`, not a new column.** Key `rankingRules` (shape in step
  2). **Absent means "derive from `ranking_basis`"** by the mapping in section 3, so no row
  is migrated. Once an organiser saves rules, `state.rankingRules` is authoritative for
  that division and `ranking_basis` is no longer read or written for it. The column stays
  as the fallback for divisions never edited; dropping it would be a separate, later
  schema change and is not part of this work.
- **Final only** is stored as `placement_depth = 1` in the existing integer column (no
  constraint to change). Null keeps meaning "final and 3rd place", so no existing row
  changes.

## 5. Non-goals

- No ranking preview.
- No draws, no other sports.
- Do not change knockout pairing, `seedAcrossGroups`' cross-pool rule, or how placement
  depths ≥ 5 are generated.
- No schema change and no data migration. Do not drop or rewrite `ranking_basis`.
- Pool draws are `handover-pool-draws.md`. The rest of the tournament view is already
  redesigned (`DESIGN.md`, "Tournament view"); leave it as it is.

## 6. Steps

### Step 1 — Write the rules down first

**Why:** `docs/tournament-rules.md` is the source of truth and currently says "Only this
first criterion is configurable".

**Files:** `docs/tournament-rules.md` (ranking section, ~lines 120–160; "Placement
matches", ~270–300), `docs/decisions.md` (including why state rather than a column),
`docs/division-state.md` (the `rankingRules` key in the Top Level table, with the
absent-means-derived rule), `docs/database.md` (the `placement_depth` note: 1 means
final only; the `ranking_basis` note: fallback only).

**Do:** Describe the rules model (method, points per result type, wins kind, ordered
deciders, seeding last), the generalised head-to-head rule from section 4, the default
order, and the mapping table from section 3. Describe placement depth 1. Record the
decision and its reason in `decisions.md`.

**Don't:** Touch code. Rewrite unrelated parts of the rules.

**Verify:** Someone reading only `tournament-rules.md` can rank a tied pool by hand under
a custom order and gets the same answer as the doc's own worked example.

### Step 2 — Rules in state, and one way to read them

**Why:** Everything after this reads the new shape through one function.

**Files:** `api/src/utils/standings.js` (or a small `rankingRules.js` beside it),
`api/src/services/divisions.service.js` (`carryStateSettings`, `reorderTeams`,
`rebuildDivision`), `api/src/utils/tournamentViewFormatter.js`
(`normalizeDivisionState`, payload), tests.

**Do:** Define the shape of `state.rankingRules`: `{ "method": "points"|"wins",
"points": { "straightWin", "decidingWin", "decidingLoss", "straightLoss" },
"wins": "matches"|"sets", "tiebreakers": [keys] }` (`points` only when method is points,
`wins` only when method is wins). Add pure functions: `rulesFromBasis(basis)` (the
section 3 mapping), `rankingRulesOf(division)` (returns `state.rankingRules` when present,
otherwise `rulesFromBasis(division.ranking_basis ?? "MATCHES_WON")`), and the validator
`readRankingRules(value)` (known method, integer points 0–10, known unique tiebreaker
keys, no `SEEDING` in the list). Pass `rankingRules` through `normalizeDivisionState`
when present. Send the effective rules (`rankingRulesOf`) in the view payload as
`ranking_rules`, next to `ranking_basis`. Add `carryStateSettings` if the pool-draw work
has not, with `color` and `rankingRules`, and call it in `reorderTeams` and
`rebuildDivision`.

**Don't:** Change any ranking yet. Add a column or migration. Write `rankingRules` for
divisions that have not been edited.

**Verify:** `rankingRulesOf` returns the mapped rules for each of the four bases and the
stored rules when present. A division with stored rules (and a chosen colour) keeps both
after a reorder and a rebuild. `npm test` green at 100%.

### Step 3 — Rank by rules

**Why:** The engine change, kept separate so it can be proven against old behaviour.

**Files:** `api/src/utils/standings.js`, `api/src/services/progression.service.js`,
`api/src/utils/tournamentViewFormatter.js`, `api/test/unit/utils/standings.test.js`,
`progression.service.test.js`.

**Do:** Replace `basis` with `rules` in `primaryScore`, `compareTeams`, `rankGroup`,
`seedAcrossGroups`. Primary score: points from `setOutcomes` by the four numbers, or
`won` / `setsWon`. Build the comparator from `rules.tiebreakers` in order, then seeding.
Head-to-head per section 4: tiers are formed on everything above it; a looping tier skips
it and continues. `seedAcrossGroups` drops `HEAD_TO_HEAD` from the list it applies. First
port every existing basis test through the mapping and see it pass unchanged; then add
tests for custom orders, head-to-head first/middle/last, a loop with deciders after it,
and each new decider. Callers pass `rankingRulesOf(division)` instead of
`division.ranking_basis`.

**Don't:** Change row shapes, pairing, or the final-rankings path beyond passing rules.

**Verify:** All ported tests pass with identical expected orders. New tests pass.
`npm test` and `npm run test:bugs` show no new failures.

### Step 4 — Save rules from Settings (API)

**Why:** The client needs a way to write the new shape.

**Files:** `divisions.service.js` (`updateDivisionSettings`), `divisions.repository.js`
(new `updateStateRankingRules`), `divisions.controller.js`, `divisionSettings.test.js`,
`divisions.route.test.js`, `integration/repositories/divisions.repository.test.js`,
`docs/api.md`.

**Do:** Add `updateStateRankingRules(divisionId, rules, client)` modelled on
`updateStateColor`: one `jsonb_set(state, '{rankingRules}', ...)` that stamps
`last_update`, so the view's ETag moves. Accept `rankingRules` in the settings body,
validated by `readRankingRules`; write it; return the effective rules. Keep the existing
permission and the "only keys present are touched" behaviour. Stop accepting
`rankingBasis` once the client in step 6 no longer sends it (same release); leave the
column and `updateRankingBasis` unused rather than deleting them in this work.

**Don't:** Add a separate endpoint. Rewrite the whole state to save rules.

**Verify:** Valid rules save and come back in the payload; invalid ones get a clear
error; a scorer or match manager is refused.

### Step 5 — Make the 3rd-place match optional

**Why:** Owner decision: on by default, removable.

**Files:** `divisions.service.js` (`readPlacementDepth`, `createClassicState`,
`replaceKnockoutRounds`), `fixtures.service.js` (line 462), `utils/scheduleValidator.js`,
`utils/tournamentViewFormatter.js` (415, 654–658), `placementMatches.test.js`,
`divisionStructure.test.js`, `knockout-walkovers.route.test.js` if affected.

**Do:** First, identify the 3rd-place group by content — the Finals group holding `[2,3]` —
instead of `index === 0`, everywhere listed. Then accept `placement_depth = 1` in
`readPlacementDepth` (same lock rules), and skip the `unshift([2,3])` when depth is 1.
Final rankings then rank 3rd and 4th by the tiebreak for the round they went out in, like
any unplayed place. Depth ≥ 5 is unchanged and always keeps the 3rd-place match.

**Don't:** Change depth ≥ 5 generation. Migrate existing rows.

**Verify:** Depth 1 produces a Finals round with only the final, labelled "Finals"; a
schedule that held a 3rd-place slot reports it as unscheduled-and-gone rather than
mislabelling the final; final rankings fill 3rd and 4th. Existing depths produce
byte-identical state to before.

### Step 6 — The Divisions settings section (client)

**Why:** The designed UI.

**Files:** `tourganiser-ui/src/components/tournament/SettingsTab.jsx`,
`tourganiser-ui/src/styles/tournament-view.css`, `requests.js` if the call shape changes,
`StandingsTab.jsx` (footnote and points column).

**Do:** Rename the band "Divisions" (it already is) and give it a division picker at the
top and "Copy to all divisions". Stack three panels, each a short heading and one-line
subtitle:
- **Ranking** — "How teams are ordered in pool and league tables." Points / Wins
  segmented control in the heading row. Points: four rows with −/+ steppers (44px), each
  with its best-of-3 / best-of-5 scorelines as hint text, and the preset chips. Wins: two
  radio options, match wins or set wins. No other control.
- **Tiebreak deciders** — "Applied in this order when teams are level on ranking."
  Numbered rows with drag handle (`pointer: fine` only), up/down buttons, remove; Seeding
  pinned last with a lock icon; "Add a decider" chips for the unused keys.
- **Placement matches** — "Which knockout places are decided by a match." Segmented
  1st / 3rd / 5th / 7th … (3rd marked Default), and the place ladder: played places
  filled, unplayed dashed "ranked by the tiebreak deciders", "9th+ ranked by pool results",
  "+N matches" on added rows. Hidden for League and for knockouts under 4 teams; disabled
  with the existing note once the knockout has started.
Keep save-on-change and the loader for depth changes. Standings: show a "Pts" column when
method is points, and a footnote naming the method and decider order.

**Don't:** Put panels side by side at any width. Add the pool draw panel (other handover).

**Verify:** In the browser at 375px and 1280px: each control saves, reloads with the saved
value, and a reorder of deciders changes a tied table accordingly. `npm run lint` clean.

## 7. Final validation

Run once, after step 6:

1. `api/`: `npm test` green at 100%; `npm run test:bugs` shows no new failures.
2. `tourganiser-ui/`: `npm run lint`, `npm test`, `npm run build`.
3. In a copy of a production tournament: every division's tables, qualifiers and final
   rankings are unchanged until a setting is touched.
4. Create a Classic division with "Final only": the knockout has no 3rd-place match end to
   end (schedule, scoresheets, bracket, final rankings).
5. Update `docs/known-limitations.md` and delete this file.
