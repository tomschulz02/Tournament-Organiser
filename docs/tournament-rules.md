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

Officials are a free-text field on a schedule entry. They are captured in the schedule
maker's entry inspector and stored with the entry — see `docs/schedule.md`. Nothing
validates them, nothing assigns them automatically, and they are not a modelled entity;
they are a note attached to a match.

Scheduling must remain independent from fixture generation.

Knockout stages are independent from pool stages.

Placeholder knockout fixtures may be generated for user reference.

Teams are stored in their own table.

Division state references Team IDs.

Fixtures are stored separately and referenced by ID.

## Pool Draw

How a Classic division's seeds are placed into its pools. Chosen per division when it is
created, and changeable in Settings until the tournament starts. League divisions have no
pools and no draw. There is no manual draw: an organiser shapes pools by reordering seeds.

Every draw produces **the same pool sizes**, the ones the snake gives for that team and
pool count. Only which seed lands in which pool differs. With `n` pools:

- **Snake** (the default). Seeds are dealt across the pools and back again: row 1 goes
  A → last pool, row 2 comes back last pool → A, and so on. This is `populateGroups`.
- **Straight.** Consecutive seeds fill one pool at a time: pool A takes the top seeds up to
  its size, pool B the next, and so on.
- **Seeded pots.** Pot *k* is seeds `(k−1)·n + 1` to `k·n`. Pot 1 goes one team per pool in
  seed order, so seed 1 is in pool A. Every later pot is drawn at random into the pools,
  one team per pool. A short last pot is drawn into the pools the snake makes larger.

Worked example, 12 teams in 3 pools (numbers are seeds):

| Draw | Pool A | Pool B | Pool C |
|---|---|---|---|
| Snake | 1 6 7 12 | 2 5 8 11 | 3 4 9 10 |
| Straight | 1 2 3 4 | 5 6 7 8 | 9 10 11 12 |
| Seeded pots | 1, then one each of 4–6, 7–9, 10–12 | 2, then one each of 4–6, 7–9, 10–12 | 3, then one each of 4–6, 7–9, 10–12 |

One possible pots result is A 1 5 9 10 / B 2 6 7 12 / C 3 4 8 11.

**A pots draw is kept until Redraw.** The random choices come from a seed number stored
with the division (`state.poolDraw.seed`, see `docs/division-state.md`). Reordering seeds,
or adding and removing teams, re-applies the same choices to the new pots: it does not
reshuffle. Only **Redraw** in Settings makes a new seed number. Changing the draw or
redrawing regenerates the division's pools and fixtures exactly as a seed reorder does, so
both are refused once the tournament has started or the division has a result.

The draws are `drawPools` in `api/src/utils/poolDraw.js`. The knockout pairing still uses
`populateGroups` directly and is unaffected by the choice.

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

A knockout match must have a winner. The server refuses to end one — including the 3rd
place playoff and placement matches, which sit inside a knockout round — with the sets
level (`KNOCKOUT_NEEDS_WINNER`), and the score dialog does not offer it. Cancelling a
knockout match stays allowed: see "A cancelled knockout match" below. Pool and League
matches may still end level.

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
- setOutcomes — how the team's completed matches finished, keyed by the scoreline from
  its own perspective (`"2-0"`, `"2-1"`, `"1-2"`, `"0-2"`) with a count against each

`setOutcomes` is a counter and nothing more. It is **not** a ranking criterion and must
never enter the chain below. Its keys are whatever the fixtures produced — a division of
best-of-five matches yields six of them — because rounds carry no match-format key to
assume one from; see `docs/division-state.md`. A match whose set counts are level is
excluded from won and lost, and is excluded here too rather than given a key of its own,
so a team's counts sum to its played total minus any level matches.

### Ranking order

Applied in sequence. Move to the next criterion only when the current one ties.

1. **The division's ranking method**, descending. The organiser chooses one:
   - **Wins** — match wins (the default) or set wins, in total.
   - **Points** — a number of match points for each of the four ways a match can end:
     a win in straight sets, a win in the deciding set, a loss in the deciding set, a
     loss in straight sets. A deciding set is one where the loser took at least one set
     and the margin is one (3-2, 2-1). Everything else is "straight", including 3-1 and
     a single-set match. Each number is a whole number from 0 to 10. FIVB (3·2·1·0) and
     Simple (2·2·1·0) are presets that fill the numbers in and nothing more.
