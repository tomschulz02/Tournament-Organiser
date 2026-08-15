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

## Fixture Status

There is one vocabulary, the `fixture_status` enum in `docs/database.md`. It travels
unchanged from the database to the component. `WAITING` and `ONGOING` are not statuses;
if you find them, they are drift.

| Status | Meaning |
|---|---|
| `UPCOMING` | No set scores recorded. |
| `LIVE` | At least one set recorded, and the organiser has not ended the match. |
| `COMPLETED` | The organiser has ended the match. |
| `CANCELLED` | The organiser cancelled it. The match never happened. |

The server derives the status from the recorded sets and stores it. The client never
asserts one — it submits scores and, when the match is over, says so. `CANCELLED` is the
only status set directly, because nothing about it can be inferred from scores.

The organiser's explicit end-of-match signal is a stopgap. Once rounds can express a
match format, `COMPLETED` follows from a team reaching `ceil(N/2)` sets and the signal
becomes a confirmation.

Display labels are a separate concern. A component may render `LIVE` as "In progress";
it may not rename the status in the payload.

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

### A two-team knockout still consumes four ranks

A knockout stage of two teams generates a bronze match as well as a final, so the Finals
round holds `groups: [[2, 3], [0, 1]]` — the playoff first, as `createClassicState`
unshifts it onto the front. Its `qualifyingTeams` is therefore **4, not 2**, for a
division configured with `knockout_teams: 2`.

Anything reasoning about how many teams a knockout round needs must read
`qualifyingTeams` rather than inferring it from the round's name or from the configured
knockout size.

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

**Consequence for any client: an undefined ratio arrives as a missing key, not as
`null`.** The sentinel is a `Symbol`, and `JSON.stringify` drops symbol-valued properties
entirely, so `setsRatio` or `pointsRatio` is simply absent from the payload for a team
that has won sets and lost none. Test with `Number.isFinite(value)`. A `value !== null`
check passes on `undefined` and renders `NaN` for exactly the team the sentinel exists
for — which is what the old tournament view did.

## Scheduling

### A round cannot begin until the round feeding it has finished

Within a division, a fixture in round *n* may not start before the last fixture of every
round before it has ended. A semifinal at 09:00 on court 2 while pool play runs at 09:00
on court 1 is not a poor schedule; it is an unplayable one, because the semifinal's teams
are not known until pool play is over.

**The constraint is per division.** Two divisions running in parallel is correct and
desirable, and nothing here says a whole tournament has to be serialised onto one court.
Within a round, fixtures may still run concurrently.

Rounds are ordered by their position in `state.rounds` — see `docs/division-state.md`.
The third-place playoff is the exception the rest of the codebase already carries: its
fixture round name is `3rd Place Playoff`, but it belongs to the `Finals` round in
`state.rounds` and is therefore ordered with the final rather than before it.

The rule is enforced twice, deliberately. `tourganiser-ui/src/utils/scheduleGenerator.js`
applies it at generation time, as a hard constraint rather than a score, so a generated
schedule never breaks it. `api/src/utils/scheduleValidator.js` applies it again on write,
because a schedule can also be built and edited by hand. See `docs/schedule.md`.

A partial schedule is legal, so an earlier round may be entirely unplaced. The constraint
is measured against every earlier round that *has* been placed, not only the immediately
preceding one.

### A team never plays two matches back to back

At least one slot of rest between a team's two matches on the same day. Settled
2026-08-11 and enforced from 2026-08-13 as a hard constraint in the generator, not a
preference it can trade away: a tight tournament now reports a fixture it cannot place
rather than placing it against a team that has just come off court.

Only the generator enforces it. The server accepts a hand-placed back-to-back match,
because the organiser may have a reason — a walkover, a team that asked for it — and
`docs/schedule.md` is clear that the server rejects the impossible rather than judging
whether a schedule is good.

**It cannot apply across the pool-to-knockout boundary.** A semifinal's teams are not
known until pool play has finished, so the generator has nobody to give rest to and will
place a semifinal in the slot immediately after the last pool match. The round-order rule
above still holds, so the match is playable; it may not be kind. An organiser who wants a
gap there adds a break. Recorded in `docs/known-limitations.md`.

The full priority order the generator works to is in `docs/schedule.md` under Generation
objectives.

### Officials are not assigned

A schedule entry carries an `officials` string and it is stored and displayed, but
nothing assigns officials, checks their availability, or validates the field. It is free
text. See `docs/future-features.md`.

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
