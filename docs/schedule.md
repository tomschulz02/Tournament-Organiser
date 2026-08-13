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
| `courts` | array of court objects | yes | The playing surfaces available. May be empty; an empty court list means nothing can be placed. |
| `entries` | array of entry objects | yes | The placements. May be empty — a schedule that places nothing is valid. |
| `settings` | settings object | yes | The grid the client draws. Presentation only. |

`null` is a legal value for the whole column and means "no schedule yet". The client
turns it into an empty schedule on read.

### Day

| Key | Type | Description |
|---|---|---|
| `id` | string | `day_<random>`. Stable across saves for a date that survives. |
| `date` | string | `YYYY-MM-DD`. |
| `label` | string | Display name. `Day 1`, `Day 2`… unless the organiser renamed it. |

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

Courts are positional: `buildCourtList` regenerates the list from a count and reuses the
existing entry at each index. Reducing the court count therefore drops courts from the
end, and any entry pointing at a dropped court keeps a `courtId` that no longer resolves.

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
| `officials` | string | yes | Free text. `''` when unset. Nothing assigns or validates it — see `docs/tournament-rules.md`. |
| `notes` | string | yes | Free text. `''` when unset. |

Every key is present on every entry. The optional ones are optional in *meaning*, not in
presence: `normaliseSchedule` fills each with `''` or `null`, and
`serialiseScheduleForSave` writes all eleven.

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
| `slotMinutes` | integer | `30` | Row height of the grid, in minutes. |

Settings describe the grid the organiser is looking at, not a constraint on entries — the
server stores an entry outside them without complaint. But since 2026-08-13 the grid's
axis is a function of these three values alone and nothing else, so an entry that does not
fit them is visibly not drawn on it: one that begins off a slot boundary is drawn across
the slots it covers and marked as approximate, and one outside `dayStartTime`…`dayEndTime`
is listed beneath the grid instead. The axis no longer widens to contain an entry, because
an axis that moves under its own contents cannot be read.

Changing `slotMinutes` or `dayStartTime` after entries exist therefore leaves entries that
no longer land on a boundary, and that is now something the organiser can see.

**The generator is stricter than the payload.** Everything it places lies inside the
configured day and on a slot boundary, because it only ever builds candidate slots there —
see Generation objectives below. Hand-placed entries and breaks are what the paragraph
above is about.

## Generation objectives

Settled 2026-08-11, implemented 2026-08-13. This section is what
`tourganiser-ui/src/utils/scheduleGenerator.js` is judged against, and what any future
change to it has to argue with. The generator stays in the client — see
`docs/decisions.md`.

### Hard constraints

Feasibility, not preference. A slot either satisfies all five or it is not a candidate,
and none of them can be traded away for a better score on anything below.

1. **Court exclusivity.** No two entries overlap on one court on one day. An entry with
   `courtId: null` is a break spanning every court and blocks all of them.
2. **Team exclusivity.** No team plays two matches at the same time.
3. **Round order.** A fixture of round *n* in a division may not start before every
   fixture of that division's earlier rounds has finished. The server enforces the same
   rule on write; see `docs/tournament-rules.md`.
4. **Rest.** At least one slot between a team's two matches on the same day. A team never
   plays back to back.
5. **Day bounds.** Every entry lies within the configured `dayStartTime` and `dayEndTime`.

A team is only a team when the fixture names one. An unbound knockout slot carries a
placeholder — `Rank 1`, `TBD` — and constrains nothing, which is how the server's
validator treats a null `team_1`. Two semifinals both waiting on the pools are not the
same team and must be free to run at once. Where the payload carries team ids they are
used; where it does not, the name is used, and either way the key is scoped to the
division, because two divisions may both have a "Team A".

### Objectives, in priority order

1. **Minimise the finish time.** The venue is booked for a window; compactness wins.
2. **Maximise rest** beyond the hard minimum, where it costs nothing above.
3. **Minimise division changeovers.** A division need not be strictly contiguous, but a
   court should switch between divisions as seldom as possible.
4. **Court affinity for pools.** Last and least — nice when it is free.

### The algorithm is lexicographic, not weighted

Two candidate slots are compared on the first objective; only where they tie is the
second consulted, and so on, ending in a total tiebreak so that two genuinely equivalent
slots always resolve the same way. Generation is deterministic: the same input produces
the same schedule.

This is deliberate, and it is the whole point of the 2026-08-13 rewrite. The generator it
replaced summed weights — court affinity `+180` against earliness `-2` per slot index —
so ninety slots of delay cost exactly one affinity bonus and a pool match could be pushed
hours later to stay on its court. Nobody could have justified those numbers, and nobody
could predict what changing one would do. A weighted sum needs numbers that compose; a
priority order needs only an order.

Because the first objective is the slot's start instant and slots are of fixed size,
compactness falls out of the structure rather than being scored: take the earliest
feasible time, then choose among the courts free at that time using the objectives below
it.

### Under capacity, leave fixtures unplaced

A fixture with no feasible slot goes to `unscheduledFixtures` and the schedule is returned
without it. No hard constraint is relaxed to make it fit. A tight tournament will
therefore report fixtures that an earlier generator would have placed back to back — that
is the intended trade, and the warning names the constraint that blocked it rather than
blaming capacity for everything, so an organiser knows whether to add a court, extend the
day, or shorten matches.

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
| the fixture's two teams | No team may be required in two places at once. |
| round order | A knockout fixture may not start before the round feeding it has finished. |

Free text, and merely stored:

- `title`, `notes`, `officials` — never inspected.
- `days`, `courts`, `settings` — stored as given, and `days` is regenerated on read
  anyway.
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
    { "id": "court-1", "name": "Court 1" },
    { "id": "court-2", "name": "Centre Court" }
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
  }
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
