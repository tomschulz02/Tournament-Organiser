# Handover — Schedule Maker: Courts And Officials

Written 2026-08-17. Rewritten 2026-08-17 to the handover format in `CLAUDE.md`, with the
codebase inspected and the facts recorded rather than left to be rediscovered.

Delete this file once the work is done. The durable record is `docs/schedule.md`,
`docs/decisions.md` and `docs/roadmap.md`.

---

## 1. Risk declaration

**Risk Level: Medium**, under `CLAUDE.md`'s table. This document is the explanation the
Medium Risk process requires; treat approval of the document as approval of the work it
describes.

What makes it Medium:

- **Step 2 changes the stored schedule contract.** A court gains a `divisions` key. The
  column is JSONB and no migration reaches it, so every schedule saved before this change
  must keep loading and keep meaning what it meant.
- **Steps 4 and 8 change the server validator.** `api/src/utils/scheduleValidator.js` is
  the only thing between the client and an arbitrary blob in `tournaments.schedule`, and
  everything downstream trusts what it accepts. A rule that is too strict strands an
  organiser mid-tournament with a schedule they cannot save.
- **Steps 3 and 7 change the generator**, which `docs/schedule.md` names as the single
  implementation of the generation objectives.
- **Step 8 widens `validateSchedule`'s inputs** — it needs team names, which the service
  does not currently load.

Steps 1, 5 and 6 are Low Risk on their own.

No schema change and no dependency change. `divisions.state` is not touched anywhere.

---

## 2. How to use this document

- **One step per session.** Each step is independently shippable and ends with the
  application working.
- **Do not re-inspect anything section 3 states.** It was verified against the code on
  2026-08-17.
- **Read only the files a step names.**
- **Run the final validation once, at the end.** Each step's own **Verify** is its
  contract.
- **Take the steps in order.** Step 1 makes step 5 usable; step 2 is the contract steps 3,
  4 and 5 all depend on; step 6 is a prerequisite for step 7 being meaningful.

---

## 3. Established facts

Verified 2026-08-17 by reading the files named. Do not re-derive any of it.

### The schedule object as it exists today

A court is exactly `{ id, name }`. Three functions build or copy the court list, and **all
three drop any other key**:

| Function | Location | What it does with a court |
|---|---|---|
| `buildCourtList(count, existingCourts)` | `tourganiser-ui/src/utils/scheduleUtils.js:185-193` | Builds `count` courts, reusing `existingCourts[index]`'s `id` and `name`. **Reuses by index.** |
| `normaliseSchedule(raw, { startDate, endDate })` | same file, `:209-251`; courts at `:223-228` | Maps each court to `{ id: court.id \|\| \`court-${index+1}\`, name: court.name \|\| \`Court ${index+1}\` }` |
| `serialiseScheduleForSave(schedule)` | same file, `:462-492`; courts at `:470-473` | Maps each court to `{ id, name }` |

An entry is `{ id, type, day, courtId, startTime, endTime, fixtureId, title, officials, notes }`
— `normaliseSchedule:232-243` and `serialiseScheduleForSave:474-485`. `officials` is a
free-text string, defaulting to `''`.

`docs/schedule.md` documents this: the `courts` row at line 25, the Court object table at
lines 48-57, `courtId` at line 66, `officials` at line 71, the validator's rule table at
line 188, the "never inspected" list at line 194, and a worked example at lines 204-250.
Line 55-57 already records the index-reuse consequence.

### Courts in the schedule maker

`tourganiser-ui/src/components/ScheduleMakerModal.jsx` (1665 lines). Everything below is in
that file.

| Fact | Line |
|---|---|
| `ScheduleOverviewPanel({ stats, schedule, courtDraft, onCourtDraftChange, onAddCourt, canEdit })` | 1292 |
| The court list is rendered as a bare `<div>{court.name}</div>` per court — **no controls at all** | 1324-1330 |
| The add form, and the only `canEdit` gate in the panel | 1331-1343 |
| `handleAddCourt` dispatches `setCourts` with the existing array plus one new court | 434-454 |
| The new court's id is `` `court-${schedule.courts.length + 1}` `` | 446 |
| `scheduleReducer`'s `setCourts` action replaces `state.courts` outright | 49-53 |
| Grid court headers are plain `<div className="schedule-grid-header-court">` — **not buttons, no click handler** | 1159-1163 |
| The grid's empty state, shown when `schedule.courts.length === 0` | 1137-1144 |
| `markDirty()` is what enables Save; every mutating handler calls it | see `handleAddCourt:452` |

