# Handover: Help Menu Expansion (1.0.1 hotfix, batch 7)

## 1. Risk declaration

Risk Level: **Low** (content and copy, plus registering a few more components with an
existing, already-working mechanism — no new plumbing required for the text side).
Screenshot capture carries a separate, genuine uncertainty about tooling — see Step 3
and the caution below. Nothing here touches business logic, routing, or shared
components beyond the help system itself.

## 2. How to use this document

Step 1 (deepen existing topics) and Step 2 (add topics for modals) are independent and
can be done in any order — do them together, page by page, since writing good help copy
for a screen benefits from having the modals it opens fresh in mind. Step 3
(screenshots) depends on Steps 1 and 2 existing, since it's about where to insert images
into content that needs to exist first.

## 3. Established facts

**The mechanism already supports exactly what's being asked for — this is a content
task, not an engineering one, for the text half.** `tourganiser-ui/src/helpContent.js`
exports `HELP_TOPICS`, a flat object keyed by topic id: `{ title, icon, paragraphs:
[string, ...] }`. `App.jsx`'s `HelpMenu` component reads `HELP_TOPICS[activeTopic] ??
HELP_TOPICS.fallback` and renders `title`, an `Icon`, and each paragraph as its own `<p>`
inside `.help-menu-body`. `activeTopic` comes from `HelpContext.jsx`/`HelpProvider.jsx`:
any component can call `useHelpTopic('some-id')` in its own body, and it registers that
id on mount, unregisters on unmount, with **the most recently mounted topic winning**
over anything still mounted beneath it — the exact comment in `HelpContext.jsx` says
this deliberately: "the most recently mounted one — a tab or stage nested inside a page
— wins over its parent, the same way a nested route overrides a parent's document
title." **This means a modal opened on top of a page that already has its own topic
registered will correctly show the modal's own help content instead, and revert to the
page's topic the instant the modal closes — with zero changes needed to `HelpContext`,
`HelpProvider`, or `HelpMenu` themselves.**

**Every current topic covers a page or a tab, and none cover a modal.**
`HELP_TOPICS`'s existing keys: `home`, `browse`, `create-tournament`,
`tournament-overview`, `tournament-fixtures-unscheduled`,
`tournament-fixtures-scheduled`, `tournament-standings-groups`,
`tournament-standings-knockout`, `tournament-standings-rankings`, `tournament-teams`,
`about`, `profile`, `fallback`. None of the modals — `DivisionModal`, `ScoreUpdateModal`,
`NextRoundModal`, `ScheduleMakerModal`, `ScoresheetTemplateModal`, `ConfirmDialog` — call
`useHelpTopic` anywhere today. Opening any of them currently leaves whatever topic the
page behind them had registered showing in the help menu, which is exactly the gap
Tom's describing: "the modals aren't covered at all."

**Each existing topic's paragraphs are short — 1-3 sentences, 1-3 paragraphs.** They
read as a quick orientation, not a walkthrough. Tom's ask is for something closer to an
unguided tutorial: cover every action on the page, and go into real detail for anything
that opens a modal.

## 4. Decisions already made

- **The content shape gains structure, not just longer paragraphs.** A flat array of
  strings can't cleanly express "here's the page in general, and here's what each of its
  three buttons does, and here's what happens if you open the schedule builder." Extend
  `HELP_TOPICS`'s per-topic shape to support an ordered list of **sections**, each an
  optional short heading plus one or more paragraphs (and, per Step 3, an optional
  image) — e.g. `{ title, icon, sections: [{ heading?, paragraphs: [...], image? },
  ...] }` — rather than the current bare `paragraphs` array. Keep `paragraphs` working
  as a shorthand for a single unheaded section, or migrate every existing topic to the
  new shape uniformly — implementer's call, but don't leave two competing shapes live at
  once (`HelpMenu` should render one consistent structure, not branch on which shape a
  given topic happens to use).
- **Modal topics are added as their own new entries**, registered via `useHelpTopic`
  inside each modal component (following the exact pattern `ScheduleTab.jsx` and every
  other existing topic-registering component already uses — `useHelpTopic('some-id')`
  called once near the top of the component body). A modal's help content should assume
  the reader has *not* read the page behind it — restate enough context to stand alone,
  since a modal's help entry might be the first thing someone opens the menu to.
- **Coverage target: every visible action on a page or inside a modal gets at least a
  sentence**, not just the ones that happen to already have one. Read each page/modal's
  actual rendered controls (buttons, toggles, links, drag interactions) against its
  current help entry and fill every gap found, rather than only adding what's easy.

## 5. Non-goals

- Don't change `HelpContext.jsx`, `HelpProvider.jsx`, or the registration mechanism
  itself — it already does exactly what's needed, per Established Facts.
- Don't add help content for pages/states that don't exist yet (`/settings`,
  future-features) — cover what's actually in the app today.
- Don't restructure `.help-menu-container`/`.help-menu` layout beyond what's needed to
  accommodate longer content and images — a scrollable body if it doesn't already have
  one, nothing more elaborate.

## 6. Numbered steps

### Step 1 — Deepen every existing page/tab topic

**Why:** current entries are a quick orientation; the ask is closer to a full,
un-guided tutorial covering every action.

**Files:** `tourganiser-ui/src/helpContent.js` only.

**Do:** for each of the 12 existing topic ids, open the actual page/tab in the running
app (or read its component's render output carefully) and rewrite its entry to name and
explain every visible action, not just the ones already mentioned — buttons, toggles,
filters, drag interactions, and what each one *does*, in plain language a first-time
organiser or spectator would need. Reference the target modal by name where an action
opens one (e.g. "Add Division opens a short form covering the format, pool/qualifier
setup if the format has one, and the team list — see its own help entry once it's
open"), so the two topics feel connected rather than redundant.

**Don't:** don't remove or contradict anything currently accurate in the existing
entries — extend them.

**Verify:** open every one of the 12 existing help topics in the running app (navigate
to the page/tab, open the help menu) and confirm the content matches what's actually on
screen at that moment — no stale references to a control that's been moved or renamed
since these were last written (per the "documentation asserting things the code doesn't
do" trap this project's own working notes call out).

### Step 2 — Add topics for every modal

**Why:** modals currently show whatever topic the page behind them had — none of their
own content exists.

**Files:** `tourganiser-ui/src/helpContent.js`, plus one line added to each of
`DivisionModal.jsx`, `ScoreUpdateModal.jsx`, `NextRoundModal.jsx`,
`ScheduleMakerModal.jsx`, `ScoresheetTemplateModal.jsx`, and `ConfirmDialog.jsx` if it
carries specific-enough content to be worth its own entry (a generic yes/no confirm
might not need one — use judgement; if its message already says everything needed, a
dedicated help topic for it may not add anything).

**Do:**
- Add a new `HELP_TOPICS` entry per modal (id of your choosing, following the existing
  kebab-case convention, e.g. `division-modal`, `score-update-modal`).
- In each modal component, call `useHelpTopic('its-id')` — import from `../HelpContext`
  (or the correct relative path) the same way every existing topic-registering component
  already does.
- `ScheduleMakerModal` in particular deserves real depth given its size (per
  `docs/architecture.md`, "the largest single screen: a grid, a list, an inspector, a
  generator and two print layouts") — cover the board, the fixtures sidebar, the
  inspector, the generator panel, and printing/exporting as distinct, named parts rather
  than one paragraph trying to cover all of it. Since it's the organiser's main working
  screen, this is worth the most detail of anything in this handover.
- `DivisionModal` has multiple internal screens (Basics, Configuration if the format has
  one, Teams) — cover each screen's purpose and controls, not just the modal as a whole.

**Don't:** don't add a topic for a modal state that's purely transient/self-explanatory
(e.g. if `ConfirmDialog`'s own message text already fully explains the action being
confirmed) — use judgement per the Do note above rather than mechanically covering every
component that happens to be a modal.

**Verify:** open every modal in the app with the help menu open (or open it once the
modal is up) — confirm the menu shows that modal's own content, not the page behind it,
and that it correctly reverts to the page's topic the instant the modal closes (per the
stacking mechanism in Established Facts — this should work automatically, but verify it
rather than assume).

### Step 3 — Add screenshots

**Why:** Tom asked for screenshots, especially of modals, to make the help menu
function more like a real tutorial.

**Files:** `tourganiser-ui/src/helpContent.js` (image references), a new static assets
location (e.g. `tourganiser-ui/public/help-screenshots/`, following the same pattern
`SYSTEM_TEMPLATES`' bundled PDFs already use — a `public/`-rooted path referenced
directly by URL, no import needed).

**A genuine open question, flagged rather than assumed:** capturing real screenshots
means driving the running app in a browser and saving images — this planning session has
browser tooling available to it, but **whether the separate Claude Code session that
implements this handover has equivalent browser/screenshot tooling is not something this
document can confirm.** Before starting this step, check what's actually available in
that session.

**Do, if screenshot capture is available:**
- For each topic from Steps 1 and 2 where a picture would clearly help — every modal at
  minimum, per Tom's specific mention, plus any page/tab whose layout isn't obvious from
  text alone — capture a clean screenshot (a real tournament with realistic-looking data,
  not an empty state, unless the empty state itself is what's being explained), save it
  under the new assets path, and reference it from that topic's relevant section (per the
  content shape in Decisions above).
- Keep images reasonably sized (crop to the relevant area rather than a full-viewport
  screenshot where only a small part is the point) and add alt text for accessibility.

**Do, if screenshot capture is not available in that session:**
- Build every other part of this handover in full (the content, the section structure,
  the modal registrations), leaving clearly marked placeholders for where an image
  belongs (e.g. a `image: null` field with a comment naming exactly what the screenshot
  should show), and report back precisely which screens need one, so Tom can capture
  them himself or route this specific step to a session that has the right tooling.
  **Do not skip this note silently** — an implementer who quietly drops the screenshot
  requirement because it was inconvenient is worse than one who flags it clearly.

**Don't:** don't use a placeholder/stock image, an AI-generated mockup, or a screenshot
of a different, unrelated app standing in for a real one — either a real screenshot of
this app or an explicit "not yet captured" placeholder, nothing in between.

**Verify (if screenshots were captured):** every image referenced from `helpContent.js`
actually loads in the running app's help menu, at a legible size, matching the content
around it.

## 7. Final validation

- `npm run lint` from `tourganiser-ui/` — confirm the pre-existing error count (5) has
  not grown.
- `npm run build` — confirm it still succeeds, and that any new static assets are
  correctly included in the build output.
- Walk every page, tab, and modal in the app with the help menu open at each stop,
  confirming accurate, sufficiently detailed content appears every time — this is the
  actual acceptance test for "an unguided tutorial," more than any individual Verify
  step above.