2. **The division's tiebreak deciders**, an ordered list the organiser chooses, each
   applied only when everything above it ties. The default is set ratio, point ratio,
   head-to-head.
3. **Seeding** — position in `state.teams`, ascending. The top seed wins the tie. It is
   always last. It is not in the stored list and cannot be removed or moved.

Because seeding is a total order over the division, step 3 always resolves. Standings
are never ambiguous and never depend on team names.

### Tiebreak deciders

| Key | Definition | Better is |
|---|---|---|
| `SET_RATIO` | sets won ÷ sets lost | higher |
| `POINT_RATIO` | points won ÷ points lost | higher |
| `HEAD_TO_HEAD` | the result between the tied teams | the winner |
| `SET_DIFFERENCE` | sets won − sets lost | higher |
| `POINT_DIFFERENCE` | points won − points lost | higher |
| `POINTS_SCORED` | total rally points won | higher |
| `SETS_WON` | total sets won | higher |

A decider appears at most once. The list may be empty, which leaves seeding to settle
every tie.

### Where the rules are stored

The method and the deciders are `state.rankingRules` — see `docs/division-state.md`. A
division whose state has no such key has never had its rules edited, and its rules are
derived from the older `divisions.ranking_basis` column:

| `ranking_basis` | Method | Values |
|---|---|---|
| `MATCHES_WON` | Wins | match wins |
| `SETS_WON` | Wins | set wins |
| `FIVB_POINTS` | Points | straight win 3, deciding win 2, deciding loss 1, straight loss 0 |
| `SIMPLIFIED_POINTS` | Points | straight win 2, deciding win 2, deciding loss 1, straight loss 0 |

All four use the default deciders: set ratio, point ratio, head-to-head. Once rules are
saved for a division, `state.rankingRules` is authoritative and the column is no longer
read for it.

### Undefined ratios

A team that has won sets but lost none has an undefined set ratio (division by zero).
Treat it as tied with any other undefined set ratio and fall through to the next decider.
The same applies to an undefined point ratio.

A team with no completed matches has both ratios at zero, not undefined.

### Head-to-head

Only applied between the teams still level on the ranking method and on every decider
above head-to-head in the list. Compare the results of the matches those teams played
against each other. Two teams that never met, or that are level in the matches they
played, are not separated by it and go on to the next decider.

If three or more teams are level and their head-to-head results form a loop — A beat B,
B beat C, C beat A — head-to-head cannot resolve it. Do not attempt a mini-league.
Skip head-to-head **for that group of teams** and carry on with the deciders below it,
then seeding. With the default order nothing is below it, so the group falls straight
through to seeding.

**Worked example.** Wins by matches, deciders in the order head-to-head, point
difference. Seeded A, B, C, D. A, B and C each won two matches and D none. A beat B,
B beat C and C beat A. Point differences: A +9, B +3, C +12.

1. Match wins put A, B and C level, above D.
2. Head-to-head is first in the list, so the level group is A, B, C. Their results loop,
   so head-to-head is skipped for the three of them.
3. Point difference is next: C (+12), A (+9), B (+3).

The table reads C, A, B, D. Seeding was never reached. Had C lost to A instead, there
would be no loop: A beat both, B beat C, and head-to-head alone gives A, B, C.

### Forfeits

There is no forfeit status. A forfeit is recorded by the organiser as an ordinary
completed match with a scoreline reflecting the forfeit. Getting this right is left to
the organiser's discretion.

`CANCELLED` is not a forfeit. It means the match was not played and does not count.

In a knockout round a walkover — one team cannot play — is entered the same way, as a
winning score for the team that goes through. When neither team can play, the match is
cancelled: a double forfeit. See "A cancelled knockout match" below.

## Progression Between Rounds

At the end of a round, teams are ranked and written to that round's `results` array.
The next round's `groups` hold integer indices into it. This is what lets knockout
fixtures exist before the teams that will play them are known.

### From a round-robin round

`results` is a single flat list spanning every pool in the round, ordered by **pool
position first, then by ratios**:

1. Teams are grouped into tiers by pool position — all pool winners, then all
   runners-up, and so on.
2. A tier that fits entirely within the qualifying places is taken in **pool order**:
   A1, B1, C1, D1, then A2, B2, C2, D2. Nothing is compared across pools.
