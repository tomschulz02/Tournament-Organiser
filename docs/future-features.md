# Future Features

Ideas and planned work. Do not implement anything listed here unless explicitly
requested.

## Configurable Ranking Basis

Pool position is currently decided by matches won, hardcoded. The organiser should be
able to choose the basis per division:

- Matches won (current, and the default)
- FIVB match points — 3 for a 3-0 or 3-1 win, 2 for a 3-2 win, 1 for a 2-3 loss, 0 otherwise
- Simplified match points — 2 for any win, 1 for a loss in a deciding set, 0 otherwise
- Total sets won

Only the first criterion in the ranking chain would change. The tiebreakers in
`docs/tournament-rules.md` stay as they are.

Needs a place to store the choice on the division, and the standings builder to read it
rather than assuming matches won.

## Other Candidates

- Live scoring
- Statistics
- Public tournaments
- Officials management
- Improved scheduling
- Stream integration
- Forfeit as a first-class fixture status, rather than relying on the organiser
  recording a nominal scoreline by hand
