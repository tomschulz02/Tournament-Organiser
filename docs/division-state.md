# Division State

Division state is stored as JSONB in `divisions.state`.

This document is the source of truth for the shape of that JSONB. Where code disagrees
with it, the code is wrong.

## Top Level

| Key | Type | Description |
|---|---|---|
| `teams` | array of UUID strings | Team IDs in this division, in seeded order. References `teams.id`. |
| `rounds` | array of round objects | Ordered. Index 0 is the first round played. |
| `currentRound` | integer | Index into `rounds`. The round currently in progress. |

`teams` holds ID strings only, never team objects. Names are resolved by joining to the
`teams` table.

### Who owns membership

Both `state.teams` and `teams.division_id` express which teams are in a division. Settled
2026-08-09, when team creation came down to the `division_id` schema:

- **`state.teams` is authoritative for order.** Seeding is the whole reason it is an
  array, and nothing on the team row can carry a seed. Anything that presents teams in
  order reads this.
- **`teams.division_id` is the foreign key.** It carries the cascade delete and makes a
  division's rows cheap to find. It says nothing about order.

So a division's teams are resolved by passing `state.teams` to
`divisionsRepository.getTeamsByIds`, never by querying on `division_id` — that would come
back in no particular order. `getTeamsByDivisionIds` is deliberately not restored.

The two can drift: a `teams` row whose `division_id` points at a division that does not
list it in `state.teams` is invisible, and an id in `state.teams` with no row resolves to
nothing. Nothing enforces agreement. Write both together, inside the same transaction.

## Round Object

| Key | Type | Description |
|---|---|---|
| `name` | string | Display name, e.g. `"Pool Play"`, `"Semifinals"`. |
| `type` | string | `"roundRobin"` or `"knockout"`. |
| `groups` | array of arrays | See below — contents differ by round type. |
| `fixtures` | array of UUID strings | Fixture IDs for this round. References `fixtures.id`. |
| `results` | array | Empty until the round ends. See below. |
| `totalGames` | integer | Fixture count for the round. |
| `completedGames` | integer | Fixtures with status `COMPLETED`. Round is over when this equals `totalGames`. |

Not yet present, but required by `docs/tournament-rules.md`: match format is defined
**per round**, so a round needs a key recording its best-of. Pool play at best-of-3 and
knockout at best-of-5 in the same division cannot currently be expressed. Add it when
implementing per-round formats.

### groups

The meaning of `groups` depends on `type`:

- `roundRobin` — each inner array holds **team UUIDs**, one array per pool.
- `knockout` — each inner array holds **integer indices into the previous round's
  `results`**, one array per match. `[0, 3]` means "first place plays fourth place".

This is why knockout fixtures can be generated before the pool stage finishes: the
matchups are expressed positionally and only resolve to teams once `results` is filled.
Those pre-generated fixtures use `team_1_placeholder` / `team_2_placeholder` for display.

### results

Empty while a round is in progress. When the round completes, teams are ranked by their
results and written here as an ordered array. The next round's `groups` indices are
resolved against it.

`results` is therefore how teams progress between rounds. There is no separate
`qualifiedTeams` key — if you find one in older code or data, it predates this and its
contents belong in `results`.

The ordering differs by round type — a flat cross-pool seeding for round-robin rounds,
winners before losers for knockout rounds. `docs/tournament-rules.md` defines both.

## Standings

Standings are not stored. They are computed on the fly during the tournament detail
fetch by `api/src/utils/tournamentViewFormatter.js`, from the fixtures and their results.

This keeps standings from going stale, at the cost of recomputing on every read. Open to
optimisation if it becomes a problem — caching or materialising into `state` are both
options, but neither is justified yet.

## Schedule

A schedule is **not** part of division state, and it is not part of a division at all.
It is stored in its own JSONB column on the tournament, `tournaments.schedule`.

It moved there from `divisions.schedule` on 2026-08-08. A schedule is tournament-wide
because divisions share the same physical courts, so scheduling them independently could
double-book one; putting the schedule on the tournament makes that impossible to express.