3. Only the one tier that cannot be filled cleanly — the tier the qualifying places run
   out inside — is compared across pools, and only the places that remain are taken
   from it.

Cross-pool comparison uses the same chain as in-pool standings: the ranking method, then
the division's deciders in order, then seeding. Head-to-head is skipped across pools,
wherever it sits in the list, since teams from different pools have usually not played
each other.

**Worked example.** Four pools, ten qualifiers. The first eight places are the pool
winners and the runners-up, in pool order: A1, B1, C1, D1, A2, B2, C2, D2. Places nine
and ten are the two best third-placed teams, compared across the four pools — so they
may both come from the same pool.

This produces a seeded list where index 0 is the strongest qualifier, which is why
semifinals are expressed as `[0, 3]` and `[1, 2]`.

**The consequence an organiser notices.** Under pool order, `populateGroups(4, [0..7])`
folds the qualifiers into `[0, 7] [1, 6] [2, 5] [3, 4]` — A1–D2, B1–C2, C1–B2, D1–A2.
No first-round knockout match is ever contested by two teams from the same pool.

### From a knockout round

`results` is **one team per group, in group order** — the bye team for a one-team group,
the match winner for a two-team group — **followed by the losers, in match order.**

"Winners first, then losers" is the power-of-two special case of that rule: with no byes
every group is a match, so group order and match order are the same thing.

An uneven round is built as one-team groups for the teams going straight through, then
the matches. A Round of 12 therefore produces twelve results: the four bye teams, then
the four winners, then the four losers — and the quarter-finals draw the right eight. A
bye team is in no match, so it can never be a loser.

Within each half teams keep the order of the groups or matches they came from, so the
next round's fold produces a fixed bracket. E.g. the winner of quarterfinal 1 will play
the winner of quarterfinal 4.

For a semifinal round this gives `[winner1, winner2, loser1, loser2]`, so the following
round expresses the bronze match as `[2, 3]` and the final as `[0, 1]`.

Every place is fixed: each group takes one winner place and each match one loser place.
A place nobody fills holds `null` instead of closing up, because closing up moves every
later team a place along — which once sent a beaten quarterfinalist into the semifinals
against the team that had beaten it. A knockout match recorded as finished with the sets
level (possible only in data from before the score endpoint refused it) stops
progression with `KNOCKOUT_MATCH_UNDECIDED`, a 409 naming the match, rather than being
skipped.

### A cancelled knockout match

A cancelled knockout match is a double forfeit: neither team goes through.

- Its winner place and its loser place are both `null`. Its two teams follow the losers
  in `results`, past every place the next round reads, so they are ranked as eliminated
  in that round — below every team that played its match in that round and lost.
- The next round's match that place feeds is bound short of a team, and a match short of
  a team is a **walkover**: there is nothing to play, so progression stores it as
  `CANCELLED` as it binds it. A cancelled knockout match with one team in it sends that
  team through, with an empty loser place; one with no team sends nobody.
- Nobody is pulled in from another match. With quarterfinal 1 cancelled, the semifinal
  its winner would have played is a walkover for the winner of quarterfinal 2.
- The gaps carry on as far as they reach: a walkover semifinal has no loser, so the 3rd
  place playoff it feeds is a walkover too.
- The organiser may fill an empty place before confirming, with any team that played the
  round, as with any other substitution. A walkover counts as neither a win nor a loss.

The Finals round is walked with the playoff included: the 3rd place playoff's own round
name is `"3rd Place Playoff"`, but it is one of the Finals round's two groups, so
anything matching fixtures to that round must accept it.

### A two-team knockout still consumes four ranks

Unless the division is set to final only (see "Placement matches"), a knockout stage of
two teams generates a bronze match as well as a final, so the Finals
round holds `groups: [[2, 3], [0, 1]]` — the playoff first, as `createClassicState`
unshifts it onto the front. It therefore needs **four ranks, not two**, for a division
configured with `knockout_teams: 2`.

Anything reasoning about how many teams a knockout round needs **derives the count from
that round's `groups`, as one past the largest index they reference** — here `3 + 1 = 4`.
It is never read from a stored key and never inferred from the round's name or from the
configured knockout size. There is no `qualifyingTeams` key on a round: none has ever
been written, and `state` is JSONB that no migration reaches, so deriving is the only
approach that works on divisions that already exist.

### Placement matches