**The court id scheme is already unsafe.** `handleAddCourt` derives the id from the
current length, so removing `court-2` from three courts and then adding one produces a
second `court-3`. Step 1 has to fix this as part of adding removal.

### What already handles an orphaned court reference

An entry whose court is gone is **not** a broken state and needs no new rule.

| Fact | Line |
|---|---|
| `locateEntry(entry, axis, courts)` sets `reason: 'court'` when `courts.findIndex(...)` returns `-1`, and `placeable: false` | 1073-1085 |
| `UNPLACEABLE_REASONS.court` is `'On a court the schedule no longer has'` | 1087-1090 |
| Unplaceable entries render beneath the grid under **"Not shown on the grid"**, each openable | 1233-1256 |

So removing an occupied court is survivable today: the entries surface, the organiser
re-places them.

### The generator

`tourganiser-ui/src/utils/scheduleGenerator.js` (518 lines).

| Fact | Line |
|---|---|
| `findSlotFailure(slot, fixture, state, { durationMinutes, barrier, teams })` — the hard constraints, returning the name of the first one failed or `null` | 274-295 |
| Its four reasons, in check order: `'court'`, `'team'`, `'round'`, `'rest'` | 275-292 |
| The order is load-bearing: each check assumes the ones before it passed, so a reported reason is the *sole* reason | its comment, 266-273 |
| `compareSlots(left, right, fixture, state)` — the lexicographic preference chain, ending on `courtIndex` so it is total | 345-361 |
| `FAILURE_PRIORITY = ['rest', 'round', 'team', 'court']` — which reason to name when several applied | 368 |
| `FAILURE_REASONS` — one display string per reason | 370-375 |
| `describeFailure` / `buildWarnings` turn those into the organiser-facing warning list | 380-395 |
| `generateAutomaticSchedule({ baseSchedule, fixtures, divisions, startDate, endDate, courtCount, dailyStartTime, dailyEndTime, fixtureDurationMinutes })` | 399-409 |
| It calls `buildCourtList(Number(courtCount), normalised.courts)` — so **whatever `buildCourtList` drops is lost on every generation** | 422 |
| The main loop compares **every** feasible slot; there is deliberately no early exit | 475-485 |
| `createFixtureEntry` already accepts an `officials` argument, defaulting to `''` | `scheduleUtils.js:263-284` |

**Generation currently discards every officials value the organiser typed.** The new
entries array is seeded from `preservedBreaks` alone (lines 421 and 426) and every fixture
entry is rebuilt by `createFixtureEntry` (493-501) without an `officials` argument. This is
not a small point: it means "the toggle off leaves officials as they were" is *false
today*, and step 6 exists to make it true.

### The server validator

`api/src/utils/scheduleValidator.js` (320 lines).

| Fact | Line |
|---|---|
| `validateSchedule(schedule, { startDate, endDate, divisions = [], fixtures = [] })` | 33 |
| It runs six checks: `checkEntryShapes`, `checkDaysInRange`, `checkFixtureReferences`, `checkCourtClashes`, `checkTeamClashes`, `checkRoundOrder` | 43-51 |
| **`schedule.courts` is never inspected at all** — no shape check, no reference check | whole file |
| `checkEntryShapes` allows `courtId` to be `null`, `undefined` or any string. It does **not** require the court to exist. | 82-84 |
| Every rejection throws `new AppError(CODE, { details: { entryId } })` or `{ entryIds: [a, b] }` | 75-97, 133-143, 162, 176, 250 |
| `teamsOf(fixture)` reads `fixture.team_1` and `fixture.team_2` — the raw id columns | 300-302 |
| `buildRoundOrder(divisions)` parses `division.state` defensively, tolerating a string or null | 270-290 |
| The caller loads only divisions and fixtures — **no teams, no team names** | `api/src/services/tournaments.service.js:172-175` |
| The lock is taken **before** the read, so a division rebuild and a schedule save cannot each lose | `tournaments.service.js:166-188` and its comment |

Fixture rows reaching the validator are raw table rows: `id`, `division_id`, `match_no`,
`team_1`, `team_2`, `team_1_placeholder`, `team_2_placeholder`, `round`, `status`,
`team_1_result`, `team_2_result` (`api/src/repositories/fixtures.repository.js:38`).

Error codes for the schedule are grouped in `api/src/errors.js:91-98`. The comment above
them states the rule the two new codes must follow: **one code per rule**, message
display-ready, `details` carrying the offending entry ids.

### The inspector

The right-hand panel renders exactly one of five things, chosen by `panelMode`:

The chain is a nested ternary inside `<aside className="schedule-maker-inspector">` at
line 1011:

| `panelMode` | Panel | Line |
|---|---|---|
| `'entry'` (and `selectedEntry` and `entryForm`) | `EntryEditorPanel` | 1012-1020 |
| `'generate'` | `GeneratorPanel` | 1021-1022 |
| `'break'` (and `breakDraft`) | `BreakPanel` | 1023-1024 |
| `'slot'` (and `slotDraft`) | `SlotAssignmentPanel` | 1025-1032 |
| anything else | `ScheduleOverviewPanel` | 1033-1040 |

`handleOpenSlotPicker(day, courtId, startTime)` at 553-577 is the model for a new
"configuring something" mode: it builds a draft with `createSlotDraft` (150-158), clears
the selected entry, sets the draft state, sets `panelMode`, and sets
`setMobilePanel('inspector')` — **that last call is required**, or the organiser taps on a
phone and nothing appears to happen.

`GeneratorPanel({ draft, onChange, onGenerate })` at 1434; its draft is `generatorDraft`
(204-209), holding `courtCount`, `dailyStartTime`, `dailyEndTime`,
`fixtureDurationMinutes`. `EntryEditorPanel`'s free-text Officials input is at 1538-1548.

### Team names are unique within a division

`validateTeamNames` in `api/src/services/divisions.service.js:300-316` rejects a duplicate
with `DUPLICATE_TEAM`, comparing trimmed and lower-cased. It is the single place a
submitted team list is checked, so creation and editing cannot disagree.

This is what would let an officials *name* be resolved back to exactly one team — but only
while officials never cross a division. See Decisions 6.

### Build and test baseline

| Fact | Value |
|---|---|
| Generator and utils tests | `tourganiser-ui/test/scheduleGenerator.test.js`, `tourganiser-ui/test/scheduleUtils.test.js` |
| Validator tests | `api/test/unit/utils/scheduleValidator.test.js` |
| `api/` | `npm test` → `vitest run --coverage`, gated at 100%. No lint script exists. |
| `tourganiser-ui/` | `npm test` → `vitest run --coverage`. **`CLAUDE.md` says no UI test suite exists; that is stale.** |
| `tourganiser-ui/` lint baseline | `npm run lint` → **5 errors, 2 warnings**. Do not add a sixth error. |

### What the data cannot support

| Asked for | Reality |
|---|---|
| "Toggle officials off and generation leaves them exactly as they were" | False today — generation rebuilds every fixture entry and drops `officials`. Step 6 is the fix; without it the toggle has no honest off state. |
| Restricting a court and having old saved schedules honour it | An old schedule has no `divisions` key on any court. It loads as unrestricted, which is the correct and only possible reading. |
| Validating that an officials string names a real team, in the validator as it stands | `validateSchedule` receives divisions and fixtures. It has **no team names**. Step 8 threads them in; nothing before step 8 can check an officials string server-side. |
| Rest between a knockout match and the pool matches feeding it | Unbound teams constrain nothing at generation time. Recorded in `docs/known-limitations.md` under Scheduling. Out of scope. |
| A count of how many entries sit on a court, from the overview panel | Derivable in the panel from `schedule.entries` — it already receives the whole `schedule`. No new prop needed. |

---

## 4. Decisions already made

Settled 2026-08-17 and recorded in `docs/roadmap.md` under "Improvements raised
2026-08-17". Do not revisit these.

1. **Removing an occupied court is allowed, with a confirmation.** The handling already
   exists — the entries surface under "Not shown on the grid" — and refusing would be the
   more annoying behaviour.
2. **Removing the last court is allowed.** An empty court list is explicitly legal in
   `docs/schedule.md`, and the grid already renders its own empty state for it.
3. **An absent or empty `divisions` array on a court means unrestricted.** That is today's
   behaviour and stays the default. Only a non-empty array restricts.
4. **A court restriction is a hard constraint, not a preference.** It goes in
   `findSlotFailure`, never in `compareSlots`. A preference that can be outbid is not what
   a net height is.
5. **The validator enforces the restriction too.** Without it a hand-placed fixture
   bypasses the constraint entirely and the generator's work is decorative.
6. **Officials rules.** One team per match.
   - **Hard, expressed as feasibility:** a team never officiates a match overlapping one it
     is playing, on any court; a team never officiates outside its own division.
   - **Preferred, scored and yielded when capacity is short:** a team should not officiate
     immediately before its own match; a team should officiate within its own pool where
     possible, across pools within the division otherwise.
7. **`entry.officials` stays free text.** A name is sufficient *only because* officials
   never cross a division and team names are unique within one. This is load-bearing and
   must be written down beside the field in `docs/schedule.md`: if either rule relaxes, the
   field needs a team id and the validator stops working before anyone notices.
