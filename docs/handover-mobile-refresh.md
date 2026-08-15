# Handover — Mobile Refresh And Style Foundations

Written 2026-08-11, revised the same day to fold in the token and extraction work. Eight
steps. Delete when complete; the durable record is `docs/architecture.md` and
`docs/roadmap.md`.

Three jobs, deliberately kept as separate steps because they are different kinds of
change:

- **Spacing and stacking tokens.** The foundation the rest sits on, and the z-index half
  fixes two live bugs.
- **Less wasted space on mobile.** The change that was actually asked for, which becomes
  cheap once the tokens exist.
- **The schedule maker on a phone.** Not a spacing problem at all.

## Risk

**Low** for steps 1, 2 and 4 — presentation only, and step 1 changes nothing visible.
**Medium** for step 3, which changes stacking order across the whole application, and for
steps 6 and 7, which change how the schedule maker is operated on small screens.

This document is the explanation, affected-file list and risk assessment the process
requires. Confirm before starting.

Risks:

- Step 2 touches 626 declarations across three stylesheets. Done by hand and by eye it
  will be applied inconsistently, which is why step 1 comes first.
- Step 3 moves every modal, toast and overlay in the application onto a new scale. Getting
  an ordering wrong hides something behind something else, and the failure is silent.
- Anything tapped has a 44px floor established by the tournament view. A spacing pass is
  exactly the change most likely to breach it.

## How to use this document

One step per session. Steps 1 to 4 are sequential — step 4 is only cheap because 1 and 2
came first. Steps 5 to 7 are the schedule maker and must run in that order, since 5 moves
the rules the other two edit. Step 8 verifies everything.

Do not re-inspect anything the facts section states. Read only the files a step names.

Each **Do** is intent plus constraints. Each **Verify** is the contract.

---

## A. Established facts

### A1 — What the stylesheets look like

| File | Lines | `padding` / `margin` / `gap` declarations |
|---|---|---|
| `src/App.css` | 3,915 | 361 |
| `src/styles/tournament-view.css` | 1,734 | 148 |
| `src/styles/create-tournament.css` | 1,150 | 117 |

**There are no spacing tokens.** All 626 declarations are hardcoded pixels. `:root` in
`App.css` defines colours, fonts and breakpoint values, and nothing else.

The values cluster, but not on a scale — which is the evidence that none exists:

```
115 × 10px    94 × 20px    80 × 12px    61 × 8px     54 × 16px
 35 × 6px     33 × 14px    26 × 24px    25 × 18px    21 × 4px
 21 × 40px    16 × 5px     15 × 15px    13 × 30px
```

10 against 12, 14 against 16, 18 against 20, 30 against 32 — near-duplicates carrying no
meaning, each chosen one rule at a time.

**The three sheets are not in equal shape.** `tournament-view.css` and
`create-tournament.css` are recent, consistently prefixed and commented. `App.css` is four
things wearing one filename: the application chrome, the older pages, a residue of dead
classes from the old tournament view, and roughly **116 rules of schedule maker** —
the only major component that never got its own stylesheet. Its largest families:

```
48 × .schedule-maker   30 × .tournament-card   28 × .schedule-grid   15 × .schedule-export
12 × .browse-group     11 × .schedule-panel    11 × .overview-tab     8 × .team-card
```

`.overview-tab` is dead — it belonged to the old tournament view. Around 70 unreferenced
classes remain in `App.css`; `docs/known-limitations.md` records why they were not swept
with the rest and why the list cannot be trusted as a deletion list.

### A2 — Every z-index in the application

Fourteen values spanning fifteen orders of magnitude, for about seven conceptual layers:

| Value | Used by |
|---|---|
| `2`, `3` | `.feature-card::after`, `.feature-content`, `.schedule-grid-entry` |
| `10` | `.site-footer`, `.team-name-change` |
| `1000` | `header`, `.help-button` |
| `1001`, `1002` | `.help-menu-container`, `.menu-bar.open`, `.menu-bar-content` |
| `-1` | `.menu-bar`, `.menu-bar.close` |
| **`5`** | **`.modal-overlay`, `.modal-backdrop`** |
| `1100` | `.schedule-maker-backdrop`, `.ct-modal-backdrop` |
| `1200` | `.confirm-backdrop` |
| `2000`, `2001` | `.login-popup`, `.theme-toggle-login` |
| `10000` | `.message-popup` |
| `1000000` | `.tooltip-box` |
| `1000000000000000` | `.loading-container` |

