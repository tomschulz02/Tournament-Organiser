# Handover — Fixture Row Layout

Written 2026-08-16. Six steps. Delete when complete; the durable record is
`docs/roadmap.md`.

The fixture row becomes a three-column card on desktop and a three-band card on mobile.
This replaces the aligned-columns treatment introduced earlier — the new design gets its
alignment from fixed-width columns instead, so the subgrid that provided it is superseded
rather than adapted.

## Risk

**Low to Medium.** Presentation only — no data, no endpoints, no business logic. It is
Medium rather than Low because `FixtureRow` is the most repeated element in the
application, it is shared by both states of the Fixtures & Schedule tab, and the change
removes a mechanism that a previous piece of work put in deliberately.

This document is the explanation, affected-file list and risk assessment the process
requires. Confirm before starting.

Risks:

- Removing the subgrid removes the thing that currently aligns division badges and round
  labels down the list. Step 2 must replace that alignment, not just delete it.
- The status dot and its visually hidden label are the **only** encoding of fixture
  status. Losing either in the rebuild loses the status entirely, or loses it for anyone
  using a screen reader.

## How to use this document

One step per session, in order. Step 1 is pure and testable on its own; steps 2 and 3 are
the rebuild; 4 and 5 clear up after it.

Do not re-inspect anything the facts section states. Read only the files a step names.

Each **Do** is intent plus constraints. Each **Verify** is the contract.

---

## A. The layouts

Sections are drawn with rules below for clarity. **There are no dividing lines in the
design.**

### Desktop — three columns

```
| status ● · #12          |                              |        |
|                         |  Team One          2  25 25  |        |
| Court 1 · U18 · Pool A  |                              |   ✎    |
|                         |  Team Two          1  21 19  |        |
| Officials: J. Smith     |                              |        |
```

- **Left, fixed width.** Three stacked lines: status dot with match number; court,
  division and round; officials. Lines with nothing to show are absent, not blank.
- **Middle, flexible.** The main region, taking whatever width is left. Two rows, one per
  team, each with the team name and its score.
- **Right, fixed width.** The organiser action, vertically centred, an icon rather than a
  word.

### Mobile — three bands

```
| status ● · #12    |   Court 1 · U18 · Pool A |
| Officials: J. Smith                          |
|                                              |
| Team One                    2      25 25     |
|                                              |
| Team Two                    1      21 19     |
|                                              |
|                    ✎ Edit                    |
```

- **Band one.** Status and match number on the left, court, division and round on the
  right. Officials full width beneath.
- **Band two.** The two team rows, as on desktop.
- **Band three.** The action, full width. It may carry its label here, where there is room.

### The score cell

Decided 2026-08-16: **sets won as the prominent figure, per-set scores small beside it.**
`Team One 2 25 25` means two sets won, having scored 25 and 25.

Both come from `fixture.result`, which is `[[teamOneScore, teamTwoScore], ...]`, one pair
per set.

---

## B. Established facts

### B1 — What the row is today

`components/tournament/FixtureRow.jsx`, one `<li>` per fixture. Its children are placed
**by class into a subgrid** of eight columns owned by `.tv-fixture-rows`:

```
status | match no | teams | court | division | round | outcome | action
```