8. **Officials are assigned as a pass over the placed schedule, not during placement.**
   Letting them influence which slot a fixture takes would trade a better schedule for an
   easier assignment, and would put a second statement of the priority order next to
   `compareSlots`.
9. **A match with no eligible officiating team gets none.** That is a real outcome on a
   small division. Leave the field empty and count it in the warnings, the way unplaced
   fixtures are already reported.
10. **An officials string that resolves to no team is not an error.** Organisers write
    "Club referee" or a person's name. Only a string that resolves to a team *and* whose
    team is playing at that time is rejected.

---

## 5. Non-goals

Do not touch these.

- **`divisions.state`, the schema, and any migration.** Everything here lives in
  `tournaments.schedule`, which is JSONB.
- **`compareSlots` and the preference chain.** Steps 3 and 7 add nothing to it.
- **Backtracking in the generator.** Settled in the 2026-08-13 rewrite and recorded in
  `docs/known-limitations.md`: surface the failure with the constraint that caused it
  rather than solving it.
- **The client's `validateScheduleEntry`.** It checks one entry against what the browser
  holds; the server's validator checks the whole schedule against what the server can see.
  They deliberately share no code — see the comment at `scheduleValidator.js:17-21`.
- **`getEntrySlotSpan` and `buildTimeSlots`**, which are dead but tested. Deleting code is
  High Risk under `CLAUDE.md`.
- **The print and export layouts** (`ScheduleExportPages` and below, line 1566 onwards),
  unless a step names them.
- **Any other drift** you notice. Fix drift only when working on the feature that touches
  it.

---

## 6. Steps

### Step 1 — Courts can be removed from the overview

**Why.** The only way to remove a court today is to lower the count in the generation
settings, which regenerates the whole list positionally and shifts every id after the gap.

**Files.** `tourganiser-ui/src/components/ScheduleMakerModal.jsx`.

**Do.**

**Give each court a remove control** in `ScheduleOverviewPanel`'s list (line 1326), shown
only when `canEdit`. The panel already receives the whole `schedule`, so it can count that
court's entries itself: `schedule.entries.filter((entry) => entry.courtId === court.id)`.

**Add `handleRemoveCourt(courtId)`** to the modal, beside `handleAddCourt` at line 434, and
pass it down as `onRemoveCourt`. It dispatches `setCourts` with
`schedule.courts.filter((court) => court.id !== courtId)`, then `markDirty()` and a
success message — the same three closing lines `handleAddCourt` has.

**Remove from the array; never regenerate the list.** `buildCourtList` reuses by *index*,
so rebuilding after a removal renames every court after the gap and orphans every entry
beyond it. **This is the one thing here that can go quietly wrong.**

**Confirm only when the court holds entries**, through `useConfirm` (already in scope at
line 168), naming what happens rather than warning that something is wrong — because it is
not:

> Remove Court 3? Its 6 scheduled fixtures will be unplaced and listed below the grid.

An empty court needs no confirmation.

**Fix the id scheme while you are here.** `handleAddCourt:446` derives the id from
`schedule.courts.length + 1`, so removing a middle court and adding one produces a
duplicate id. Derive the next id from the ids in use — e.g. the highest trailing number
already present, plus one — or generate one with `createScheduleId('court')` from
`scheduleUtils.js:6`. Say in a comment why the length is not usable.

**Don't.**

- Do not refuse to remove an occupied court. Decision 1.
- Do not refuse to remove the last court. Decision 2.
- Do not reassign or null the `courtId` of the affected entries. `locateEntry` already
  surfaces them and the organiser re-places them.
- Do not touch `buildCourtList`.

**Verify.**

- Removing an empty court: it disappears from the overview, the grid header, and the count
  shown in `stats`.
- Removing a court holding fixtures: the confirmation names the correct count, the entries
  appear under "Not shown on the grid", and **every other court's entries stay exactly
  where they were**.
- Remove the middle of three courts and confirm the remaining two keep their own entries —
  this is the id-stability check, and it is the one that fails if the list is regenerated.
- Remove the middle of three, then add a court: the new court has an id no other court has.
- Remove every court: the grid shows "Add courts or fields to begin" rather than breaking.
- A viewer (`canEdit` false) sees no remove control.
- `npm run lint` in `tourganiser-ui/` still reports 5 errors.

---

### Step 2 — A court can carry a division restriction

**Why.** Steps 3, 4 and 5 all need somewhere to store the restriction, and it has to
survive a save and a reload.

**Files.** `tourganiser-ui/src/utils/scheduleUtils.js`, `docs/schedule.md`,
`tourganiser-ui/test/scheduleUtils.test.js`.

