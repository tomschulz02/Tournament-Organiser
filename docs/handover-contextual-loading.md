# Handover: Contextual Loading Screens (1.0.1 hotfix, batch 6)

## 1. Risk declaration

Risk Level: **Low** (presentational — no business logic changes), but touches many
files, since loading states exist wherever the app waits on a request. The risk is
scope creep and inconsistency (a template built once but not actually adopted
everywhere), not correctness.

## 2. How to use this document

Step 1 (design the shared component) has to exist before Step 2 (adopt it everywhere)
can start, and Step 2 is naturally a page/file-at-a-time sweep — do it in whatever order
is convenient, verifying each site as you go rather than all at the end.

**The phrase bank in this document is a draft Tom has not yet approved as final wording
— check with him before treating the exact strings as fixed, though the mechanism
(contextual, rotating, full-page vs inline) is settled.**

## 3. Established facts

**Today there is exactly one loading component, used in very few places.**
`tourganiser-ui/src/components/LoadingScreen.jsx`:

```jsx
function LoadingScreen() {
	return (
		<div className="loading-container">
			<div className="lds-ring-container">
				<div className="lds-ring">
					<div></div><div></div><div></div><div></div>
				</div>
			</div>
		</div>
	);
}
```

No props, no text, one visual (a ring spinner via `.lds-ring`, styled in `App.css`,
`--z-loading` stacking layer). It takes no context and can't be customised per call
site. A search for its usage found only two files referencing it — `ScheduleMakerModal.
jsx` and itself — which is surprisingly few given how many places in the app wait on a
network request (tournament fetch on `View.jsx`/`Browse.jsx`/`Profile.jsx`, tournament
creation submit, score updates, round progression, schedule generation, team edits,
scoresheet generation). **Before building the new component, do a real search — grep
for `LoadingScreen`, for the `.loading-container`/`.lds-ring` classes directly, and for
any inline "Loading…" text or ad-hoc spinner markup — to find every current loading
state, not just the ones this document happens to name.** Some may render nothing at
all today (a blank gap while a request is in flight), which is itself worth surfacing
once the reusable piece exists.

**A separate, already-working pattern exists for button-scoped loading.**
`docs/roadmap.md` records that `ScoreUpdateModal.jsx`'s Save/End Match buttons already
show "a spinner inside Save… scoped to the two buttons and tracks each one's text
colour" — built specifically for that modal, not through `LoadingScreen`. This is the
"in-button" case Tom's ask distinguishes from full-page loading; it already exists in
one place and should inform the shared inline variant rather than being thrown away and
rebuilt from scratch.

## 4. Decisions already made

- **One component, two variants, driven by props — not two components.** A single
  `LoadingIndicator` (naming is a suggestion; keep `LoadingScreen` as the export name if
  that's less disruptive to existing imports — implementer's call) takes a `variant`
  (`'fullPage'` | `'inline'`) and a `context` key. `fullPage` replaces today's
  `LoadingScreen` visually (centred ring, same stacking layer) and additionally shows
  rotating text drawn from the phrase bank for its `context`. `inline` is the
  button-scoped spinner — visually consistent with the full-page ring (same spinner
  asset/animation, scaled down) but **carries no text**, matching Tom's note that not
  every action gets the same treatment and a button has no room for a sentence.
- **Text rotates, it isn't static per load.** For any loading state expected to run
  longer than a couple of seconds (schedule generation is the clearest case), cycle
  through 2-3 lines from that context's phrase bank rather than showing one fixed line —
  reuse whatever timer/interval pattern is simplest given the existing `fadeInOut`
  animation infrastructre already in `App.css` for toasts, or a plain `setInterval`
  swapping the displayed line. A short or typically-instant action (most button-scoped
  saves) doesn't need rotation — one line, or no text at all, per the `inline` variant
  above.
- **A context with no phrase bank entry falls back to a small generic set** — "Loading…",
  "Just a moment…", "Fetching that now…" style, boring on purpose — rather than either
  erroring or silently rendering no text. This is what keeps adoption (Step 2) low-risk:
  a call site that's missed or a new one added later still gets a sensible default.
- **Draft phrase bank**, one set per context, for Tom's review:

  | Context key | Used for | Draft phrases |
  |---|---|---|
  | `scoreUpdate` | Saving a score entry | "Settling all the bribes…", "Counting the sets…", "Confirming nobody double-scored…" |
  | `scheduleGenerate` | Automatic schedule generation | "Untangling the courts…", "Negotiating with the clock…", "Making sure nobody plays themselves…" |
  | `tournamentCreate` | Submitting a new tournament | "Laying out the courts…", "Setting up the bracket…", "Making it official…" |
  | `roundProgress` | Confirming round progression | "Working out who's through…", "Updating the bracket…" |
  | `divisionSave` | Saving/editing a division's teams or structure | "Rebuilding the fixtures…", "Reshuffling the pools…" |
  | `scoresheetGenerate` | Generating/downloading a scoresheet | "Filling in the paperwork…", "Printing the details…" |
  | `pageLoad` | Initial fetch of a tournament/profile/browse page | "Fetching the tournament…", "Loading the latest…" |
  | *(fallback)* | Anything without a specific entry | "Loading…", "Just a moment…" |

  Tom: swap, trim, or replace any of these — the mechanism doesn't depend on the exact
  wording.

