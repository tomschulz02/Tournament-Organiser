# Handover: Small UI Fixes (1.0.1 hotfix, batch 1)

## 1. Risk declaration

Risk Level: **Low**, for every item in this document.

- The division-modal scroll fix touches `CreateModal.jsx`'s scroll-lock effect — shared
  by every modal built on it, but the change is additive (capture/restore a scroll
  position) and does not alter any modal's markup, props or behaviour otherwise.
- The message-popup contrast fix adds two new CSS rules (`.message-popup.info`,
  `.message-popup.warning`), following the exact pattern the existing `.success`/
  `.error` rules already use — no structural change to the component or how it picks a
  class name.
- The division colour palette expansion adds new CSS custom properties and array
  entries to an existing, isolated module. Nothing that reads `getDivisionAccent` changes.
- The CI trigger change edits YAML `on:` blocks only — it cannot affect application
  behaviour, only which pushes/PRs run the pipeline.

All four are isolated, low-blast-radius changes with no schema, dependency, auth or
shared-business-logic involvement. This document is the explanation CLAUDE.md's
Medium/High Risk process would otherwise require; nothing here rises to that bar, but
it's recorded anyway per the standard handover format.

## 2. How to use this document

One step per session is not necessary here — all four items are small and unrelated to
each other, so do them in order, verifying each before moving to the next. Do not
re-inspect anything this document's Established Facts section already states.

## 3. Established facts

**Item 1 — division modal scroll jump.**

`tourganiser-ui/src/components/create/CreateModal.jsx` is the shared shell every
creation-flow modal renders through — `DivisionModal.jsx` included, which is what opens
when adding or editing a division. Its scroll-lock effect is:

```jsx
useEffect(() => {
	document.body.classList.add('noscroll');
	return () => document.body.classList.remove('noscroll');
}, []);
```

`body.noscroll` in `App.css` is:

```css
body.noscroll {
	position: fixed;
	width: 100%;
	overflow-y: scroll !important;
}
```

This is the cause of the jump. Setting `position: fixed` on `<body>` takes it out of
normal flow — its implicit `top` is `0` unless set explicitly — so the page visually
snaps to its scroll-position-zero appearance the instant the class is added, and jumps
again on removal because nothing told the browser to return to the scroll offset it had
before. `window.scrollY` is not read or restored anywhere in this effect.

This is a generic problem in the shared modal shell, not something specific to
`DivisionModal`. Fixing it in `CreateModal.jsx` fixes it for every modal that uses this
shell (the creation flow's other modals, and `ScoresheetTemplateModal.jsx`, which also
renders through `CreateModal`).

**Item 2 — unreadable schedule-generation warning.**

The warning appears via `showMessage(result.warnings.join(' '), 'info', 9000)` in
`ScheduleMakerModal.jsx`. `showMessage`'s default `type` is `"info"`
(`MessageProvider.jsx`), and `MessagePopup` renders `<div className={`message-popup
${message.type}`}>` (same file). So an info-type message gets the class
`message-popup info`.

`App.css` defines `.message-popup` (base), `.message-popup.success` and
`.message-popup.error` — **there is no `.message-popup.info` rule and no
`.message-popup.warning` rule**, so an info-type message (the only type in use besides
success/error today) falls through to the base rule:

```css
.message-popup {
	position: fixed;
	...
	background: var(--background-color);
	color: var(--text-color);
	...
}
```

The bug is in the theme tokens this base rule uses, not in this rule's structure.
`body.light` (App.css, ~line 89) sets:

```css
--background-color: rgb(245, 245, 245);  /* off-white */
--text-color: rgb(255, 255, 255);        /* white */
```

`--text-color` is white in **both** the light and dark themes (`body.dark` sets the same
`rgb(255, 255, 255)`) — it exists as "the colour that reads on a saturated surface",
which is exactly why `.success` (green background) and `.error` (red background) both
explicitly redeclare `color: var(--text-color)` and it works there: white on a saturated
colour is legible. The base `.message-popup` rule reuses the same token for its own,
unsaturated `--background-color` surface, which is where it breaks — off-white
background, white text, in light theme specifically (dark theme's `--background-color`
is `rgb(54, 54, 54)`, dark enough that white text still reads there, which is why this
has probably gone unnoticed outside light mode).

`--main-color: rgb(41, 98, 255)` is already declared in `:root` (App.css, ~line 6) —
the site's own blue, used for primary actions/links elsewhere. `--success-color` and
`--error-color` sit beside it in `:root` (~lines 13-14), theme-invariant, each paired
with `--text-color` on their own `.message-popup` variant. There is no existing
`--warning-color` token — one needs to be added alongside them, in the same place.

**Item 3 — division colour palette.**

