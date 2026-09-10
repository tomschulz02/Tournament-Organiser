# Handover: Scoresheet Template — Division Field & Edit Placement (1.0.1 hotfix, batch 2)

## 1. Risk declaration

Risk Level: **Medium** (business logic — the scoresheet prefill/placement mechanism).

Both items extend an existing, working mechanism (the field catalogue and the marker
placement screen) rather than changing its shape. The risk is narrow: getting the
"update in place" save path wrong could silently create a duplicate template instead of
editing the existing one, or corrupt an existing custom template's stored record. This
document is the explanation CLAUDE.md's Medium Risk process requires.

## 2. How to use this document

Two independent steps. Do Step 1 first — it's small and self-contained. Step 2 reuses
the same placement screen Step 1 doesn't touch, so order doesn't matter functionally,
but doing the smaller one first makes Step 2 easier to verify in isolation.

## 3. Established facts

**The field catalogue is one flat list, already designed for this.**
`tourganiser-ui/src/utils/scoresheetTemplates.js` exports `SCORESHEET_FIELDS` (an array
of field ids) and `FIELD_LABELS` (id → human label). Every template — system or custom —
offers the exact same catalogue on its placement screen; whether a given field actually
appears on a given sheet is purely a question of whether an organiser has drawn a marker
for it, not something declared per-template. Adding a new field id to this one list is
the entire "make it offerable" step.

**The prefill function already has a `division` parameter it doesn't use.**
`tourganiser-ui/src/utils/scoresheetPrefill.js`, `buildFieldValues`:

```js
export function buildFieldValues(fixture, tournament, division, scheduleEntry) {
	...
	return {
		competitionName: tournament?.name || '',
		...
		poolPhase: fixture?.round || '',
		...
	};
}
```

`division` is already threaded into the function's signature and presumably already
passed by every caller (verify the call sites, but the parameter existing and going
unused is a strong signal this was anticipated) — it is simply never read inside the
function body. There is no `division` key in the returned object.

