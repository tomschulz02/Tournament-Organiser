---
name: Tourganiser
description: Volleyball tournament organisation and live results, read courtside on a phone.
colors:
  tourganiser-blue: "#2962FF"
  sky-blue: "#1DA8EC"
  aqua: "#4CDEDE"
  periwinkle: "#7B80F6"
  success: "#4CAF50"
  error: "#F44336"
  warning: "#E67800"
  on-primary: "#FFFFFF"
  background: "#F5F5F5"
  surface: "#FFFFFF"
  surface-alt: "#F4F7FB"
  ink: "#252525"
  muted: "rgba(37, 37, 37, 0.66)"
  border: "rgba(37, 37, 37, 0.12)"
  dark-background: "#363636"
  dark-surface: "#242424"
  dark-surface-alt: "#2F2F2F"
  dark-ink: "#F5F5F5"
  dark-muted: "rgba(245, 245, 245, 0.7)"
  dark-border: "rgba(245, 245, 245, 0.14)"
  footer: "#202020"
  identity-indigo: "#4F46E5"
  identity-teal: "#0D9488"
  identity-orange: "#D94C06"
  identity-purple: "#9333EA"
  identity-rose: "#E11D48"
  identity-cyan: "#0284C7"
  identity-green: "#16A34A"
  identity-pink: "#E21EA0"
  identity-amber: "#CAA904"
  identity-slate: "#475569"
  identity-magenta: "#D11EE2"
  identity-olive: "#308015"
typography:
  wordmark:
    fontFamily: "'Segoe UI', 'Roboto', sans-serif"
    fontSize: "2em"
    fontWeight: 500
  display:
    fontFamily: "'Segoe UI', 'Roboto', sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2.5rem)"
    fontWeight: 600
  headline:
    fontFamily: "'Segoe UI', 'Roboto', sans-serif"
    fontSize: "clamp(1.15rem, 4vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "'Segoe UI', 'Roboto', sans-serif"
    fontSize: "1.1rem"
    fontWeight: 600
  body:
    fontFamily: "'Segoe UI', 'Roboto', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  body-small:
    fontFamily: "'Segoe UI', 'Roboto', sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
  label:
    fontFamily: "'Segoe UI', 'Roboto', sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    letterSpacing: "0.03em"
rounded:
  sm: "4px"
  control: "8px"
  row: "10px"
  panel: "14px"
  modal: "16px"
  card: "18px"
  pill: "999px"
  circle: "50%"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "32px"
  space-7: "40px"
components:
  header:
    backgroundColor: "{colors.tourganiser-blue}"
    textColor: "{colors.on-primary}"
    typography: "{typography.wordmark}"
    height: "80px"
  bottom-nav:
    backgroundColor: "{colors.tourganiser-blue}"
    textColor: "{colors.on-primary}"
    height: "64px"
  button-primary:
    backgroundColor: "{colors.tourganiser-blue}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.periwinkle}"
  button-quiet:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-quiet-hover:
    backgroundColor: "{colors.surface-alt}"
  button-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  button-pill-active:
    backgroundColor: "{colors.tourganiser-blue}"
    textColor: "{colors.on-primary}"
  input:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  tab:
    textColor: "{colors.muted}"
    padding: "12px 16px"
  tab-active:
    textColor: "{colors.tourganiser-blue}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "24px"
  fixture-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "16px 12px"
  status-pill:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  modal:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    rounded: "{rounded.modal}"
    padding: "24px"
---

# Design System: Tourganiser

## Overview

**Creative North Star: "The Courtside Board"**

Tourganiser should read like the results board at the venue: one strong blue that says where you are and what to press, quiet neutral panels underneath, and scores, courts and times you can take in at a glance on a phone held in one hand. The board is not decorated. Its job is to be read quickly by someone standing in a hall or on the sand, often between matches, on a weak connection.