**Do.**

A court becomes `{ id, name, divisions }`, where `divisions` is an array of division ids.
**Absent or empty means unrestricted.**

Update all three places that copy a court, and only the court key in each:

| Function | Line | Change |
|---|---|---|
| `buildCourtList` | `:185-193` | Carry `existing?.divisions` through alongside the name, defaulting to `[]` |
| `normaliseSchedule` | `:223-228` | `divisions: Array.isArray(court.divisions) ? court.divisions : []` |
| `serialiseScheduleForSave` | `:470-473` | Include `divisions` |

Normalising to `[]` rather than leaving it undefined is what makes every consumer able to
read `court.divisions.length` without a guard, and what makes an old saved schedule load as
unrestricted.

Update `docs/schedule.md`'s Court object table (lines 48-57) with the new key: its type,
that it is optional, and — stated plainly — that absent or empty means the court takes any
division. Add it to the worked example at lines 204-250 so the example is still complete.

**Don't.**

- Do not validate the ids here. Whether a division id is real is the server's question, and
  step 4 answers it.
- Do not change the entry shape, the settings shape, or `days`.
- Do not add a UI yet. Step 5 does that.

**Verify.**

- `npm test` in `tourganiser-ui/` passes, with new cases in `scheduleUtils.test.js` for:
  a saved court with `divisions` round-tripping through normalise → serialise unchanged;
  a saved court *without* `divisions` normalising to `[]`; and `buildCourtList` preserving
  `divisions` when it reuses an existing court by index.
- Load a schedule saved before this change: every court is unrestricted and nothing else
  moves.
- `docs/schedule.md`'s Court table and its worked example agree with the code.

---

### Step 3 — The generator honours the restriction

**Why.** A court set to one net height should not have to be changed between matches.

**Files.** `tourganiser-ui/src/utils/scheduleGenerator.js`,
`tourganiser-ui/test/scheduleGenerator.test.js`, `docs/schedule.md`.

**Do.**

Add the restriction to **`findSlotFailure`** (line 274) as a hard constraint, with its own
failure reason — call it `'division'`. A slot on a court whose `divisions` array is
non-empty is not a candidate for a fixture whose `division_id` is absent from that list.

`findSlotFailure` currently receives `slot`, `fixture`, `state` and a context object of
`{ durationMinutes, barrier, teams }`. The slot carries `courtId` and `courtIndex` but not
the court itself (`buildCandidateSlots:66-90`), so either attach the court's `divisions` to
each slot as it is built, or pass a `courtId → divisions` map through the context. Attaching
it at slot-build time is cheaper — the list is built once and scanned per fixture.

**Place the check where its position tells the truth.** The order in `findSlotFailure` is
load-bearing: each check assumes the ones before it passed, which is what makes a reported
reason the *sole* reason. Put `'division'` first, before the `usedSlots` check — a court
closed to this division is closed whether or not anything is on it, and reporting "every
court is booked" for a court that was never open would send the organiser to the wrong fix.

Add `'division'` to **`FAILURE_PRIORITY`** (line 368) at the front, ahead of `'rest'`: it
is the most specific and most actionable answer. Add a **`FAILURE_REASONS`** entry (line
370) saying that no court is open to the fixture's division, and naming the fix — open a
court to that division, or add one.

Record the constraint in `docs/schedule.md`'s hard-constraints list, beside court
exclusivity at line 120.

**Don't.**

- **Do not put this in `compareSlots`.** Decision 4.
- Do not skip the restriction when a fixture has no `division_id`. Treat a fixture with no
  division as belonging to no division, so a restricted court refuses it — the same way a
  restricted court refuses any division not named.
- Do not add a fallback that relaxes the constraint when nothing would otherwise be
  placeable. Leaving the fixture unplaced with an honest warning is the design.

**Verify.**

- `npm test` in `tourganiser-ui/` passes, with new `scheduleGenerator.test.js` cases:
  - restricting one court to one division places no other division's fixtures on it, and
    the other courts still take anything;
  - restricting **every** court to division A, in a two-division tournament, returns
    division B's fixtures unplaced with a warning naming the division constraint — **not**
    "every court is booked";
  - a court with `divisions: []` behaves exactly as it does today;
  - a schedule with no `divisions` key anywhere produces byte-identical output to before.
- The last of those is the regression guard for every existing tournament.

---

### Step 4 — The validator enforces the restriction

**Why.** Without this, a fixture dragged by hand onto a restricted court saves cleanly and
the generator's work is decorative.

**Files.** `api/src/utils/scheduleValidator.js`, `api/src/errors.js`,
`api/test/unit/utils/scheduleValidator.test.js`, `docs/schedule.md`.