By default a knockout decides 1st to 4th by play — the final and the 3rd-place playoff —
and every other knockout team is ranked by the tiebreak for the round it went out in. A
Classic division's `placement_depth` extends play down to that place: an odd rank `N`
means the match for `N` and `N + 1` is played, and so is everything needed to reach it.

- The teams knocked out of one round form a **tier** with the places between them: the
  Quarterfinals' losers play for 5th to 8th. A tier plays its own bracket, drawn with the
  same fold as the winners' — the loser of match 1 meets the loser of the last match —
  and, if uneven, byes its strongest teams exactly as a Round of 6 does.
- A tier's teams are ordered strongest first. Losers in match order are the reverse —
  the fold pairs best with worst, so the loser of match 1 lost to the top seed — so the
  list is reversed before drawing. No pairing changes; only which end receives the byes.
- Each round of a tier's bracket splits it: winners play on for its upper places, losers
  for its lower ones. A part entirely below the depth is not played, and its teams are
  ranked by the tiebreak as before.
- A tier's matches start in the round after it forms. Every placement **final** is played
  in the last round, alongside the 3rd-place playoff; a pair ready earlier waits in
  one-team groups, the way a bye already carries a team on. A tier of one needs no final
  and is placed when it reaches the last round.
- Placement groups are ordinary knockout groups after the round's own, holding indices
  into the previous round's results, so progression confirms and binds them like any
  other. They are ordered by the places they play for, best first, which keeps every
  unplayed team at the tail of the results, so what progression confirms is exactly what
  later rounds reference.

Nothing about places 1 to 4 changes. With no depth set the draw is exactly what it was.

**Final only.** A `placement_depth` of 1 removes the 3rd-place playoff: the Finals round
holds the final alone, `groups: [[0, 1]]`, and needs two ranks. The semifinal losers are
then ranked 3rd and 4th by the tiebreak for the round they went out in, like any other
unplayed place. The settings offer the place each match is played for — 1st (final
only), 3rd (the default, stored as null), 5th, 7th and so on up to the knockout's size.
A two-team knockout has no semifinal losers, so final only is not offered for it and the
server refuses it (`INVALID_PLACEMENT_DEPTH`).

The 3rd-place playoff is recognised by what it holds, never by its position in the round:
the final is always `[0, 1]`, the two semifinal winners, so the Finals round's other own
match is the playoff. That match is `[2, 3]` by default and holds higher indices when the
semifinal round also carries placement groups.

### Qualification

The number of teams advancing is the count derived from the next round's `groups`. When
it is not a multiple of the pool count, the guaranteed places are filled first — the top
`floor(count / poolCount)` from every pool — and the remaining places go to
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

A partial schedule is legal, so an earlier round may be entirely unplaced. The server
measures the constraint against every earlier round that *has* been placed, not only the
immediately preceding one. The generator is stricter. Since 2026-09-24 it places no
fixture of a round until every fixture of the earlier rounds has been placed, so a
knockout round is left out rather than scheduled ahead of a pool match that could not
be placed.

### A team gets its minimum rest between matches

A minimum gap between a team's two matches on the same day, set by the organiser and
one match length by default. Settled 2026-08-11 as a hard constraint. Revised
2026-09-24: it is now the organiser's rule. It can be switched off, and when the
organiser allows it the generator bends it to fit a fixture that has nowhere else to go.
It bends as few times as possible and never twice for one team where once for another
would do. Every bend is reported after generating. With bending off, a tight tournament
reports the fixture it cannot place rather than placing it against a team that has just
come off court.

Only the generator enforces it. The server accepts a hand-placed back-to-back match,
because the organiser may have a reason — a walkover, a team that asked for it — and
`docs/schedule.md` is clear that the server rejects the impossible rather than judging
whether a schedule is good.

**It cannot apply across the pool-to-knockout boundary.** A semifinal's teams are not
known until pool play has finished, so the generator has nobody to give rest to and will
place a semifinal in the slot immediately after the last pool match. The round-order rule
above still holds, so the match is playable, though it may not be kind. The organiser
can switch on "Break before knockout rounds" in the generator settings. The generator
then holds each knockout round back that long after the round before it ends. Recorded
in `docs/known-limitations.md`.

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
- `tourganiser-ui/src/components/NextRoundModal.jsx` still computes qualifiers in the
  frontend, with the two bugs recorded in `docs/known-limitations.md`. It should be
  replaced by calls to the progression endpoints.
