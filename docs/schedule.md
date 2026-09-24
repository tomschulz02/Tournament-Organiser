# Schedule

A schedule is stored as JSONB in `tournaments.schedule`.

This document is the source of truth for the shape of that JSONB. Where code disagrees
with it, the code is wrong.

It is a contract in both directions: it is what
`PUT /api/tournaments/:tournamentId/schedule` accepts, and it is what the client may
assume when reading `tournaments.schedule` back. `tourganiser-ui/src/utils/scheduleUtils.js`
implements the client half — `normaliseSchedule` on the way in and
`serialiseScheduleForSave` on the way out.

A schedule is **tournament-wide, not per-division**. Divisions share the same physical
courts, so scheduling them independently could double-book one. It moved from
`divisions.schedule` to `tournaments.schedule` on 2026-08-08; see `docs/division-state.md`,
which records that nothing reads or writes a schedule out of division state.

## Top level

| Key | Type | Required | Description |
|---|---|---|---|
| `version` | integer | yes | Payload version. `1` is the only version that has existed. `SCHEDULE_VERSION` in `scheduleUtils.js`. |
| `days` | array of day objects | yes | One per calendar day of the tournament, ascending. Derived, not authored — see below. |
| `courts` | array of court objects | yes | The playing surfaces available. May be empty; an empty court list means nothing can be placed. A court may be restricted to a set of divisions. |
| `entries` | array of entry objects | yes | The placements, in a defined order — see Entry below. May be empty; a schedule that places nothing is valid. |
| `settings` | settings object | yes | The grid the client draws. Presentation only. |
| `print` | print object \| `null` | no | Where the organiser has chosen the page breaks of the printed schedule. Presentation only. Absent or `null` means no saved layout — every consumer computes the smart default instead. |

`null` is a legal value for the whole column and means "no schedule yet". The client
turns it into an empty schedule on read.

### Day

| Key | Type | Description |
|---|---|---|
| `id` | string | `day_<random>`. Stable across saves for a date that survives. |
| `date` | string | `YYYY-MM-DD`. |
| `label` | string | Display name. `Day 1`, `Day 2`… unless the organiser renamed it. |
| `enabled` | boolean | Optional. **Absent or `true` means the day is active for scheduling** — only an explicit `false` excludes it. The generator places nothing on a disabled day and hand-placement onto one is blocked client-side; the day stays in `days` rather than disappearing, so re-enabling it is a toggle. Not enforced server-side — see Generation objectives. |

**`days` is regenerated from the tournament's `start_date` and `end_date` on every read.**
`normaliseTournamentDays` walks the date range and keeps the stored `id` and `label` for
any date that is still in range. A stored day outside the range therefore disappears —
and any entry on it becomes invisible in the client while remaining in the column.

A consumer may assume `days` covers exactly the tournament's date range. It may not
assume a stored `days` array was the one it last wrote.

### Court

| Key | Type | Description |
|---|---|---|
| `id` | string | `court-1`, `court-2`… by generation, but treated as an opaque string. |
| `name` | string | Display name, `Court 1` by default. |
| `divisions` | array of division ids | Optional. The divisions this court is reserved for. **Absent or empty means the court takes any division** — only a non-empty array restricts it. A fixture whose `division_id` is not in the array cannot be placed here, and the server rejects a hand-placed one. |

Courts are positional: `buildCourtList` regenerates the list from a count and reuses the
existing entry at each index. Reducing the court count therefore drops courts from the
end, and any entry pointing at a dropped court keeps a `courtId` that no longer resolves.
A court can also be removed from the overview panel directly, which never regenerates the
list — the removed court's own entries are dropped, so the fixtures among them return to
the unscheduled list rather than being orphaned.

An old saved schedule has no `divisions` key on any court; it loads as unrestricted, which
is the correct and only possible reading.

### Entry