**Do.**

**The code.** Add one to `errors.js` in the schedule block (lines 91-98), following the
group's comment — one code per rule, message display-ready:

```js
SCHEDULE_COURT_DIVISION: [409, "A match is scheduled on a court reserved for other divisions"],
```

409 rather than 400, matching `SCHEDULE_COURT_CLASH` and `SCHEDULE_TEAM_CLASH`: this is a
conflict with the schedule's own configuration, not a malformed request.

**The check.** Add `checkCourtDivisions(placements, fixturesById, schedule.courts)` to the
list in `validateSchedule` (lines 43-51), after `checkCourtClashes`. For each placement,
resolve its `courtId` to a court, and if that court's `divisions` is a non-empty array and
the fixture's `division_id` is not in it, throw with `details: { entryId: entry.id }` —
the shape every other check in the file uses.

`checkFixtureReferences` has already proved every placement's fixture exists and returns
the placements in order, so `fixturesById.get(entry.fixtureId)` is safe.

**Be lenient about structure, strict about the rule.** A court whose `divisions` is
missing, `null`, not an array, or empty is unrestricted. An entry naming a `courtId` that
no court has is **not** an error here — the client already surfaces it under "Not shown on
the grid", and `checkEntryShapes` deliberately does not require the court to exist.

Add the rule to `docs/schedule.md`'s validator table at line 188.

**Don't.**

- Do not start validating the shape of `schedule.courts` generally. That is a wider change
  than this step, and the file has deliberately never inspected it.
- Do not reject a break (`fixtureId` null) on a restricted court. A break belongs to
  nobody's division.
- Do not import anything from the client. The two validators share no code by design.

**Verify.**

- `npm test` in `api/` is green at 100%, with new `scheduleValidator.test.js` cases:
  a fixture on a court restricted to its own division saves; a fixture on a court
  restricted to another division is rejected with `SCHEDULE_COURT_DIVISION` and the
  offending `entryId` in `details`; a court with `divisions: []`, missing, or `null`
  restricts nothing; a break on a restricted court saves; an entry naming an unknown
  `courtId` still saves.
- Manually: drag a fixture onto a court restricted to another division and confirm the
  save is refused with the message on screen.

---

### Step 5 — Setting a court's divisions

**Why.** Steps 2–4 have no way in.

**Files.** `tourganiser-ui/src/components/ScheduleMakerModal.jsx`.

**Do.**

**The interaction.** Clicking a court header in the grid opens a division picker in the
inspector — the same shape as clicking an empty slot, which opens a draft there. Reuse that
pattern rather than introducing a second kind of popup:

- make the court header at line 1160 a `<button>` when `canEdit`, keeping the same class
  so the grid template is untouched;
- add a `courtConfigId` state and a `panelMode` of `'court'`, following
  `handleOpenSlotPicker` (553-577) exactly: clear `selectedEntryId`, set the state, set
  `panelMode`, and **set `setMobilePanel('inspector')`** — without that last call the
  organiser taps on a phone and nothing appears to happen;
- add the branch to the inspector's chain (1011-1040), before the `ScheduleOverviewPanel`
  fallback.

**The panel.** Multi-select over every division in the tournament. The modal already
receives `divisions` as a prop (line 162). Saving dispatches `setCourts` with the court's
`divisions` replaced, then `markDirty()`.

**Say what empty means.** An empty selection reading as "no divisions allowed" is the
natural misreading. State in the panel that selecting nothing means the court takes any
division.

**Show the restriction on the header**, so it is visible without opening anything. The
division colours used elsewhere in the tournament view exist for this; if reusing them here
is awkward, a small text label is enough.

**Don't.**

- Do not add a modal, popover or dropdown overlay. The inspector is where drafts live in
  this component.
- Do not offer the picker when `canEdit` is false.
- Do not write the restriction anywhere but `schedule.courts`.

**Verify.**

- Clicking a court header opens the picker; on a narrow window the inspector comes into
  view with it.
- Selecting divisions, saving the schedule, closing and reopening the modal: the
  restrictions are still there.
- An unrestricted court's header shows no label; a restricted one shows which divisions.
- A viewer cannot open the picker.
- Generating after restricting behaves as step 3's tests describe.
- `npm run lint` in `tourganiser-ui/` still reports 5 errors.

---

### Step 6 — Generation stops discarding officials

**Why.** This is a prerequisite for step 7, and it is a bug in its own right.
`generateAutomaticSchedule` seeds its entries array from breaks alone (lines 421, 426) and
rebuilds every fixture entry with `createFixtureEntry` (493-501), which defaults
`officials` to `''`. **Every officials value an organiser has typed is destroyed on every
regeneration, today.** Without fixing it, the officials toggle has no honest off state.