The system is a light and a dark theme over the same structure (`body.light` / `body.dark`, set before first paint from the saved choice or the OS preference). Tourganiser Blue owns the chrome (fixed header, mobile bottom nav), the active tab and the primary action. Everything else sits on flat, bordered neutral panels. Colour beyond the blue carries one of two meanings and never both: **status** (success, error, warning, sky) or **identity** (the twelve-colour palette that marks which division or which tournament).

Density is moderate: organiser screens (create flow, schedule maker) are dense tools; spectator screens favour one column of large, tappable rows on a phone. Components are clear and sturdy: 44px tap targets, plain labels, obvious states, no ornament.

**Key Characteristics:**
- One brand blue on the chrome and the primary action; neutral panels for everything else.
- Flat surfaces with 1px borders. Shadows only on what floats.
- Status and identity are separate colour systems.
- 44px is the minimum height of anything tapped.
- System sans (Segoe UI / Roboto), weight 600–700 for emphasis, small uppercase labels.
- The page never scrolls sideways; tab rows, tables and the bracket scroll on their own axis.

## Colors

A single saturated blue over cool, near-white neutrals (or charcoal in dark mode), with a separate, deliberately spaced twelve-hue palette for identity.

### Primary
- **Tourganiser Blue** (`tourganiser-blue`): the fixed header, the mobile bottom nav, the active tab underline and label, primary buttons, focus borders, the active Save/Follow pill, and the "upcoming" status. It is the one colour that means "you are here" or "press this".

### Secondary
- **Sky Blue** (`sky-blue`): secondary brand tone. Footer section headings, the Legal banner, the "ongoing" pill on Discover cards, the CTA hover on Home.
- **Periwinkle** (`periwinkle`): hover state of primary buttons in the create flow; the About banner.

### Tertiary
- **Aqua** (`aqua`): highlight on the blue chrome only. Desktop nav link hover and the raised centre Create button in the mobile bottom nav.

### Status
- **Success** (`success`): live / ongoing.
- **Error** (`error`): validation errors and destructive actions.
- **Warning** (`warning`): cautions.

### Identity palette
Twelve muted hues (`identity-indigo` through `identity-olive`, defined as `--accent-1` … `--accent-12`) shared by division colours and tournament identity. Each has a lightened dark-theme twin (see `.impeccable/design.json`). Neighbouring hues are spaced at least ~24° apart because they are read as 1–3px lines and small dots, where close hues collapse into one.

### Neutral
- **Background** (`background` / `dark-background`): the page.
- **Surface** (`surface` / `dark-surface`): panels, fixture rows, pill buttons.
- **Surface Alt** (`surface-alt` / `dark-surface-alt`): input fields, quiet-button hover, secondary wells.
- **Ink** (`ink` / `dark-ink`): body text. In code this is `--secondary-text-color`.
- **Muted** (`muted` / `dark-muted`): meta text, inactive tabs, hints, counters.
- **Border** (`border` / `dark-border`): every panel, row and field outline.
- **On Primary** (`on-primary`): text on filled blue. In code this is `--text-color`, which is white in **both** themes.
- **Footer** (`footer`): the site footer, a near-black band in both themes.

The neutral set is one system. Today it is declared three times under area prefixes (`--tv-*` in the tournament view, `--ct-*` in the create flow, `--schedule-*` in the schedule maker) with the same values; treat those as aliases of the tokens above.

### Named Rules
**The One Blue Rule.** Tourganiser Blue is the only colour that signals action or location. If something else needs attention, it gets a status colour or nothing.

**The Status Is Not Identity Rule.** The twelve identity hues say *which* division or tournament. They never mark a status, an error or a call to action, and a status colour is never used as an identity.

**The White Token Trap.** `--text-color` is white in both themes and belongs only on filled blue surfaces. Body text always uses `--secondary-text-color`.

## Typography

**Display Font:** Segoe UI (with Roboto, sans-serif)
**Body Font:** Segoe UI (with Roboto, sans-serif)
**Label/Mono Font:** same family; `font-variant-numeric: tabular-nums` for counters and figures.

**Character:** A system sans, chosen for legibility and zero load cost rather than personality. Hierarchy comes from weight and size, not from a second family.

