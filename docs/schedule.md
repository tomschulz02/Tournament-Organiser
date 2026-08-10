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

Settings describe the grid the organiser is looking at, not a constraint on entries. An
entry may start before `dayStartTime`, end after `dayEndTime`, or begin off a slot
boundary; `getDayBounds` widens the drawn day to contain it. Changing `slotMinutes` or
`dayStartTime` after entries exist leaves entries that no longer land on a boundary.

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