### A3 — Two modals are still cut off, and nobody has noticed

`.modal-backdrop` and `.modal-overlay` sit at **z-index 5**, beneath the site header
(1000) and the footer (10). That is the fault that cut the schedule maker off at both
ends. It was fixed **for that modal only**, by portalling it and giving it its own
backdrop class at 1100.

Two modals still have it:

| Modal | Backdrop | Portalled | Status |
|---|---|---|---|
| `ScoreUpdateModal` | `.modal-overlay` (5) | no | **cut off by the header and footer** |
| `NextRoundModal` | `.modal-backdrop` (5) | no | **cut off by the header and footer** |
| `ConfirmDialog` | `.confirm-backdrop` (1200) | no | above the chrome, so unaffected |
| `ScheduleMakerModal` | `.schedule-maker-backdrop` (1100) | yes | fixed |
| `CreateModal` | `.ct-modal-backdrop` (1100) | yes | fixed |

Score entry and round progression are both mounted from `pages/View.jsx`. On a tall
desktop viewport a small centred modal can sit entirely between the header and the footer,
which is why this has gone unreported — but on a short viewport or a phone it will be
clipped. Since this handover is about mobile, it is in scope.

### A4 — Breakpoints

`768px` is the real one, used 19 times, plus single uses of `900px` and `1200px`, four
`min-width: 768px` rules, and **one stray `max-width: 767px`** at
`create-tournament.css:1111`, leaving a one-pixel band where neither applies. Fix it in
passing.

The `--mobile-breakpoint` / `--tablet-breakpoint` / `--desktop-breakpoint` tokens say
480/768/1024 and do not describe what the stylesheets use. Do not start using them.

### A5 — What must not shrink

- **44px minimum on anything tapped**, established by the tournament view's responsive
  pass — eight places in `create-tournament.css`, one in `tournament-view.css`.
- **The three sanctioned scrollers** — `.tv-nav-list`, `.tv-table-scroll`,
  `.tv-bracket-scroll`. `docs/architecture.md` records the pattern and the audit method: a
  container with `overflow-x: hidden` turns overflow into silently clipped content rather
  than a scrolling page, so compare each descendant's right edge against its container
  rather than trusting `scrollWidth`.

### A6 — Why the schedule maker is unusable on a phone

**The three panels stack.** At `max-width: 900px`, `.schedule-maker-layout` becomes
`grid-template-columns: 1fr`, so the fixture sidebar, the board and the inspector sit one
above another, each carrying `min-height: 280px`. That is 840px of minimum content inside
a modal that is `height: 100vh` at 768px and has already spent height on a header and a
toolbar. The board — the thing being worked in — ends up a 280px window reached by
scrolling past the other two.

**The grid cannot scroll sideways.** `.schedule-grid-body` sets `overflow-y: auto` and
nothing for the x axis. With `96px repeat(courts, minmax(0, 1fr))`, three courts on a
320px screen leaves about 75px each, and an entry card carries two team names and a
division label. It becomes illegible rather than scrollable — the one thing every other
wide surface in the application avoids.

**Nothing can be focused.** All three panels compete for the same vertical space at once.

---

## B. Decisions already made

- **A spacing scale, not 626 hand edits.** Define tokens, adopt them, then tune mobile in
  one place. The requested change becomes a handful of numbers, and it is reversible.
- **A z-index scale**, because the alternative has already produced one bug and is
  currently hiding two more.
- **The schedule maker gets its own stylesheet**, following the pattern the tournament
  view and creation redesigns established.
- **The schedule maker gets an interaction change on mobile**, not a layout squeeze.
- **The schedule grid becomes a fourth sanctioned scroller.**

## C. Non-goals

- No change to colours, typography, radii, shadows or component structure. Tokens for
  those may follow; they are not this.
- No shared card or button abstraction. Cards here genuinely differ, and extracting one
  then fighting it with overrides is worse than two honest rules.
- No CSS modules or build-step change. `docs/architecture.md` records "Plain CSS only",
  and departing from it is an architecture decision rather than a refactor.
- No sweep of the ~70 dead `App.css` classes. The reason they were left still applies.
- Not the standings work — that is its own piece.

---

## Step 1 — Define the scales

**Files:** `src/App.css`.

**Do**

Add two scales to `:root`.

**Spacing**, on a 4px base — 4, 8, 12, 16, 24, 32, 40 — with a `max-width: 768px` block
redefining the same tokens. **Set the mobile values identical to the desktop ones for
now.** This step must change nothing visible; it exists so step 4 has one place to edit.