## 5. Non-goals

- Don't change what triggers a loading state anywhere — this is purely about what's
  shown while an existing wait already happens, not about adding new waits or removing
  real ones.
- Don't touch `ScoreUpdateModal`'s existing button-spinner CSS/logic more than necessary
  to align it with the shared `inline` variant — if it already does the job, adapt it
  rather than replacing it wholesale.
- Don't add a loading state to something that currently has none unless it's part of
  the sweep in Step 2 and is a genuine gap (a blank moment where nothing indicates a
  wait is happening) — use judgement, don't invent new async boundaries.

## 6. Numbered steps

### Step 1 — Build the shared component

**Why:** one place needs to own both variants and the phrase bank, so every call site
draws from the same source rather than reinventing its own text/spinner.

**Files:** `tourganiser-ui/src/components/LoadingScreen.jsx` (extend in place, or
introduce a new file if a rename reads better — implementer's call, but don't leave two
competing components once this is done), a new small module for the phrase bank (e.g.
`tourganiser-ui/src/loadingPhrases.js`, mirroring how `helpContent.js` already separates
copy from the component that renders it).

**Do:**
- Build the phrase-bank module from the table above (or Tom's revised version).
- Extend the component to accept `variant` and `context`, defaulting sensibly (`variant
  = 'fullPage'`, `context` = the fallback key) so an unmigrated call site
  (`<LoadingScreen />` with no props) still renders something reasonable rather than
  breaking.
- Implement rotation for `fullPage` per the Decision above.
- Keep the `inline` variant visually consistent with `ScoreUpdateModal`'s existing
  button spinner — either extract that pattern into the shared component and have
  `ScoreUpdateModal` adopt it, or match its visual treatment closely if extracting isn't
  clean (spinner colour tracking the button's own text colour, sized to sit inside a
  button).

**Don't:** don't wire this into any call site yet — that's Step 2, done deliberately as
a separate, verifiable pass.

**Verify:**
- The component with no props (or only `variant='fullPage'`, no context) renders
  exactly like today's plain `LoadingScreen` used to, visually — no regression for any
  call site not yet migrated.
- Each context in the phrase bank renders its own text, rotating if more than one line
  is defined.
- The `inline` variant renders correctly sized inside a button-like container, in both
  light and dark theme.

### Step 2 — Adopt it at every loading site

**Why:** the whole point is consistency — a template that's used in two places out of
many isn't a fix for "loading screens should be contextual."

**Files:** whatever the search in Established Facts turns up — expect this to touch
`View.jsx`, `Browse.jsx`, `Profile.jsx`, `CreateTournament.jsx`, `ScoreUpdateModal.jsx`,
`ScheduleMakerModal.jsx`, `NextRoundModal.jsx`, `DivisionModal.jsx`,
`ScoresheetTemplateModal.jsx`/its scoresheet-download action, and possibly others.

**Do:** for each genuine loading state found, replace whatever it currently shows (the
plain `LoadingScreen`, an ad-hoc spinner, or nothing) with the shared component, picking
the `variant` (full-page for a page-level wait or a modal's initial load, inline for a
button/action mid-flow) and the closest matching `context` from the phrase bank —
adding a new context/phrase-bank entry where none of the drafted ones fit, following the
same tone as the existing ones (short, a little playful, ends in "…").

**Don't:** don't force a full-page loading state onto something that's genuinely a
quick, sub-second, in-place action just to "use the new component" — a button that
already flips to a disabled+spinner state instantly doesn't need rotating text it'll
never be visible long enough to show.

**Verify:**
- Every site identified in the search now uses the shared component with a
  context-appropriate message, not the old bare spinner.
- Nothing that previously showed no loading indicator at all was skipped without a
  deliberate reason (note any you decide to leave alone and why, in case Tom expected
  it covered).
- Slow-network testing (browser dev tools network throttling) on at least schedule
  generation and score update — confirm the rotating text is actually visible and
  reads sensibly for the duration a real wait takes, not just correct in principle.

## 7. Final validation

- `npm run lint` from `tourganiser-ui/` — confirm the pre-existing error count (5) has
  not grown.
- `npm run build` — confirm it still succeeds.
- Walk the app end to end (create a tournament, generate a schedule, enter a score,
  progress a round, download a scoresheet) with network throttling on, confirming each
  wait now shows a contextual, on-brand message rather than a bare spinner or nothing.