**System templates are static, hand-seeded data — not organiser-editable.**
`SYSTEM_TEMPLATES` in `scoresheetTemplates.js` is a hardcoded array of two entries (FIVB
Indoor 2013, FIVB Beach 2024), each with a `pdfUrl` pointing at a bundled asset and a
`fields` array of marker coordinates. Per that file's own comment, these coordinates
"were seeded through the marker-placement screen itself, not hand-typed" — i.e. a
developer ran the same upload-and-place flow this handover extends, then copied the
resulting JSON in by hand (`ScoresheetTemplateModal.jsx` has a "Copy fields as JSON"
button in the placement screen's footer for exactly this). The picker screen in
`ScoresheetTemplateModal.jsx` renders `SYSTEM_TEMPLATES` as plain selectable buttons with
no edit affordance — organisers cannot reposition fields on them from the app UI at all,
today or after this handover.

**Custom templates are stored in the browser's IndexedDB, keyed by a generated id.**
`tourganiser-ui/src/utils/scoresheetStorage.js` wraps a single IndexedDB store,
`saveTemplate(record)` doing a `put` keyed on `record.id` — calling it again with the
same `id` **overwrites in place**; a different `id` creates a new, separate record. A
stored record's shape: `{ id, name, pdfBytes, pageCount, pageSize, fields }`.

**The placement screen is already fully generic and reusable.**
`ScoresheetTemplateModal.jsx`'s `FieldPlacementScreen` component takes a `draft` object
shaped `{ name, pdfBytes, pageCount, pageSize, fields, currentPage, activeField }` — it
has no idea whether that draft came from a brand-new upload or an existing stored
template. `startPlacing` (the current, only way into this screen) builds exactly that
shape from a freshly-read `File`. Everything the placement UI needs — the canvas render,
drag-to-place, the fields side panel, page navigation, "Copy fields as JSON" — already
works against any draft matching that shape; nothing in `FieldPlacementScreen` itself
needs to change to support re-opening an existing template.

One shape difference to account for: markers in a fresh `placingDraft.fields` carry a
local-only `key: crypto.randomUUID()` (for React list identity and the remove button —
stripped by `withoutKey` before saving), but a stored record's `fields` array
(`scoresheetStorage.js`'s shape comment) does **not** have `key` — it was stripped on the
way in by the same `withoutKey` function when the template was first saved. Loading a
stored record into `placingDraft` needs to re-add a fresh `key` to each marker, the same
way a first-time upload does when a marker is placed (`placeMarker` calls
`crypto.randomUUID()` per marker as it's added — an existing record's markers need the
same treatment done once, up front, when the draft is built).

**`handleSaveCustomTemplate` currently always creates.** It calls
`crypto.randomUUID()` for a fresh `id` unconditionally, then `saveTemplate({ id, ... })`.
There is currently no code path that saves back to an existing `id`.

## 4. Decisions already made

- **Division is added to the field catalogue for all templates (system and custom
  alike), but its coordinates on the two bundled system-template PDFs are out of scope
  for this handover.** Adding it to the catalogue makes it placeable on any *custom*
  template immediately, and on any future system template a developer seeds by hand.
  Hand-guessing xRatio/yRatio coordinates for a "Division" box on the official FIVB
  sheets without visually inspecting the rendered PDF risks drawing a box over existing
  print content — not something to do blind. If Tom wants Division actually placed on
  the two bundled templates, that's a short follow-up: open the app, use "Upload new
  template" against the same PDF files (or use the browser's own placement screen once
  this ships against a copy of them) to find a suitable spot, then paste the resulting
  field's JSON entry into `SYSTEM_TEMPLATES` by hand, matching the existing pattern.
- **Editing is offered only for custom (organiser-uploaded) templates**, not system
  ones — consistent with the fact above that system templates have no edit affordance
  today and aren't meant to be organiser-editable.
- **Editing reuses the exact same `FieldPlacementScreen` and the exact same footer
  actions** ("Copy fields as JSON", Cancel, Save) as the upload flow. The only behaviour
  that differs is what happens on save: update the existing record's `id` rather than
  minting a new one.

## 5. Non-goals

- Don't change anything about how system templates are stored, selected, or rendered.
- Don't build any new UI for visually inspecting/placing fields on system templates from
  within the app — that stays a developer/build-time activity, per the Decision above.
- Don't change `withoutKey`, the marker shape, or the IndexedDB schema
  (`scoresheetStorage.js`'s `DB_VERSION`) — nothing here requires a shape change.
- Don't touch `generateScoresheet` or `mergeScoresheets` in `scoresheetPrefill.js` — the
  rendering/overlay mechanism is unaffected by either change in this handover.

## 6. Numbered steps

### Step 1 — Add Division as a placeable field

**Why:** the organiser wants a division's name available to print on scoresheets, the
same way team names, dates and match numbers already are.

**Files:** `tourganiser-ui/src/utils/scoresheetTemplates.js`,
`tourganiser-ui/src/utils/scoresheetPrefill.js`.

**Do:**
- In `scoresheetTemplates.js`, add `'division'` to the `SCORESHEET_FIELDS` array (any
  position — order determines nothing but the field list's display order in the panel)
  and add `division: 'Division'` to `FIELD_LABELS`.
- In `scoresheetPrefill.js`, in `buildFieldValues`, add a `division` key to the returned
  object, sourced from the existing `division` parameter — the field the organiser will
  most likely want is the division's display name (check what shape `division` arrives
  in at the call site: confirm whether it's the full division object or already just a
  name, and read `.name` if it's the former). Follow the same "blank rather than a
  placeholder" rule every other field here follows — empty string, not `undefined` or a
  literal like "TBD", when the division can't be resolved.

**Don't:** don't touch `SYSTEM_TEMPLATES`' `fields` arrays — per the Decision above, this
step only makes the field *available*, it doesn't place it anywhere.

**Verify:**
- Open the scoresheet template picker for a tournament, upload a new custom template (or
  edit an existing one, once Step 2 ships), open the fields panel — "Division" appears
  in the list alongside the existing fields.
- Place a Division marker on a custom template, download a scoresheet for a fixture in a
  named division — the division's name prints in the placed box.
- A fixture whose division can't be resolved (if that's reachable at all) leaves the box
  blank rather than printing anything malformed.

### Step 2 — Let a custom template's field placement be edited after upload

**Why:** today, changing anything about where fields print on an already-uploaded custom
template means re-uploading the PDF from scratch and re-placing every field.

**Files:** `tourganiser-ui/src/components/tournament/ScoresheetTemplateModal.jsx` only.

**Do:**
- Add an edit affordance to each custom template's row in the picker screen (the
  `customTemplates.map(...)` block, ~line 298) — a small icon button alongside the
  existing selectable button, in the spirit of the existing "Upload new template"
  action. It must not itself trigger the row's `onClick` (selecting the template) —
  follow the same `stopPropagation` pattern the codebase already uses for a control
  nested inside a clickable card (see the profile page's saved-tournament remove button,
  or any other "small control inside a bigger clickable row" instance in this codebase).
- On click, build a `placingDraft` from the existing stored record instead of from a
  fresh upload: `{ name: template.name, pdfBytes: template.pdfBytes, pageCount:
  template.pageCount, pageSize: template.pageSize, fields: template.fields.map(marker =>
  ({ ...marker, key: crypto.randomUUID() })), currentPage: 0, activeField:
  SCORESHEET_FIELDS[0] }` — the `key` re-addition matters, see Established Facts. You
  will also need the PDF re-loaded through `pdfjsLib.getDocument` into a `pdfDoc` state
  value the same way `startPlacing` does, since `FieldPlacementScreen` renders from
  `pdfDoc`, not from `pdfBytes` directly — reuse the same loading logic `startPlacing`
  already has rather than writing a second copy of it.
- Track which record is being edited (its existing `id`) somewhere reachable from
  `handleSaveCustomTemplate` — e.g. keep the `id` on the `placingDraft` itself as an
  extra field, defaulting to `undefined`/absent for a brand-new upload.
- Change `handleSaveCustomTemplate` to reuse `placingDraft`'s `id` when present (`const
  id = placingDraft.id || crypto.randomUUID();`), and to only append a new entry to
  `customTemplates` state when it wasn't already there — for an edit, replace the
  existing entry in `customTemplates` by id rather than appending a duplicate.
- Update the placement screen's title/subtitle to distinguish the two entry points if it
  reads oddly otherwise (e.g. "Upload the PDF..." lede doesn't apply when editing) —
  minor, use judgement, but don't leave upload-specific copy showing during an edit.

**Don't:**
- Don't add editing for system templates — see Decisions above.
- Don't change `FieldPlacementScreen` itself — it should not need to know whether it's
  editing or creating; that distinction lives entirely in `ScoresheetTemplateModal`'s
  state and its save handler.
- Don't add a "delete template" action as part of this — out of scope, not asked for.

**Verify:**
- Upload a custom template, place a few fields, save it. Reopen the picker, click Edit
  on that template — the same PDF renders with the same markers already in place,
  editable (add, remove, reposition via redraw) exactly as during the original upload.
- Save the edit — confirm the picker's custom-templates list still shows exactly one
  entry for this template (not a duplicate), with the updated field count/placement.
- Confirm the template's `id` did not change — download a scoresheet using
  `templateKey = custom:<id>` from *before* the edit (e.g. a value already stored on
  `tournaments.scoresheet_template` from an earlier selection) and confirm it still
  resolves to the same, now-updated template rather than 404ing.
- Cancel out of an edit partway through (Cancel button, or Escape) — confirm the
  original stored record is unchanged.
- Confirm uploading a brand-new template still works exactly as before this change (no
  regression to the create path).

## 7. Final validation

- `npm run lint` from `tourganiser-ui/` — confirm the pre-existing error count (5) has
  not grown.
- `npm run build` from `tourganiser-ui/` — confirm it still succeeds.
- Walk both steps' Verify lists in one pass, including at least one full round-trip:
  upload → place fields including Division → save → edit → reposition Division → save →
  download a scoresheet and confirm the printed Division value sits at the new position.