`.tv-fixture-row-meta` is `display: contents` so its children participate directly. That
arrangement exists to align badges and round labels down the list, and it works — but the
new design achieves the same thing with a fixed-width left column, so **all of it is
superseded**: the list-level `grid-template-columns`, the row's `grid-template-columns:
subgrid`, every per-class `grid-column`, and the mobile block that restacks by column.

Do not preserve it alongside the new layout.

### B2 — Three call sites

| Caller | Passes |
|---|---|
| `FixturesTab.jsx:82` | `fixture`, `showDivision`, `action` |
| `ScheduleTab.jsx:137` | `fixture`, `showDivision`, `court`, `action`, `officials` — the scheduled entries |
| `ScheduleTab.jsx:162` | the same, for fixtures not yet placed |

**The unscheduled state has no court and no officials.** The left column then holds two
lines rather than three. That is not an error state and needs no placeholder.

### B3 — What must survive the rebuild

- **The status dot** — `.tv-status-dot--<status>`, `aria-hidden`, with
  `.tv-visually-hidden` text carrying `fixture.statusLabel` beside it. This is the only
  encoding of status: the row's left border is deliberately neutral, and the outcome
  column no longer shows a word. Losing the dot loses the status; losing the hidden text
  loses it for a screen reader. `docs/decisions.md` records why there is exactly one
  encoding.
- **`showDivision`** — the division badge appears only when the list spans more than one
  division.
- **The action slot** — rendered only when `creator` is true *and* a callback is supplied.
  `View.jsx` is the only supplier and it opens score entry.

### B4 — `formatResult` stays

`fixtureUtils.js` exports `formatResult`, which joins a result into `"25-21, 25-19"`.
`FixtureRow` will stop using it — but **`BracketView` still does**, so it must not be
deleted.

Unrelated but worth knowing: `OverviewTab.jsx` defines its **own private copy** of
`formatResult` rather than importing the shared one. Two implementations of the same
formatting. Out of scope here; do not let a third appear.

### B5 — Breaks

`ScheduleTab.jsx` renders breaks with `BreakRow`, which reuses the fixture row's classes —
`tv-fixture-row`, `tv-match-no`, `tv-fixture-row-teams`, `tv-fixture-row-meta`,
`tv-fixture-row-outcome` — for a thing with a title, a court and a time range, and no
teams, score or officials.

Decided 2026-08-16: breaks get **their own markup**, sharing the card's surface and border
treatment but not its three-column match layout.

### B6 — Constraints from earlier work

- **44px minimum on anything tapped.** The action is the only tap target in the row.
- **Spacing tokens.** `--space-1` to `--space-7` on a 4px base, stepped down below 768px.
  Use them rather than literal pixels.
- **`Icons.jsx` has an `edit` icon.** Use it rather than adding one.
- **No bare `<header>`, `<main>` or `<img>`** — `App.css` styles them as element
  selectors. See `docs/architecture.md`.

---

## C. Non-goals

- No change to what a fixture row contains, beyond the score presentation. This is
  arrangement.
- No change to the tab's filters, grouping, or the schedule's day sections.
- No change to `BracketView` or `OverviewTab`.
- No change to when the action appears. Gating it on `Ongoing` is a separate roadmap item.

---

## Step 1 — Score helpers

**Files:** `components/tournament/fixtureUtils.js`, `test/fixtureUtils.test.js`.

**Do**

Add two pure helpers: one giving each team's **sets won** from a result, and one giving
each team's **per-set scores**. Both take the `[[a, b], ...]` shape and return a value per
team, so the row can render two team lines without recomputing anything.

A set with equal scores counts as won by neither team — `docs/tournament-rules.md` says so,
and `applyFixtureToStandings` already behaves that way. Match it, so the row and the
standings table never disagree about who won a set.

An empty or missing result yields no sets and no scores, not zeroes. An unplayed fixture
should render nothing in its score cells, not `0`.

`tourganiser-ui` has Vitest covering the pure modules. These belong there.

**Don't** touch `formatResult` (B4).

**Verify** a three-set result gives 2 and 1 sets and the right per-set scores for each
team; a drawn set counts for neither; an empty result yields nothing.

---

## Step 2 — The desktop layout

**Files:** `components/tournament/FixtureRow.jsx`,
`styles/tournament-view.css`.

**Do**

Rebuild the row as the three columns in section A: fixed left, flexible middle, fixed
right.

The left column's fixed width is what replaces the subgrid — with every row's left column
the same width, the court, division and round line up down the list by construction. Pick
a width that suits the longest realistic round name; the alignment is the point.

The middle column is the main region and takes the remaining width. Two team rows, each
with the name and the score cell from step 1 — sets won prominent, per-set scores small
beside it. Long team names truncate; the score cell must not be pushed out.

The right column holds the action as an **icon**, using `Icons.jsx`'s `edit`. Since the
word goes, it needs an accessible name — a label on the control, not a `title` alone.

Remove the subgrid machinery as you go (B1). Removing the list-level template and keeping
the row's `subgrid` would leave the row with no columns at all.

**Don't** lose the status dot or its hidden label (B3). **Don't** add dividing lines
between the three columns — the sketch's rules are illustration only.

**Verify** at 1200px: division and round line up down a list of mixed round names; a
long team name truncates without displacing the score; an unplayed fixture shows empty
score cells and no officials line; the action is an icon with an accessible name.

---

## Step 3 — The mobile layout

**Files:** `styles/tournament-view.css`.

**Do**

Below 768px, the three columns become the three bands in section A: meta, teams, action.

Band one puts status and match number opposite court, division and round, with officials
full width beneath. Band two is the two team rows unchanged. Band three is the action,
full width — it may carry its label here, where there is room for it.

The old mobile block restacked the subgrid by column and goes entirely with it.

The action needs its 44px floor. Nothing else in the row is tapped.

**Verify** at 320px and 390px: nothing overflows, the officials line wraps rather than
pushing anything sideways, the score cells stay beside their team names, and the action is
at least 44px.

---

## Step 4 — Breaks get their own row

**Files:** `components/tournament/ScheduleTab.jsx`, `styles/tournament-view.css`.

**Do**

Give `BreakRow` its own markup and its own classes. It shares the card's surface, border
radius and dashed treatment, and nothing else — a break has a title, a court and a time
range, and forcing it through a match layout means empty cells where teams and scores
should be.

Keep it visually a sibling of a fixture row, not a different species. It sits in the same
list.

**Don't** leave it depending on any `tv-fixture-row-*` class that step 5 is about to
delete.

**Verify** a day with two breaks and six fixtures reads coherently, and the breaks are
distinguishable from the matches at a glance.

---

## Step 5 — Clear up

**Files:** `styles/tournament-view.css`.

**Do**

Remove what the rebuild superseded: the list-level `grid-template-columns`, the row's
`subgrid`, every per-class `grid-column`, `.tv-fixture-row-meta { display: contents }`,
the cell margins that carried the column spacing, and the mobile block that restacked by
column.

Check each against the new markup before deleting. **A selector is dead when *any* class in
it is dead**, not when all of them are — that rule is what made the earlier `App.css`
sweep safe, and it is recorded in `docs/known-limitations.md`.

`.tv-fixture-row-outcome--status` is used by the old `BreakRow`; it goes with step 4 if
nothing else claims it.

**Verify** `npm run build` is clean and the rendering is unchanged by the deletions alone.

---

## Step 6 — Responsive check

**Do**

320px, 390px, 768px and 1200px, in both states of the tab — a tournament with no schedule
and one with a schedule, so the court and officials lines are exercised both present and
absent.

Use the method in `docs/architecture.md`: for every descendant, is its right edge past its
container's, and if so is there an ancestor with `overflow-x: auto | scroll` between them?
The fixture list is **not** a sanctioned scroller and must not become one.

**Verify** no clipped content at any width, no horizontal page scroll, and every action at
least 44px.

---

## Final validation

1. `npm run lint`, `npm test` and `npm run build` in `tourganiser-ui/` — lint unmoved from
   its baseline of 5, and the new helpers covered.
2. A multi-division tournament with a saved schedule: both tab states, at all four widths.
3. A fixture with a three-set result, one with a single set, and one unplayed.
4. A day containing breaks.
5. Confirm the status is still conveyed — a colour for a sighted reader and text for a
   screen reader — and that nothing else in the row encodes it.

Fix what this turns up. Make no unrelated changes.