### Hierarchy
- **Wordmark** (500, 2em): "Tourganiser" in the header only.
- **Display** (600, clamp(1.5rem, 3vw, 2.5rem)): marketing headings on Home and About.
- **Headline** (700, clamp(1.15rem, 4vw, 1.75rem), 1.25): the tournament name in the tournament view. Wraps, never truncates.
- **Title** (600, 1.1rem): panel and section headings, empty-state headings.
- **Body** (400, 1rem): descriptions, field values, inputs (inputs stay at 1rem so mobile browsers do not zoom).
- **Body Small** (400, 0.85rem): meta lines, fixture detail, the most common size in the app.
- **Label** (700, 0.78rem, 0.03em, uppercase): status pills and field captions ("LOCATION", "TEAMS").

### Named Rules
**The Weight Does The Work Rule.** Emphasis is 600 or 700 in the same family. Do not add a second typeface or rely on colour alone for hierarchy.

## Layout

- **Container:** content is centred at a maximum of 1200px with `--space-4` side padding (`--space-3` on phones).
- **Chrome:** a fixed 80px blue header on every page. At 769px and above it carries the desktop nav on the right. At 768px and below the nav moves to a fixed 64px blue bottom bar with Home, Discover, a raised circular Create button, Profile and Info.
- **Breakpoints:** 768px is the main switch (27 rules); 480px and 1024px exist as tokens; 900px and 1200px appear once each.
- **Spacing:** a seven-step 4px-based scale (`--space-1` … `--space-7`, numbered by position). At 768px and below, steps 4–7 each drop one place (16→12, 24→16, 32→24, 40→32) so content gets the room margins were taking. Spacing tokens are for whitespace only; grid columns, tap targets, borders and 1px gaps keep literal values.
- **Stacking:** z-index uses named roles in steps of 100: below, base, raised, chrome, menu, modal, confirm, toast, tooltip, loading.
- **Overflow:** the page itself never scrolls sideways. The tab row, standings tables and the bracket each get their own horizontal scroll.

## Elevation & Depth

Flat by default. Panels, fixture rows, division cards and inputs sit flat on the page, separated by a 1px border and the surface/background contrast. Shadows appear only on layers that float above the page.