**Files.** `tourganiser-ui/src/utils/scheduleGenerator.js`,
`tourganiser-ui/test/scheduleGenerator.test.js`, `docs/known-limitations.md`.

**Do.**

Before the placement loop, build a map from `fixtureId` to the `officials` string on the
existing entry for that fixture, from `normalised.entries`. When creating each fixture
entry, pass the preserved value through `createFixtureEntry`'s `officials` argument, which
already exists.

Carry `notes` through the same way if the same map makes it free — but only if it is free.
Do not widen the step.

Add a note to `docs/known-limitations.md` under Scheduling recording that officials
survived nothing before this, or remove the existing officials bullet there if step 7
closes it. Decide when you get to step 7; for now, record the fix.

**Don't.**

- Do not preserve a placement. The generator reassigns every slot by design; only the
  fixture-scoped text carries over.
- Do not preserve officials for a fixture that ends up unplaced — there is no entry to
  carry it on, and that is correct.

**Verify.**

- `npm test` in `tourganiser-ui/` passes, with a new case: a schedule with officials filled
  in on several fixtures, regenerated, still has those officials on the same fixtures —
  even where the fixture moved court or time.
- A fixture that regeneration leaves unplaced simply has no entry.

---

### Step 7 — Officials are assigned automatically

**Why.** `docs/tournament-rules.md` describes officials assignment as optional and nothing
implements it — recorded in `docs/known-limitations.md` under Scheduling.

**Files.** `tourganiser-ui/src/utils/scheduleGenerator.js`,
`tourganiser-ui/src/components/ScheduleMakerModal.jsx`,
`tourganiser-ui/test/scheduleGenerator.test.js`, `docs/schedule.md`,
`docs/known-limitations.md`.

**Do.**

**The toggle.** Add one to `GeneratorPanel` (line 1434) and to `generatorDraft` (204-209),
defaulting **off**. Off is step 6's behaviour: officials are preserved and nothing is
assigned. Thread it into `generateAutomaticSchedule`'s argument object.

**The pass.** Run assignment **after** the placement loop, over the placed schedule
(Decision 8) — a separate function in the same file, called once, taking the placed entries
and the fixtures.

Walk the entries in schedule order, earliest first. For each fixture entry, the candidate
officiating teams are every team of that fixture's division. Filter by the two hard rules:

- the team is not playing in any match overlapping this entry's time, on any court;
- the team belongs to the fixture's own division. (This is what makes a bare name
  resolvable later — Decision 7.)

Then order the survivors by the preferences, and take the first:

1. prefer a team not playing in the immediately following slot;
2. prefer a team in the same pool as the fixture;
3. prefer a team that has officiated fewer times so far, so one team does not take every
   match its pool plays.

Preferences are applied only after the hard filter, and any of them may yield.

A match with no candidate gets an empty `officials` and is **counted in the warnings**,
alongside the unplaced-fixture warnings that `buildWarnings` already produces.

**The names.** The division's teams are reachable from the `divisions` argument
`generateAutomaticSchedule` already takes; `division.teams` carries `{ id, name }` in
`state.teams` order (`api/src/utils/tournamentViewFormatter.js:96-100`). Write the name.

**Write the rule down.** Add to `docs/schedule.md`, beside the `officials` field at line 71,
the two facts that make a bare name sufficient: the official is always from the fixture's
own division, and team names are unique within a division
(`validateTeamNames`, `divisions.service.js:300-316`). Say explicitly that if either
relaxes, the field needs a team id.

**Don't.**

- **Do not let officials influence slot choice.** Decision 8. `compareSlots` and
  `findSlotFailure` are not touched by this step.
- Do not invent an official when there is no eligible team. Decision 9.
- Do not change `entry.officials` to an object or an id. Decision 7.
- Do not assign an official to a break.
- Do not overwrite an organiser's typed officials when the toggle is **off**.

**Verify.**

- Toggle off: generating leaves every officials field exactly as it was. (This is what
  step 6 bought.)
- Toggle on, one division, six teams, two courts: every match that can have an official has
  one, and **no team ever officiates while it is playing**.
- No official is ever from another division — check a two-division tournament specifically.
- Officials are spread across the division rather than concentrated on one team.
- A match with no eligible team is left blank and counted in the warnings.
- `npm test` in `tourganiser-ui/` passes with cases for each of the above.

---

### Step 8 — The validator enforces the officials overlap rule

**Why.** The overlap rule is a hard constraint, so a hand-typed official must not be able to
break the rule the generator was careful to keep.