The `state.schedule` fallback `tournamentViewFormatter.js` used to read is gone with it.
Nothing reads a schedule out of division state, and nothing writes one there.

`docs/schedule.md` is the source of truth for that column's shape.

## Example

Taken directly from the database. An eight-team division: one round-robin pool stage
split into two groups of four, then semifinals and finals.

{
  "teams": [
    "45bb764e-c07d-474e-8d01-9d9711d39a3a",
    "2b64031d-8408-4783-92d8-e375a56ef8d5",
    "0da84d48-d442-40d4-a5fe-e7adac21a48d",
    "7999b658-993f-4fb4-84fa-2aad95489fce",
    "4009a8b3-c098-43ab-bab7-1ba6acf40c28",
    "d57c1597-f51b-4c10-a52a-f9e9e6d0f5a1",
    "56627a42-2d0e-4cbb-91ae-9710d9a971e3",
    "168eb664-ebd0-4da0-a1cc-74b8532f1500"
  ],
  "rounds": [
    {
      "name": "Pool Play",
      "type": "roundRobin",
      "groups": [
        [
          "45bb764e-c07d-474e-8d01-9d9711d39a3a",
          "7999b658-993f-4fb4-84fa-2aad95489fce",
          "4009a8b3-c098-43ab-bab7-1ba6acf40c28",
          "168eb664-ebd0-4da0-a1cc-74b8532f1500"
        ],
        [
          "2b64031d-8408-4783-92d8-e375a56ef8d5",
          "0da84d48-d442-40d4-a5fe-e7adac21a48d",
          "d57c1597-f51b-4c10-a52a-f9e9e6d0f5a1",
          "56627a42-2d0e-4cbb-91ae-9710d9a971e3"
        ]
      ],
      "results": [],
      "fixtures": [
        "dc094f68-a604-4bc0-a065-df8be2635425",
        "75ecb298-cecc-48b9-835e-58bf058ac7ae",
        "4841f943-2240-42a8-8691-e8dc43fd0d32",
        "647dafb3-2ead-4f6e-b695-f49f012dfb8a",
        "2130ab53-cdee-4c5b-aea4-7fb86371b3db",
        "94b75c19-3880-4b78-b801-0dd54cf550e8",
        "6246d26e-c1b3-4eef-a172-2a3a2baa8119",
        "5b37d9ec-ed5b-4619-90be-4f23b9a9fb90",
        "a9c8d6f6-5571-4197-a77a-f5d2bd49b76f",
        "51b92392-4ac5-46b5-a3f7-6b576c0014a0",
        "7676c190-a5cf-4404-b10d-e8898e3658b3",
        "655c752b-4ba7-49c6-a184-88658d6c4c37"
      ],
      "totalGames": 12,
      "completedGames": 0
    },
    {
      "name": "Semifinals",
      "type": "knockout",
      "groups": [
        [
          0,
          3
        ],
        [
          1,
          2
        ]
      ],
      "results": [],
      "fixtures": [
        "ffd0d001-674f-4b97-8d00-f23449dcafe7",
        "e97529ea-fcda-4d57-85ad-e931f49029fd"
      ],
      "totalGames": 2,
      "completedGames": 0
    },
    {
      "name": "Finals",
      "type": "knockout",
      "groups": [
        [
          2,
          3
        ],
        [
          0,
          1
        ]
      ],
      "results": [],
      "fixtures": [
        "ac1628fc-e142-4a30-acd1-6be2776203c2",
        "dd00e7b9-0c5f-4215-8596-b5076bb42e36"
      ],
      "totalGames": 2,
      "completedGames": 0
    }
  ],
  "currentRound": 0
}

Note in the example that `rounds[0].groups` holds team UUIDs while `rounds[1].groups`
and `rounds[2].groups` hold small integers. That is the `roundRobin` versus `knockout`
distinction described above, not an inconsistency.

## Purpose

JSONB allows tournament formats to evolve without frequent schema changes.

The trade-off is that nothing here is enforced by the database. Any code writing to
`state` is responsible for keeping it valid, and a malformed write will only surface
when something tries to read it.