| Key | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | `entry_<random>`. Unique within the schedule. |
| `type` | `'fixture'` \| `'break'` | yes | Anything other than `'break'` is read as `'fixture'`. |
| `day` | string | yes | `YYYY-MM-DD`. Matches a `days[].date`. |
| `courtId` | string \| `null` | yes | A `courts[].id`. `null` on a break means the break spans **every** court that day. |
| `startTime` | string | yes | `HH:MM`, 24-hour. |
| `endTime` | string | yes | `HH:MM`, 24-hour. Strictly after `startTime`. |
| `fixtureId` | string \| `null` | yes | A `fixtures.id` for a fixture entry; `null` on a break. |
| `title` | string | yes | Free text. `''` when unset. The break's name; unused on a fixture. |
| `officials` | string | yes | Free text. `''` when unset. May be assigned by the generator and is validated on write — see the note below. |
| `notes` | string | yes | Free text. `''` when unset. |

Every key is present on every entry. The optional ones are optional in *meaning*, not in
presence: `normaliseSchedule` fills each with `''` or `null`, and
`serialiseScheduleForSave` writes all eleven.

**`officials` holds a team name, and a bare name is sufficient — but only because two
rules hold together.** The generator can assign an officiating team as a pass over the
placed schedule (behind a toggle, off by default), and it only ever picks a team from the
fixture's own division; and team names are unique within a division
(`validateTeamNames` in `divisions.service.js`). So a name resolves back to exactly one
team, which is what lets the server reject a team scheduled to officiate a match it is
playing in (`SCHEDULE_OFFICIAL_PLAYING`). **If either rule relaxes** — an official from
another division, or duplicate team names within one — **the field needs a team id, and
the validator stops working before anyone notices.** A string that resolves to no team
("Club referee", a person's name) is left alone and never rejected.

**Entries are ordered by day, then start time, then court, then id** — applied on read,
on every mutation, and on save, so the stored array is already in that order. Corrected
2026-09-10: *court* means the court's **index in `courts`**, not a string comparison of
its id. Comparing ids as strings put `court-10` ahead of `court-2`, so any tournament
with ten or more courts listed them 1, 10, 11, … 2, 3 — on the Fixtures & Schedule tab
and in the printed list alike. Parsing a number out of the id would fix that and break a
court renamed "Centre Court"; position has neither problem, and is already what the
printed grid's columns and the courts panel treat as authoritative. An entry with
`courtId: null` — a break spanning every court — sorts first within its time group. An
entry naming a court the schedule no longer has sorts after every court it does.
`compareByCourtOrder` in `scheduleUtils.js` is the single definition.

Schedules saved before that date still hold the old order in the column; they are
re-sorted on read and rewritten in the corrected order the next time they are saved.

**`normaliseSchedule` silently drops any entry missing `id`, `day`, `startTime` or
`endTime`.** The client therefore never sees a malformed entry and cannot report one.
A malformed entry that reaches the column is not an error the organiser will ever be
shown — it simply vanishes from the view while staying in the database. This is why the
server validates on write rather than relying on the client to have sent something sane.

### Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `dayStartTime` | string | `'09:00'` | `HH:MM`. First slot of the grid. |
| `dayEndTime` | string | `'18:00'` | `HH:MM`. The grid stops before this. |
| `slotMinutes` | integer | `30` | Row height of the grid, in minutes. **How the board is ruled, never how long a match is.** |
| `generator` | generator object \| `null` | `null` | The rules and preferences the schedule was last generated with. Added 2026-09-24. `null` or absent means never generated; the panel shows the defaults. |

#### Generator

Written by the generator on every run and read back so the panel opens on the same
rules. Stored as given, like the rest of `settings`. `normaliseGeneratorSettings` in
`scheduleUtils.js` reads it key by key, so a missing key takes its default.

| Key | Type | Default | Description |
|---|---|---|---|
| `fixtureDurationMinutes` | integer \| `null` | `null` | Match length. `null` falls back to `slotMinutes`. |
| `restEnabled` | boolean | `true` | Whether a minimum rest applies at all. |
| `restMinutes` | integer \| `null` | `null` | The minimum gap between a team's matches on one day. `null` falls back to the match length. |
| `maxPerDayEnabled` | boolean | `false` | Whether a team's matches per day are capped. |
| `maxMatchesPerDay` | integer | `3` | The cap, when enabled. |
| `maxWaitEnabled` | boolean | `false` | Whether the longest wait applies. |
| `maxWaitMinutes` | integer | `120` | The longest a team should wait between two of its matches on one day. |
| `knockoutGapEnabled` | boolean | `false` | Whether knockout rounds wait for a break after the round before. |
| `knockoutGapMinutes` | integer \| `null` | `null` | The break. `null` falls back to the match length. |
| `fitAll` | boolean | `true` | Bend the rest and daily-limit rules where that is the only way to place a fixture. |
| `allowOverrun` | boolean | `false` | Run past `dayEndTime` on the last day as a last resort. |
| `spreadDays` | boolean | `false` | Share matches across days in proportion to their court time, instead of filling the first day first. |
| `courtAffinity` | boolean | `true` | Prefer keeping a pool on one court. |
| `groupDivisions` | boolean | `true` | Prefer keeping a court on one division. |
| `assignOfficials` | boolean | `false` | Assign an officiating team per match after placement. |
| `roundDurations` | object | `{}` | Round name → match length in minutes, for rounds that differ from `fixtureDurationMinutes`. Keyed by the round a fixture belongs to (`roundHolding`), so the 3rd place playoff takes `Finals` and `Semifinals · Places 5-8` takes `Semifinals`. Non-positive or unreadable values are dropped. |

Settings describe the grid the organiser is looking at, not a constraint on entries — the
server stores an entry outside them without complaint. Since 2026-08-13 the grid's axis is
a function of these three values alone and nothing else, so it never widens to contain an
entry: one outside `dayStartTime`…`dayEndTime` is listed beneath the grid rather than
moving the axis under its own contents.

`slotMinutes` is the organiser's, and only theirs. Until 2026-09-10 the generator wrote
the fixture duration of the run into it, so the grid always equalled the last match length
generated and a chosen granularity could not survive a regeneration. It does not write it
any more. A schedule that has never had one is seeded with the default by
`normaliseSchedule`.

A fixture's length is its own `startTime` and `endTime`, related to `slotMinutes` by
nothing at all. Two entries on one court may have two different lengths, and neither need
begin or end on a grid line.

- **The schedule maker's board** draws an entry at its own start for its own length, over
  grid lines that are a reading aid rather than a placement constraint. An organiser can
  drag a range out on an empty column to create an entry, and drag a placed entry's edge to
  change its length; both snap to five minutes, on every grid — the increment is not a
  fraction of a row, because a length an organiser can draw should not depend on how the
  board happens to be ruled.
  Drag-create is mouse and pen only: a touch drag on an empty part of the board is a
  scroll, and taking it would cost a phone the only way it has of moving around the day.
  The resize handles do take touch — they are 10px strips that scroll nothing worth
  keeping. Dragging near the top or bottom of the board scrolls it, so a day taller than
  the panel can still be reached; the same is true of dragging an entry to another court
  or time, which scrolls sideways as well.
- **The printed grid** still snaps an entry to the whole rows that contain it, because a
  sheet of paper has no way to draw a block at an arbitrary offset and keep the row legible.
  Where a row holds more than one entry on a court, every one of them is printed, and any
  entry whose start is not the row's own time carries its real times.

Changing `slotMinutes` or `dayStartTime` after entries exist re-rules the board and moves
nothing.

### Print

Added 2026-09-08. Two saved layouts, one per printed view, edited and saved independently
so that switching between them always shows a finished result.

```json
"print": {
  "grid": { "orientation": "landscape", "courtBreaks": ["court-7"], "rowBreaksByDay": { "day_k3f8a1m2": [4, 9] } },
  "list": { "orientation": "portrait", "rowBreaksByDay": { "day_k3f8a1m2": [12] } }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `grid` | layout object \| `null` | `null` | The court-columns-by-time view. `null` means never saved. |
| `list` | layout object \| `null` | `null` | The one-row-per-fixture view. `null` means never saved. |
| `<layout>.orientation` | `'portrait'` \| `'landscape'` | `'landscape'` (grid), `'portrait'` (list) | The paper orientation this layout's breaks were chosen against. A layout's orientation and its breaks are one unit — a reader picks a layout, not an orientation. |
| `<layout>.rowBreaksByDay` | object keyed by `days[].id` | `{}` | Row indices at which a page break falls. An index is the **first row of the next page**, so `[4, 9]` means rows 0–3, 4–8, 9–end. Row `0` is never a break. |
| `<layout>.courtBreaks` | array of `courts[].id` | `[]` | Grid only. The court each new column group **starts** with. Ids rather than indices so removing a court invalidates only its own break instead of shifting every one after it. |

Read it the way `settings` is read — presentation, not constraint. **The server stores it as
given and validates nothing about it**, because there is no arrangement of page breaks that
is impossible, only ones that are more or less useful to read.

Three absences mean three different things, and the difference matters:

- A layout of `null` — never saved. The smart default is computed.
- A day absent from `rowBreaksByDay` — the layout predates that day. The smart default is
  computed for that day alone; the rest of the layout still applies.
- A day present with `[]` — saved deliberately as one page. Not the same as absent.

**Stale breaks are dropped on read, never on write.** A break naming a day id no longer in
`days`, or a court id no longer in `courts`, is ignored for that load and the smart default
fills the gap; the organiser is shown a dismissible notice once, and non-organiser viewers
are shown nothing. What is stored only changes when the organiser saves. A row index past
the end of a day is ignored the same way, silently — a day getting shorter is not something
worth interrupting anyone about.

**The smart default reproduces the fixed page sizes it replaced**, then looks up to two rows
earlier for a natural place to break: an empty slot row on the grid, the start of a new time
on the list. It never looks *later*, so a page is never longer than the estimate — a short
page prints with blank space at the foot, a long one silently overflows.

**The generator is stricter than the payload.** Everything it places starts when its
court comes free: at the day's start, when the court's previous match ends, when a break
ends, or when another court frees up. It also lies inside the configured day unless the organiser allowed an overrun.
See Generation objectives below. The paragraph above is about hand-placed entries and
breaks.

## Generation objectives

Settled 2026-08-11 and implemented 2026-08-13. Revised 2026-09-24, when the rules became
the organiser's to switch and bend. This section is what
`tourganiser-ui/src/utils/scheduleGenerator.js` is judged against, and what any future
change to it has to argue with. The generator stays in the client — see
`docs/decisions.md`. The organiser's choices are saved at `settings.generator` (see
above).

### Rules that never bend

The server rejects any schedule that breaks one of these, so the generator never
produces one, whatever the settings.

1. **Court exclusivity.** No two entries overlap on one court on one day. An entry with
   `courtId: null` is a break spanning every court and blocks all of them.
2. **Court division restriction.** A court whose `divisions` array is non-empty takes
   only fixtures of those divisions. A fixture with no `division_id` is refused by any
   restricted court.
3. **Team exclusivity.** No team plays two matches at the same time.
4. **Round order.** A fixture of round *n* in a division may not start before every
   fixture of that division's earlier rounds has finished. The generator is stricter than
   the server here: it places no fixture of a round until **every** fixture of the earlier
   rounds has been placed. A knockout round is left out rather than scheduled ahead of a
   pool match that could not be placed.

A team is only a team when the fixture names one. An unbound knockout slot carries a
placeholder — `Rank 1`, `TBD` — and constrains nothing, which is how the server's
validator treats a null `team_1`. Where the payload carries team ids they are used;
where it does not, the name is used, and either way the key is scoped to the division.

### The organiser's rules

Each can be switched on or off.

5. **Minimum rest** (`restEnabled`, `restMinutes`). A gap of at least `restMinutes`
   between the end of one of a team's matches and the start of the next, on the same day,
   measured on both sides. Defaults to one match length, which is what the rule always
   came out at.
6. **Daily limit** (`maxPerDayEnabled`, `maxMatchesPerDay`). No team plays more than
   this many matches on one day. Off by default.
7. **Break before knockout rounds** (`knockoutGapEnabled`, `knockoutGapMinutes`). A
   knockout round (`type: 'knockout'` in `state.rounds`) may not start until this long
   after the latest end of its division's earlier rounds on the same day. A round that
   ended the day before has had the night. This is the rest that rule 5 can't give,
   because knockout teams are unbound until the round before has been played. Off by
   default.
8. **Longest wait** (`maxWaitEnabled`, `maxWaitMinutes`). The most time a team should
   wait between two of its matches on the same day. Unlike the others, it never refuses a
   placement, because refusing would only lengthen the wait. A team that would run over
   the limit if its match waited one more match length is played first. A wait that still
   runs over is reported. Off by default.
9. **Day bounds.** Every entry lies within `dayStartTime` and `dayEndTime`. This rule
   can't be switched off, but `allowOverrun` lets it bend as a last resort (below).

### Bending to fit every fixture

With `fitAll` on, rules 5, 6 and 7 may bend where that is the only way to place a fixture,
and as little as possible:

- **A bend only fills a court that would otherwise stand idle.** A match that satisfies
  every rule always wins the court over one that doesn't.
- **A bend happens only once time is running out.** Slack is the free court time left
  minus the matches still to place. It never rises during a pass: placing a match leaves
  it unchanged and an idle court lowers it. A bend is allowed only once slack falls below
  a margin, so bends collect at the tail of the schedule. The generator tries a range of
  margins (0, 1, 2, 4, … and finally "always") and keeps the best result.
- **Bends are spread across teams.** Each bend costs one more than the last bend for the
  same team. Three teams each playing back to back once is preferred to one team playing
  three in a row.

Results are ranked by: most fixtures placed, then the least overrun, then the lowest
bend cost, then the fewest bends for any single team, then the earliest finish. A
strict pass that places everything ends the search at once, with nothing bent.

**Overrun** (`allowOverrun`) is tried only when bending can't place everything. It adds
slots after `dayEndTime` on the **last enabled day only**, one at a time, and stops as
soon as everything fits or the day reaches 23:59. An entry past `dayEndTime` is listed
beneath the board's grid, as any entry outside the day is.

Every bend is returned in the generator's `report.ruleBreaks`, grouped by rule with
the entries and teams involved, and shown to the organiser after generating.

### How a schedule is built

The generator works like a person with a whiteboard. It walks the day from the first
slot to the last, decides which matches play at each time, then which court each goes
on.

**Court clocks.** Each court keeps its own clock from `dayStartTime`. The walk always
takes the earliest clock, together with every court free at that same minute, and fills
those courts. A court then moves on by the length of the match it was given, which is
the round's own length where `roundDurations` sets one. A court left with nothing moves
to the next moment something could change: another court coming free, or one shortest
remaining match length later. When every round has the same length, this is exactly a
fixed run of slots one match length apart.

A break closes the court until it ends, and the court restarts the moment the break ends,
not at the next multiple of the match length. A lunch break ending at 12:45 loses no time
to a 13:00 restart. A break spanning every court restarts all courts together. A break on
one court moves only that court, so courts can run to different clocks. The slack and
the day-spreading share are counted in matches of the default length, an estimate once
lengths differ.

**Which matches play now.** A match is a candidate when it is ready (rule 4), neither
team is busy, and a free court accepts its division. Order within a round is free, so
the generated fixture order counts only as the final tiebreak. Candidates are compared
lexicographically:

1. Bend cost. A match needing no bend always comes first.
2. Overdue first: a match whose team would otherwise run over the longest wait.
3. **Urgency**, highest first: the busiest team's remaining matches, plus the knockout
   rounds of the division still to follow. Those teams set the finishing time.
4. Whichever match's teams have waited longest since they last played, which spreads
   rest evenly.
5. Fixture order.

Division is not a key. Two divisions sharing a court interleave whenever that finishes
sooner, for example one division's match fills the court while the other's teams rest.

**Which court.** Only preferences decide, each applied when switched on and in this order:

1. Keep the court on the division it was already running (`groupDivisions`). 0 continues,
   1 an idle court, 2 a changeover.
2. Keep a pool on the court it started on (`courtAffinity`).
3. A court reserved for this division before an open one, so the open one stays free
   for anyone.
4. Court order.

**Spreading across days** (`spreadDays`). Each day but the last takes, at most, its
share of the matches still to place, in proportion to its court time. The last day takes
whatever remains. If spreading costs a fixture its place, the generator uses the
unspread schedule instead.

The priority is still lexicographic, not weighted. The one number, the escalating bend
cost, counts bends. It is not traded against time. Generation is deterministic: the same
input produces the same schedule.

### When fixtures are still left out

A fixture that can't be placed goes to `unscheduledFixtures`. The warning names the
constraint that kept a court idle when the fixture could have used it: division,
daily limit, rest, round order, team clash, or capacity. A refusal while another match
filled the court anyway is not counted. Capacity was the real reason there.

## What the server validates

Settled in `docs/decisions.md`: the generator stays in the client and the server
validates on write. **The server rejects the impossible. It does not judge whether a
schedule is good** — court balance, rest between matches and gap minimisation are the
generator's business and the organiser's judgement.

Structural, and checked:

| Field | Rule |
|---|---|
| `entries[].fixtureId` | Must name a fixture belonging to this tournament. |
| `entries[].fixtureId` | May appear at most once across the whole schedule. |
| `entries[].day` | Must fall within the tournament's `start_date`…`end_date`. |
| `entries[].startTime`, `endTime` | `HH:MM`, and `endTime` strictly after `startTime`. |
| `entries[].courtId` + times | No two entries may overlap on the same court on the same day. `courtId: null` conflicts with every court that day. |
| `entries[].courtId` + the court's `divisions` | A fixture may not be placed on a court whose non-empty `divisions` array does not name the fixture's division. A break, and an entry on a `courtId` no court has, are exempt. |
| the fixture's two teams | No team may be required in two places at once. |
| round order | A knockout fixture may not start before the round feeding it has finished. |
| `entries[].officials` | If, and only if, the string resolves to a team of the fixture's own division (trimmed, case-insensitive), that team may not be `team_1` or `team_2` of any overlapping placement — including this one. A string that resolves to no team is accepted untouched. |

Free text, and merely stored:

- `title`, `notes` — never inspected.
- `days`, `settings`, `print` — stored as given, and `days` is regenerated on read anyway.
- `courts` — stored as given, except that each court's `divisions` is read to enforce the
  court division restriction above.
- `version` — stored as given.

A partial schedule is legal. Not every fixture has to be placed, and a schedule with no
entries at all is valid.

## Example

Two courts, one day, one break spanning both courts and two fixtures.

```json
{
  "version": 1,
  "days": [
    { "id": "day_k3f8a1m2", "date": "2026-09-12", "label": "Day 1" }
  ],
  "courts": [
    { "id": "court-1", "name": "Court 1", "divisions": [] },
    { "id": "court-2", "name": "Centre Court", "divisions": [] }
  ],
  "entries": [
    {
      "id": "entry_9x2bqp71",
      "type": "fixture",
      "day": "2026-09-12",
      "courtId": "court-1",
      "startTime": "09:00",
      "endTime": "09:30",
      "fixtureId": "dc094f68-a604-4bc0-a065-df8be2635425",
      "title": "",
      "officials": "",
      "notes": ""
    },
    {
      "id": "entry_5tq0w8he",
      "type": "fixture",
      "day": "2026-09-12",
      "courtId": "court-2",
      "startTime": "09:00",
      "endTime": "09:30",
      "fixtureId": "75ecb298-cecc-48b9-835e-58bf058ac7ae",
      "title": "",
      "officials": "",
      "notes": ""
    },
    {
      "id": "entry_mm41v6cz",
      "type": "break",
      "day": "2026-09-12",
      "courtId": null,
      "startTime": "12:00",
      "endTime": "13:00",
      "fixtureId": null,
      "title": "Lunch",
      "officials": "",
      "notes": ""
    }
  ],
  "settings": {
    "dayStartTime": "09:00",
    "dayEndTime": "18:00",
    "slotMinutes": 30
  },
  "print": null
}
```

## Who writes this column

Two writers, and they can race:

- **The save endpoint**, `PUT /api/tournaments/:tournamentId/schedule`.
- **A division rebuild**, `PUT /api/divisions/:divisionId`, which drops that division's
  entries when its fixtures are regenerated. See `docs/api.md`.

Both read through `tournamentRepository.getScheduleForUpdate`, a `SELECT … FOR UPDATE`
on the tournament row, so a rebuild and a save cannot each overwrite the other's
`entries`.

There is no `tournaments.last_update` column, so a schedule write stamps nothing. That is
recorded as a problem for the client-side cache in `docs/roadmap.md`.