**Files.** `api/src/services/tournaments.service.js`, `api/src/utils/scheduleValidator.js`,
`api/src/errors.js`, `api/test/unit/utils/scheduleValidator.test.js`,
`api/test/unit/services/tournaments.service.test.js`, `docs/schedule.md`.

**Do.**

**Thread the teams in.** `validateSchedule` receives `divisions` and `fixtures` and has no
team names at all. `updateSchedule` (`tournaments.service.js:166-188`) loads divisions then
fixtures inside the transaction; add a third load of the teams, using
`divisionsRepository.getTeamsByIds(...)` over the ids in each division's `state.teams` —
the same resolution `getTeamsByDivision` (`tournaments.service.js:255-266`) already
performs. Pass them to `validateSchedule` as a fourth key.

Keep the load **inside** the transaction and **after** `getScheduleForUpdate`. The lock
ordering comment at lines 156-165 explains why the lock is taken before any read; adding a
read before it would reopen the window it closes.

**The code.**

```js
SCHEDULE_OFFICIAL_PLAYING: [409, "A team is officiating a match it is playing in"],
```

**The check.** Add `checkOfficials(placements, fixturesById, teamsByDivisionId)` to the
chain in `validateSchedule`. For each placement with a non-empty `officials` string:

1. resolve the string against the teams of **that fixture's division only**, trimmed and
   case-insensitive — the same comparison `validateTeamNames` uses;
2. if it resolves to no team, **accept it** (Decision 10);
3. if it resolves to a team, reject when that team is `team_1` or `team_2` of any placement
   overlapping this one. `overlappingPairs` (line 184) already yields exactly those pairs;
   `teamsOf` (line 300) reads the raw id columns.

Throw with `details: { entryId }`.

Add the rule to `docs/schedule.md`'s validator table at line 188, and update the "never
inspected" list at line 194 — `officials` is now inspected.

**Don't.**

- **Do not reject a string that resolves to no team.** This is the check most likely to be
  got wrong, and getting it wrong quietly breaks the field for every organiser who types a
  person's name. Decision 10.
- Do not resolve across divisions. Two divisions may each have a "Team 3", and that is
  fine precisely because an official never crosses a division.
- Do not validate the *preferences* — pool affinity and back-to-back are the generator's
  and the organiser's judgement, not the validator's. `scheduleValidator.js:12-15` states
  that rule.
- Do not check officials on a break.

**Verify.**

- `npm test` in `api/` is green at 100%, with cases: an officials string naming a team
  playing at that time is rejected with `SCHEDULE_OFFICIAL_PLAYING`; the same team
  officiating a non-overlapping match saves; `"Club referee"` saves; a name matching a team
  in a *different* division saves; an empty string saves; case and surrounding whitespace
  do not change the answer.
- A `tournaments.service.test.js` case asserts the teams are loaded and passed through.
- Manually: type a team's name into the Officials field of a match that team is playing in
  and confirm the save is refused. Type `"Club referee"` into the same field and confirm it
  saves.

---

## 7. Final validation

Run once, after step 8.

1. `npm test` in `api/` — green at 100%, with both new validator rules covered.
2. `npm test` in `tourganiser-ui/` — the generator suite covers the pure modules; the court
   restriction as a hard constraint and each officials rule have cases.
3. `npm run lint` and `npm run build` in `tourganiser-ui/`. Lint must still report
   **5 errors, 2 warnings**.
4. End to end, on a two-division tournament with three courts: restrict one court to one
   division, enable officials, generate, save, close the modal, reload the page, reopen —
   and confirm the restrictions **and** the officials both survived.
5. Load a tournament whose schedule was saved before any of this work: every court is
   unrestricted, every entry is where it was, and the schedule saves again unchanged.
6. `docs/schedule.md` is correct: the Court object table carries `divisions`, the worked
   example includes it, the officials field carries the note explaining why a name is
   sufficient, the hard-constraint list includes the court restriction, and the validator
   table lists both new rules.
7. Remove or amend the officials bullet in `docs/known-limitations.md` under Scheduling —
   it says nothing assigns or validates the field, and after step 8 both are false.
8. Mark the three Schedule maker items done in `docs/roadmap.md` under "Improvements raised
   2026-08-17".
9. Delete this file.

**Two checks matter more than the rest.**

The first is step 8's third bullet: that a **non-team** officials string still saves. It is
easy to write a validator that rejects anything it cannot resolve, and that would quietly
break the field for every organiser who types a person's name.

The second is step 1's middle-court removal. Court ids are positional everywhere they are
generated, and an id that shifts orphans every entry beyond it without erroring.
