# Tournament Rules

The domain rules for ranking and progression. This document is the source of truth.
Where the code disagrees, the code is wrong — see Implementation Gaps at the end.

## Terminology

Tournament
Collection of one or more divisions.

Division
Independent competition.

Fixture
Single match.

Round
Collection of fixtures.

Schedule
Assigns fixtures to courts, dates, times and optionally officials.

Seeding
The order of `state.teams`. Index 0 is the top seed. Used as the final tiebreaker.

## Structure Rules

Fixture generation determines only participating teams.

Scheduling determines:
- court
- date
- time
- officials (optional)

Scheduling must remain independent from fixture generation.

Knockout stages are independent from pool stages.

Placeholder knockout fixtures may be generated for user reference.

Teams are stored in their own table.

Division state references Team IDs.

Fixtures are stored separately and referenced by ID.

## Match Format

Match format is set **per round**, not per division. Pool play may be best-of-3 while
the knockout rounds are best-of-5.

A match is won by whichever team wins more sets. Nothing else — points totals do not
decide a match, only the count of sets won.

A set is won by whichever team scored more points in it. A set with equal scores counts
as won by neither team and contributes to no one's set total, though its points still
count toward points for and against. Equal set scores should not occur in practice; the
rule exists so that bad data degrades predictably rather than crashing.

## Standings

Standings apply to round-robin rounds only. Knockout rounds produce a bracket, not a
table.

Only fixtures with status `COMPLETED` count. `UPCOMING`, `LIVE` and `CANCELLED` are
ignored entirely — a cancelled match never happened and moves nobody's played count.

### Tracked per team

- played, won, lost
- setsWon, setsLost
- pointsFor, pointsAgainst
- setRatio = setsWon / setsLost
- pointRatio = pointsFor / pointsAgainst

### Ranking order

Applied in sequence. Move to the next criterion only when the current one ties.

1. **Matches won**, descending.
2. **Set ratio**, descending.
3. **Point ratio**, descending.
4. **Head-to-head**, if the tied teams have played each other.
5. **Seeding** — position in `state.teams`, ascending. The top seed wins the tie.

Because seeding is a total order over the division, step 5 always resolves. Standings
are never ambiguous and never depend on team names.

### Undefined ratios

A team that has won sets but lost none has an undefined set ratio (division by zero).
Treat it as tied with any other undefined set ratio and fall through to point ratio. The
same applies to an undefined point ratio, which falls through to head-to-head.

A team with no completed matches has both ratios at zero, not undefined.

### Head-to-head

Only applied between teams still tied after both ratios. Compare the results of the
matches those teams played against each other.

If three or more teams are tied and their head-to-head results form a loop — A beat B,
B beat C, C beat A — head-to-head cannot resolve it. Do not attempt a mini-league.
Abandon head-to-head for that group of teams and fall straight through to seeding.

### Forfeits

There is no forfeit status. A forfeit is recorded by the organiser as an ordinary
completed match with a scoreline reflecting the forfeit. Getting this right is left to
the organiser's discretion.

`CANCELLED` is not a forfeit. It means the match was not played and does not count.

## Progression Between Rounds

At the end of a round, teams are ranked and written to that round's `results` array.
The next round's `groups` hold integer indices into it. This is what lets knockout
fixtures exist before the teams that will play them are known.

### From a round-robin round

`results` is a single flat list spanning every pool in the round, ordered by **pool
position first, then by ratios**:

1. All pool winners, ranked against each other.
2. All runners-up, ranked against each other.
3. And so on down the pools.

So with pools A and B, the order is A1/B1 (whichever is stronger first), then A2/B2, and
so on. Teams finishing in the same pool position are separated using the same chain as
in-pool standings: set ratio, then point ratio, then seeding. Head-to-head is skipped
across pools, since teams from different pools have usually not played each other.

This produces a seeded list where index 0 is the strongest qualifier, which is why
semifinals are expressed as `[0, 3]` and `[1, 2]`.

### From a knockout round

`results` is **winners first, then losers**. Within each half, teams keep the seeding
order they carried into the round.

For a semifinal round this gives `[winner1, winner2, loser1, loser2]`, so the following
round expresses the bronze match as `[2, 3]` and the final as `[0, 1]`.

### Qualification

The number of teams advancing is the round's `qualifyingTeams`. When it is not a
multiple of the pool count, the guaranteed places are filled first — the top
`floor(qualifyingTeams / poolCount)` from every pool — and the remaining places go to
the best teams not yet qualified, compared across pools by the cross-pool rules above.

## Implementation

The rules above are implemented once, in `api/src/utils/standings.js`. Both the
standings view (`tournamentViewFormatter.js`) and round progression
(`progression.service.js`) rank through it, so a table and the qualifiers derived from
that table cannot disagree.

Do not reimplement any part of the ranking chain elsewhere. If a caller needs different
behaviour, extend the module rather than copying it.

Undefined ratios use a sentinel rather than `Infinity`, so two undefined ratios compare
equal and fall through as documented. `Infinity - Infinity` is `NaN`, which
`Array.prototype.sort` silently treats as "equal" — the right outcome by accident, and
fragile.

## Organiser Override

The default ranking is a proposal, not a verdict. Tournaments resolve ties in ways this
document cannot anticipate, so the organiser confirms the ranking before a round
advances and may reorder it or substitute a team that played the round.

Both lists are stored on the round: `results` is what was used, `computedResults` is
what the rules produced, and `resultsAmended` records whether they differ.

Details of the endpoints and their validation are in `docs/api.md`.

## Remaining Gaps

- Round objects have no match format key, so the per-round best-of rule cannot be
  expressed yet. See `docs/division-state.md`.
- Ranking basis is fixed at matches won. Making it configurable per division is in
  `docs/future-features.md`.
- `tourganiser-ui/src/components/NextRoundModal.jsx` still computes qualifiers in the
  frontend, with the two bugs recorded in `docs/known-limitations.md`. It should be
  replaced by calls to the progression endpoints.