`tourganiser-ui/src/utils/divisionColors.js` picks a division's colour by hashing its id
and taking it modulo `ACCENT_COUNT` (currently `8`), returning a CSS custom property
name (`--accent-1` through `--accent-8`). The eight tokens themselves are declared once
in `App.css`, inside `body.light` (~line 101) and `body.dark` (~line 121), each with a
one-word colour-name comment (`/* indigo */`, `/* teal */`, etc.). Everything that shows
a division's identity — `DivisionBadge`, `DivisionSelector`'s pills, `DivisionCard`,
`FixtureRow` — goes through `getDivisionAccent`/`divisionColorStyle` in this one module;
none of them hash or pick colours themselves.

**Item 4 — CI trigger branches.**

`.github/workflows/api-tests.yml` and `.github/workflows/ui-checks.yml` both currently
read:

```yaml
on:
  push:
  pull_request:
```

Both trigger on every push and every PR, to any branch, with no `branches:` filter.

## 4. Decisions already made

- The scroll-jump fix is made once, in `CreateModal.jsx`'s scroll-lock effect — not
  duplicated per-modal. Not to be revisited.
- **The fix adds two new message-popup variants, `.info` and `.warning`, matching the
  existing `.success`/`.error` pattern exactly** — a distinct, theme-invariant saturated
  background plus `color: var(--text-color)` (white) — rather than changing the base
  rule's colour. `--text-color` itself is not touched, since it's correctly used
  elsewhere (buttons and other saturated surfaces rely on it staying white in both
  themes).
  - `.message-popup.info` uses the site's own blue, `var(--main-color)` — already
    declared, no new token needed.
  - `.message-popup.warning` uses a new `--warning-color` token, added to `:root`
    alongside `--success-color`/`--error-color`, in a yellow/orange range dark enough
    that white text stays legible on it (a pale yellow would not pass — pick a deeper
    amber/orange, e.g. in the `rgb(230, 120, 0)` range, and treat that as a starting
    point to check against real contrast, not a fixed final value).
  - The base `.message-popup` rule's own `color` also moves from `var(--text-color)` to
    `var(--secondary-text-color)`, as a safety net for any message type that isn't
    `success`/`error`/`info`/`warning` (there shouldn't be one, but the base rule
    shouldn't default to unreadable if one ever shows up).
- **The schedule-generation warning changes `type` from `'info'` to `'warning'`** at its
  call site in `ScheduleMakerModal.jsx` — "some fixtures couldn't be placed" is a
  warning, not neutral information, and now that a warning style exists it's the more
  correct choice, not just a legibility fix. Leave every other existing `showMessage`
  call site's type as it already is unless it's obviously miscategorised in the same
  way (check, don't assume there are others).
- The colour palette is expanded to **at least 12 tokens** (`--accent-1` through
  `--accent-12` at minimum), comfortably past the "10+" ask with room to spare, cycling
  via the existing modulo mechanism once a tournament has more divisions than tokens.
  Exact hues are the implementer's call — same muted, non-saturated character as the
  existing eight (see the existing tokens' comment in `App.css`, ~line 96), each visually
  distinct from its neighbours and from every other accent already defined, tuned for
  both themes the same way the existing eight are (a separate, lighter set per token
  under `body.dark`).
- CI triggers on push and pull_request are restricted to `dev` and `main` only, in both
  workflow files identically.

## 5. Non-goals

- Don't touch anything else in `CreateModal.jsx` — the focus trap, the Escape handling,
  and the portal target are all correct and unrelated to this bug.
- Don't invent additional message types beyond `info` and `warning` — `success` and
  `error` already exist and are unaffected; these two are the only new ones.
- Don't change how `getDivisionAccent`'s hash function distributes ids across tokens —
  only the size of the token set changes.
- Don't touch the `known-bugs` job commented out at the bottom of `api-tests.yml` — it's
  deliberately disabled and out of scope here.

## 6. Numbered steps

### Step 1 — Fix the division modal scroll jump

**Why:** the shared modal shell's scroll lock loses and never restores the page's
scroll position when it toggles `position: fixed` on `<body>`.

**Files:** `tourganiser-ui/src/components/create/CreateModal.jsx` only.

**Do:** capture `window.scrollY` before adding the `noscroll` class, and restore it with
`window.scrollTo` after removing the class on cleanup. The standard pattern is to store
the offset (a ref is fine, since this doesn't need to trigger a re-render), set it as a
negative `top` on the body alongside `position: fixed` so the visible content doesn't
shift when the class is applied, and on cleanup remove the class, clear the inline
`top`, and call `window.scrollTo(0, storedOffset)`.

**Don't:** don't add a second, separate scroll-lock mechanism elsewhere — this is the
one place it happens, for every modal that uses `CreateModal`.

**Verify:**
- Scroll partway down the tournament creation page, click "Add Division" — the page
  behind the modal must not visibly jump when the modal opens.
- Close the modal (Cancel, Save, or Escape) — the page must still be at the same scroll
  position it was at before opening, not jumped to the top.
- Repeat both checks with the page scrolled to the very top (nothing should look
  different there — this is the already-working case).
- Repeat both checks on `ScoresheetTemplateModal` (also built on `CreateModal`) to
  confirm the shared fix reaches it too.

### Step 2 — Add info and warning message-popup styles

**Why:** an info-type toast message currently falls through to the base rule and
renders white text on an off-white background in light theme, per Established Facts
above. Rather than just patching that rule, add proper `info` (blue) and `warning`
(yellow/orange) variants matching the existing `success`/`error` pattern, and use
`warning` for the schedule-generation message it actually is.

**Files:** `tourganiser-ui/src/App.css`, `tourganiser-ui/src/components/
ScheduleMakerModal.jsx`.

**Do:**
- In `:root`, add `--warning-color`, alongside the existing `--success-color`/
  `--error-color` declarations, in the yellow/orange range described in Decisions above.
- Add `.message-popup.info { background: var(--main-color); color: var(--text-color); }`
  and `.message-popup.warning { background: var(--warning-color); color:
  var(--text-color); }`, placed next to the existing `.success`/`.error` rules, same
  structure.
- Change the base `.message-popup` rule's `color` from `var(--text-color)` to
  `var(--secondary-text-color)`, as the fallback safety net described in Decisions.
- In `ScheduleMakerModal.jsx`, change the generation-warning call from
  `showMessage(result.warnings.join(' '), 'info', 9000)` to the same call with
  `'warning'` in place of `'info'`.

**Don't:** don't touch `.message-popup.success` or `.message-popup.error` — both already
explicitly declare `color: var(--text-color)` and are correct as-is. Don't touch
`--text-color`'s definition. Don't change `showMessage`'s default `type` — it stays
`'info'`; only this one call site's explicit type changes.

**Verify:**
- In light theme, generate a schedule that leaves some fixtures unplaced (enough
  fixtures and few enough courts/slots that `unscheduledFixtures` warnings fire) and
  confirm the resulting toast is legible — white text on the new warning colour.
- Trigger a success and an error message (e.g. saving a schedule, then an invalid
  action) and confirm both still look exactly as they did before — white text on their
  coloured backgrounds, unchanged.
- Trigger a genuine info-type message (if one exists elsewhere in the app, or by
  temporarily calling `showMessage` with `'info'` during testing) and confirm it now
  renders white text on the site's blue, legible in both themes.
- Check the warning colour's contrast with white text directly — a browser dev tools
  contrast checker or a quick manual eyeball in bright light — and adjust the exact
  `--warning-color` value if it reads as too light/washed out.
- Repeat every check above in dark theme.

### Step 3 — Expand the division colour palette

**Why:** eight accent colours run out fast on a tournament with more than eight
divisions, and the ask is for support past ten.

**Files:** `tourganiser-ui/src/App.css`, `tourganiser-ui/src/utils/divisionColors.js`.

**Do:**
- In `App.css`, add at least four more `--accent-N` tokens (through at least
  `--accent-12`) to both the `body.light` block and the `body.dark` block, following the
  existing pattern exactly: muted rather than saturated in light theme, the same hue
  lightened for dark theme, each with a one-word colour-name comment, each visually
  distinct from every other accent token (existing and new) in both themes.
- In `divisionColors.js`, update `ACCENT_COUNT` to match the new total.

**Don't:** don't change `hashId` or the modulo logic — only the count changes.

**Verify:**
- A tournament with more than 8 divisions (create one, or check against test data) shows
  a visibly distinct colour for each of the first `ACCENT_COUNT` divisions, in both
  themes, everywhere a division's colour appears (badge, selector pills, division card,
  fixture rows).
- A tournament with more divisions than `ACCENT_COUNT` still works — colours repeat
  rather than erroring or rendering `null`.
- No existing division's colour changes as a side effect (same id, same hash, same
  `% ACCENT_COUNT` result for ids that already resolved within the old range of 8 — this
  should hold automatically since the modulo base only grew, but confirm against a known
  tournament).

### Step 4 — Restrict CI triggers to dev and main

**Why:** the pipeline currently runs on every push and PR to every branch.

**Files:** `.github/workflows/api-tests.yml`, `.github/workflows/ui-checks.yml`.

**Do:** in both files, change:

```yaml
on:
  push:
  pull_request:
```

to:

```yaml
on:
  push:
    branches: [dev, main]
  pull_request:
    branches: [dev, main]
```

**Don't:** don't change anything else in either workflow — the job definitions, the
coverage upload, the lint baseline mechanism, and the build step are all unrelated and
correct as-is.

**Verify:** this can only be verified once merged and pushed — Claude does not run git
commands in this repository (see `docs/git-hygiene.md`). Confirm the YAML is valid
(correct indentation, `branches:` nested under both `push:` and `pull_request:`) and
hand off; Tom will confirm the trigger behaviour once it's live by checking the Actions
tab against a push to a third branch (should not trigger) and to `dev`/`main` (should).

## 7. Final validation

Run once, after all four steps:

- `npm run lint` from `tourganiser-ui/` — confirm the pre-existing error count (5) has
  not grown.
- `npm run build` from `tourganiser-ui/` — confirm it still succeeds.
- Manually re-walk all four Verify lists above in one pass, in both light and dark theme.