**Stacking**, as named layers rather than numbers. Roughly the seven that A2 shows already
exist in practice: base content, raised content, page chrome, the menu above it, modal
backdrops, confirmations above modals, then toasts, tooltips and the loading screen. Leave
generous gaps between layers so a future insertion does not need a renumbering.

Name spacing tokens by size and stacking tokens by role. A token called
`--space-card-padding` invites an argument about what counts as a card; `--space-4` does
not. Conversely `--z-1100` tells you nothing, where `--z-modal` tells you everything.

**Don't** touch any existing declaration yet, and don't use the `--mobile-breakpoint`
tokens (A4).

**Verify** the application is pixel-identical before and after. If anything moved, the
scale was applied rather than defined.

---

## Step 2 — Adopt the spacing scale

**Files:** `src/App.css`, `src/styles/tournament-view.css`,
`src/styles/create-tournament.css`.

**Do**

Replace hardcoded spacing with tokens, snapping each value to the nearest step and
**preferring the smaller when it falls between two**. That bias is deliberate — it removes
a little whitespace everywhere, which is the direction the whole piece is going.

Expect shifts of up to 2px on individual rules: 10 to 8, 18 to 16, 30 to 32. That is the
cost of having a system, and it is why this is separate from step 1.

Work sheet by sheet, layout-level spacing first — page padding, section gaps, card
padding, list gaps. That is where wasted space lives. Fine detail inside a component
matters less and may keep its literal value where snapping looks worse.

Fix the stray `max-width: 767px` at `create-tournament.css:1111` while in that file.

**Don't** snap a value doing structural work rather than spacing — a 96px grid column, a
44px tap target, a 1px border or gap. The scale is for whitespace.

**Verify** lint and build clean, and the application essentially unchanged — a couple of
pixels, nothing reflowed. Check one page per stylesheet: Browse, a tournament view, the
creation page.

---

## Step 3 — Adopt the stacking scale, and fix the two clipped modals

**Files:** `src/App.css`, `src/styles/tournament-view.css`,
`src/styles/create-tournament.css`, `src/components/ScoreUpdateModal.jsx`,
`src/components/NextRoundModal.jsx`.

**Do**

Replace all fourteen z-index values with the named layers from step 1. This is not
snapping — each value has to be assigned to the layer it belongs to, which is a judgement
about what should sit above what. A2 has the full inventory.

The existing values already encode a mostly sensible order — confirmations above modals,
toasts above those, the loading screen on top. Preserve that order; replace only the
numbers.

**Then fix what the scale exposes.** `ScoreUpdateModal` and `NextRoundModal` are not
portalled and use backdrops at z-index 5, beneath the header and the footer. Give them the
same treatment `ScheduleMakerModal` and `CreateModal` already have: rendered through
`createPortal` onto `document.body`, on the modal layer. Read the top of
`ScheduleMakerModal.jsx` — it carries a comment explaining exactly this and is the pattern
to copy.

`.modal-overlay` and `.modal-backdrop` should end up on the modal layer, so nothing
inherits the old fault.

**Don't** leave a bare number behind. One hardcoded z-index is all it takes for the next
person to add another beside it.

**Verify**

- Open score entry and round progression on a **short** viewport — 700px tall or less —
  and confirm neither is clipped at the top or the bottom.
- A confirmation raised from inside a modal still sits above it.
- Toasts appear above modals; the loading screen above everything.
- The menu, the help button and the header still stack as before.
- No `z-index` remains in any stylesheet that is not a token.

---

## Step 4 — Tune mobile

**Files:** `src/App.css`.

**Do**

The change that was actually asked for, and by now a handful of numbers in the
`max-width: 768px` block from step 1.

Step the larger tokens down so elements can be bigger and less space is wasted. The small
end of the scale is already tight — reducing 4px and 8px costs legibility and buys almost
nothing, so leave them.

Judge it on real pages at 320px and 390px, not on the numbers.

**Don't** breach the 44px floor (A5). If a control gets too small, that is a `min-height`
on the control, not a larger spacing token.

**Verify** at 320, 390 and 768: content visibly larger relative to its surroundings,
nothing touching an edge, no tap target under 44px, no page scrolling horizontally.

---

## Step 5 — Give the schedule maker its own stylesheet

**Files:** `src/App.css`, new `src/styles/schedule-maker.css`,
`src/components/ScheduleMakerModal.jsx`.