### Shadow Vocabulary
- **Chrome** (`box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1)`): the fixed header.
- **Menu** (`box-shadow: 0 4px 12px var(--card-shadow-color)`): the desktop profile menu and other popovers.
- **Popover** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18)`): the division colour picker menu.
- **Raised button** (`box-shadow: 0 4px 8px rgba(0, 0, 0, 0.25)`): the circular Create button that rises out of the mobile bottom nav.
- **Dragging** (`box-shadow: 0 12px 20px rgba(0, 0, 0, 0.14)`): a schedule-maker entry while it is picked up or flashed.
- **Focus ring** (`box-shadow: 0 0 0 3px rgb(from var(--main-color) r g b / 0.2)`): input focus, with the border turning blue.
- **Division edge** (`box-shadow: inset 3px 0 0 0 var(--tv-division-color)`): a structural colour edge, not depth.

### Named Rules
**The Flat + Borders Rule.** Nothing that sits in the page flow gets a shadow at rest, and hover never lifts. Hover changes colour or border. Shadows are for menus, popovers, the header, the Create button and an entry being dragged.
## Shapes

Gently rounded, with the radius growing with the size of the container: 4px for small tags, 8px for buttons and inputs, 10px for fixture rows and menus, 14px for panels, 16px for modals, 18px for Discover cards. Pills (999px) for status, filter chips and the subheader's Browse/Save buttons; full circles for icon buttons and the Create button. Borders are always 1px, except the 2px active-tab underline and the 3px division edge on fixture rows and division cards.

## Components

### Buttons
Clear and sturdy: plain labels, 44px minimum height, an obvious hover.
- **Shape:** gently rounded (8px).
- **Primary:** Tourganiser Blue fill, white label, 600 weight at 0.95rem, 8px × 16px padding. Hover turns Periwinkle. Disabled drops to 55% opacity with a not-allowed cursor.
- **Quiet:** transparent with a 1px border and ink label; hover fills with surface-alt.
- **Pill:** surface fill, 1px border, 999px radius, icon plus label at 0.9rem. Hover turns the border and label blue. The active state (e.g. a saved tournament) fills blue with a white label.
- **Icon / theme buttons:** 32–36px circles in a translucent white on the blue header.

### Chips and status
- **Status pill:** 999px, label type (0.78rem, 600–700, uppercase on Discover cards). On Discover it is a tinted wash with a coloured border and label (blue upcoming, sky ongoing, muted completed); in the tournament view it is a solid fill (sky, green when ongoing, muted when finished).
- **Status dot:** a 10px circle on each fixture row: blue upcoming, green live, red completed, muted cancelled, always paired with visually hidden text.
- **Format tag:** small bordered tag ("League", "Classic") next to a division name.

Known drift: "ongoing" is sky on Discover and green in the tournament view, and a completed fixture uses the error red. Reconcile when the status components are next touched.

### Cards / Containers
- **Panel:** surface, 1px border, 14px radius, 24px padding, no shadow. The base container of the tournament view.
- **Division card:** a panel with a 3px left edge in the division's identity colour, a small stat grid (TEAMS, FIXTURES, ROUND) and a progress bar in the same colour.
- **Fixture row:** surface, 1px border, 10px radius, a 3px left edge in the division colour when the tournament has several divisions. A three-column grid: meta (match number, court chip, division chip, stage), the two teams with sets won and per-set scores aligned under each other, then actions.
- **Tournament card (Discover):** a 12px status bar on the left, a soft identity-colour wash with a generated pattern behind the content, 18px radius.

### Inputs / Fields
- **Style:** surface-alt fill, 1px border, 8px radius, 44px minimum height, 1rem text. Label above at 0.9rem 600; hint, error and character counter share one row below at 0.8rem.
- **Focus:** the border turns blue with a 3px translucent blue ring.
- **Error:** red border and red ring on focus; the message below in red.

### Navigation
- **Header:** fixed 80px Tourganiser Blue bar, wordmark left. Desktop links in white at 500, turning Aqua on hover; circular theme and profile buttons on the right.
- **Bottom nav (≤768px):** fixed 64px blue bar, five items with icon over label, the centre Create button a raised Aqua circle.
- **Tournament tabs:** one row that scrolls sideways, never wraps. Inactive tabs are muted; the active tab is blue at 600 with a 2px blue underline.

### Tournament header band (signature)
The tournament view's subheader sits on a faint wash of the tournament's identity colour with its generated pattern. Three columns (Browse pill, centred title, Save pill) with equal outer columns, so the name stays on the true centre of the page.

## Do's and Don'ts

### Do:
- **Do** keep every tapped control at least 44px high.
- **Do** use `--secondary-text-color` for text on panels and the page; reserve `--text-color` (white) for filled blue surfaces.
- **Do** take division and tournament colours from the twelve-hue identity palette (`--accent-1` … `--accent-12`), in both theme variants.
- **Do** pair every colour-coded status with text, visible or visually hidden.
- **Do** use the `--space-*` scale for whitespace and the named `--z-*` roles for stacking.
- **Do** use the shared neutral set (surface, surface-alt, border, muted) for new areas instead of declaring another prefixed copy.
- **Do** stop looping animation (skeleton shimmer) under `prefers-reduced-motion: reduce`.
- **Do** keep transitions short (0.15–0.2s ease) and limited to colour, border and background.

### Don't:
- **Don't** add shadows to panels, rows or cards that sit in the page flow, and don't lift elements on hover.
- **Don't** use a second accent colour for primary actions; Tourganiser Blue is the only action colour.
- **Don't** use an identity hue to signal status, or a status colour as an identity.
- **Don't** let the page scroll sideways; give wide content its own scroll container.
- **Don't** truncate tournament or team names in headings; let them wrap.
- **Don't** introduce a second typeface.