**Why now:** steps 6 and 7 edit these rules. Moving them first means those steps touch one
focused file rather than hunting through 3,915 lines.

**Do**

Move the schedule maker's rules out of `App.css` into `styles/schedule-maker.css`,
imported by `ScheduleMakerModal.jsx` — the same arrangement `tournament-view.css` and
`create-tournament.css` already use.

The families to move are in A1: `.schedule-maker*`, `.schedule-grid*`, `.schedule-panel*`,
`.schedule-list*`, `.schedule-form*`, `.schedule-export*`, plus the `@media print` block
keyed on `body[data-print-schedule]` and the schedule maker's own media-query rules at
1200px, 900px and 768px.

**Move them, do not rewrite them.** This step should produce an identical rendering. Any
improvement belongs in step 6 or 7 where it can be verified on its own.

Keep the `schedule-` prefix. It is already distinct from `tv-` and `ct-`, and renaming
would put this step at risk for no gain.

**Don't** move `.tournament-card`, `.browse-group` or anything else that shares `App.css`
for a different reason. And check before moving a rule that the export template or another
component does not also use it — `scheduleExport` and the print stylesheet both reach into
these classes.

**Verify** the schedule maker and its print output render identically before and after,
`App.css` is around 116 rules shorter, and nothing else on any page changed.

---

## Step 6 — Schedule maker: one panel at a time

**Files:** `src/components/ScheduleMakerModal.jsx`, `src/styles/schedule-maker.css`.

**Do**

Below 900px, stop stacking the three panels. Give the modal a switcher — a segmented
control or tabs — so Fixtures, Board and Inspector each take the available height when
selected, with one visible at a time.

Default to the board: it is what the organiser came for; the other two are things they
reach for.

Selecting an entry should bring the inspector forward, or the organiser will tap a fixture
and see nothing happen. Placing or moving one should return them to the board.

The desktop layout is unchanged. This is a small-screen presentation, not a redesign.

**Don't** remove the `min-height: 280px` rules without checking what they protect at
tablet widths, where the single-column stack is still reasonable.

**Verify** at 320px: each panel fills the screen when selected, the modal does not scroll
as a whole, tapping an entry opens the inspector, and saving still works from the header.

---

## Step 7 — Schedule maker: let the grid scroll

**Files:** `src/styles/schedule-maker.css`, `docs/architecture.md`.

**Do**

Give the court columns a minimum width — enough for a two-line entry card to read — and
let `.schedule-grid-body` scroll horizontally when they do not fit. The time column should
stay put while the courts scroll, so it stays possible to tell which row is which.

This makes the grid the fourth sanctioned scroller. Add it to the list in
`docs/architecture.md` alongside `.tv-nav-list`, `.tv-table-scroll` and
`.tv-bracket-scroll`, with the same reasoning: inherently wide content, better scrolled
than shrunk.

**Don't** let the horizontal scroll escape to the page. The modal contains it.

**Verify** at 320px with three courts: each column wide enough to read, the grid scrolls
sideways within the modal, the page itself does not, and the time column stays visible
while scrolling.

---

## Step 8 — Audit

**Do**

One pass at 320, 390, 768 and 1200 across every page: Home, Browse, a tournament view on
all four tabs, the creation page with both modals open, the schedule maker on both views,
and score entry and round progression on a short viewport.

Use the method in `docs/architecture.md`: for every descendant, is its right edge past its
container's, and if so does it have an ancestor with `overflow-x: auto | scroll` between
them? If yes it is reachable by scrolling and legitimate; if no it is clipped. Walk the
ancestor chain generically rather than hard-coding the known scrollers — that is what
discovers a new one.

There should now be four legitimate scrollers, not three.

**Verify** zero clipped elements at every width on every page, no page scrolling
horizontally, no tap target below 44px, and no modal clipped by the chrome.

---

## Final validation

1. `npm run lint`, `npm test` and `npm run build` in `tourganiser-ui/` — lint unmoved from
   its baseline of 5.
2. The step 8 audit, clean.
3. Create a tournament on a phone-sized viewport, end to end.
4. Open the schedule maker on a phone-sized viewport, generate a schedule, move a fixture,
   add a break, and save.
5. Enter a score and advance a round on a short viewport, confirming neither modal is
   clipped.
6. Desktop unchanged beyond the couple of pixels step 2 implies.

Fix what this turns up. Make no unrelated changes.
