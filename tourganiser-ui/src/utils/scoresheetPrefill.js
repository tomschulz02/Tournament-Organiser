import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getSystemTemplate } from './scoresheetTemplates';
import { getTemplate } from './scoresheetStorage';
import { parseDateOnly } from './scheduleUtils';

// Looks up a template by its tournaments.scoresheet_template value. A
// recognised system key resolves to the bundled asset; a `custom:<uuid>` key
// is looked up in this browser's IndexedDB. Either can come back null: an
// unrecognised system key, or a custom template selected on a different
// device than the one viewing it now — the device-bound-miss case the UI has
// to show explicitly rather than a broken download. See
// docs/handover-scoresheets.md.
export async function resolveTemplate(templateKey) {
	if (!templateKey) return null;

	const system = getSystemTemplate(templateKey);
	if (system) return { ...system, isCustom: false };

	if (templateKey.startsWith('custom:')) {
		const id = templateKey.slice('custom:'.length);
		const record = await getTemplate(id);
		return record ? { ...record, isCustom: true } : null;
	}

	return null;
}

// Date/time/name formatting helpers behind the field variants in
// scoresheetTemplates.js's SCORESHEET_FIELDS. Each takes the same raw value
// buildFieldValues already has (the ISO day string, the 24-hour time string,
// a team name) and returns '' for anything it cannot parse, matching the
// "blank rather than a placeholder" rule for every other field here.

function formatDatePart(isoDate) {
	const date = parseDateOnly(isoDate);
	if (!date) return null;

	return {
		day: String(date.getDate()).padStart(2, '0'),
		month: String(date.getMonth() + 1).padStart(2, '0'),
		year: String(date.getFullYear()),
		date,
	};
}

function formatDateDMY(isoDate) {
	const parts = formatDatePart(isoDate);
	return parts ? `${parts.day}/${parts.month}/${parts.year}` : '';
}

function formatDateMDY(isoDate) {
	const parts = formatDatePart(isoDate);
	return parts ? `${parts.month}/${parts.day}/${parts.year}` : '';
}

function formatDateYMD(isoDate) {
	const parts = formatDatePart(isoDate);
	return parts ? `${parts.year}/${parts.month}/${parts.day}` : '';
}

function formatDateLong(isoDate) {
	const parts = formatDatePart(isoDate);
	if (!parts) return '';

	return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(parts.date);
}

// 24-hour "HH:MM" to 12-hour "h:MM AM/PM". Malformed input (missing colon, a
// non-numeric hour) falls back to '' rather than a half-formatted string.
function formatTime12h(time24) {
	const match = /^(\d{1,2}):(\d{2})$/.exec(time24 || '');
	if (!match) return '';

	const hours = Number(match[1]);
	const period = hours >= 12 ? 'PM' : 'AM';
	const hour12 = ((hours + 11) % 12) + 1;

	return `${hour12}:${match[2]} ${period}`;
}

// A 2-digit zero-padded match number — "03" rather than "3" — for a template
// whose match-number cell is styled that way. Never truncates: a 3-digit
// match number still prints in full.
function formatMatchNoPadded(matchNo) {
	return matchNo == null ? '' : String(matchNo).padStart(2, '0');
}

// A readable `length`-letter code for `name`, built the way a country or
// airport code is: one letter per word first — the "spine", the part a
// reader actually recognises the name by — then, if more letters are still
// needed, extra letters pulled from inside the words, last word first since
// that is usually the part that actually distinguishes one name from
// another sharing the same start ("Team Ace" vs "Team Alpha" differ in their
// second word, not their first, so the extra letter comes from "Ace"/"Alpha"
// — TAC / TAL — not from "Team").
//
// This is deliberately not the same problem a hash solves: a hash spreads
// unrelated names apart evenly but produces letters with no relationship to
// the name at all, which is illegible on a scoresheet — nobody can look at
// a hashed code and tell which team it is. Reading meaningful letters out of
// the name instead means two sufficiently different names read as
// recognisably different codes without needing to be different in every
// character, at the cost of two names that are *this* similar in every word
// but one occasionally still landing on the same letters — the same
// trade-off a real code system makes.
//
// Pure and stateless throughout: the same name always walks this same
// procedure to the same letters, so there is nothing to generate once and
// remember — every call recomputes it fresh from the name alone.
//
// Digits are kept as their own words rather than stripped — "Team Ace 1" and
// "Team Ace 2" are two words the same and differ only in a trailing digit,
// and that digit is exactly the part meant to tell them apart. Stripping it
// would collapse both to the same "TEAM ACE" and the same code, which is the
// prefix-collision problem this function exists to avoid in the first place.
function abbreviateTeamName(name, length) {
	const words = String(name ?? '')
		.toUpperCase()
		.replace(/[^A-Z0-9\s]/g, '')
		.trim()
		.split(/\s+/)
		.filter(Boolean);

	// Nothing usable at all (a name that is entirely punctuation or
	// whitespace) — fall back to the raw characters so the field is never
	// blank just because the name is unusual.
	if (words.length === 0) {
		return String(name ?? '')
			.slice(0, length)
			.toUpperCase();
	}

	const letters = words.slice(0, length).map((word) => word[0]);

	for (let wordIndex = words.length - 1; letters.length < length && wordIndex >= 0; wordIndex -= 1) {
		const word = words[wordIndex];
		for (let charIndex = 1; charIndex < word.length && letters.length < length; charIndex += 1) {
			letters.push(word[charIndex]);
		}
	}

	// Only reached when the name's total letters, across every word, are
	// fewer than `length` — pads with the last letter found rather than
	// leaving the code short.
	while (letters.length < length) {
		letters.push(letters[letters.length - 1] || 'X');
	}

	return letters.slice(0, length).join('');
}

// The fixed header fields a scoresheet can be prefilled with, sourced exactly
// per docs/handover-scoresheets.md's "Where each field's value comes from"
// section — every variant field derives from the same underlying value as
// its base field, just formatted differently. Anything not yet known is an
// empty string rather than a placeholder — a blank cell on the printed sheet
// is what the officials expect to fill in by hand.
//
// scheduleEntry is whatever the caller already resolved for this fixture via
// getScheduleForTournament/flattenFixtures — { day, startTime, courtName } —
// rather than being re-derived here.
export function buildFieldValues(fixture, tournament, division, scheduleEntry) {
	const day = scheduleEntry?.day || '';
	const startTime = scheduleEntry?.startTime || '';
	const matchNo = fixture?.match_no ?? null;
	const team1Name = fixture?.team_1_id ? fixture?.teams?.team_1?.name || '' : '';
	const team2Name = fixture?.team_2_id ? fixture?.teams?.team_2?.name || '' : '';

	return {
		competitionName: tournament?.name || '',
		hall: tournament?.location || '',
		site: tournament?.location || '',
		court: scheduleEntry?.courtName || '',
		date: day,
		dateDMY: formatDateDMY(day),
		dateMDY: formatDateMDY(day),
		dateYMD: formatDateYMD(day),
		dateLong: formatDateLong(day),
		time: startTime,
		time12h: formatTime12h(startTime),
		poolPhase: fixture?.round || '',
		matchNo: matchNo != null ? String(matchNo) : '',
		matchNoPadded: formatMatchNoPadded(matchNo),
		team1Name,
		team1Abbr3: abbreviateTeamName(team1Name, 3),
		team1Abbr4: abbreviateTeamName(team1Name, 4),
		team2Name,
		team2Abbr3: abbreviateTeamName(team2Name, 3),
		team2Abbr4: abbreviateTeamName(team2Name, 4),
	};
}

// The font sizes tried, largest first, when fitting a value into its placed
// box. Below MIN_FONT_SIZE the text is drawn at MIN_FONT_SIZE regardless and
// allowed to overflow the box — a readable-but-oversized value beats an
// invisible one, and a box this small is a template-authoring problem, not
// something to hide silently.
const MAX_FONT_SIZE = 14;
const MIN_FONT_SIZE = 6;
const FONT_SIZE_STEP = 0.5;
const LINE_HEIGHT_RATIO = 1.15;

// Greedy word wrap: adds words to the current line while it still fits
// `maxWidth` at `fontSize`, starting a new line otherwise. A single word
// wider than the box on its own is kept whole rather than split mid-word —
// it overflows the box the same way a too-small MIN_FONT_SIZE does.
function wrapText(text, font, fontSize, maxWidth) {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [''];

	const lines = [];
	let current = words[0];

	for (let index = 1; index < words.length; index += 1) {
		const candidate = `${current} ${words[index]}`;
		if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
			current = candidate;
		} else {
			lines.push(current);
			current = words[index];
		}
	}

	lines.push(current);
	return lines;
}

// The largest font size (stepping down from MAX_FONT_SIZE) whose wrapped
// lines all fit within the box, both wide and tall. Falls back to
// MIN_FONT_SIZE — still wrapped, just allowed to overflow the box's height —
// rather than refusing to draw anything.
function fitTextToBox(text, font, boxWidth, boxHeight) {
	for (let fontSize = MAX_FONT_SIZE; fontSize >= MIN_FONT_SIZE; fontSize -= FONT_SIZE_STEP) {
		const lineHeight = fontSize * LINE_HEIGHT_RATIO;
		const lines = wrapText(text, font, fontSize, boxWidth);

		if (lines.length * lineHeight <= boxHeight) {
			return { lines, fontSize, lineHeight };
		}
	}

	const lineHeight = MIN_FONT_SIZE * LINE_HEIGHT_RATIO;
	return { lines: wrapText(text, font, MIN_FONT_SIZE, boxWidth), fontSize: MIN_FONT_SIZE, lineHeight };
}

// Filled-in values are drawn bold, on a white plate, precisely so they read
// as "typed in", not as part of the sheet's own printed layout — a bare thin
// value in the same weight as the sheet's own print is easy to mistake for a
// pre-printed label right next to it, especially at the small sizes a tight
// box forces. The plate is drawn slightly larger than the box on every side
// so it fully covers whatever is printed underneath, right up to the box's
// edge.
const WHITE_PLATE_PADDING = 1;

// Loads the template's PDF and draws each field with a placed area and a
// non-blank value onto it, word-wrapped and sized to fit that area. A field
// with no marker in template.fields is never drawn — that is "not printed
// for this template", decided in the marker-placement screen, not an error
// here. A field with a marker but no value (the data is not known yet) is
// likewise just not drawn.
//
// pdf-lib's origin is bottom-left; the marker screen stores the box's
// top-left corner as a top-left-origin ratio. The flip happens here, once.
export async function generateScoresheet(template, fieldValues) {
	const bytes = template.pdfBytes || (await fetch(template.pdfUrl).then((response) => response.arrayBuffer()));
	const pdfDoc = await PDFDocument.load(bytes);
	const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const pages = pdfDoc.getPages();

	template.fields.forEach((marker) => {
		const value = fieldValues[marker.field];
		if (!value) return;

		const page = pages[marker.page];
		if (!page) return;

		const { width, height } = page.getSize();
		const boxX = marker.xRatio * width;
		const boxWidth = marker.widthRatio * width;
		const boxHeight = marker.heightRatio * height;
		// The box's top edge, converted once to pdf-lib's bottom-left origin.
		const boxTop = (1 - marker.yRatio) * height;

		page.drawRectangle({
			x: boxX - WHITE_PLATE_PADDING,
			y: boxTop - boxHeight - WHITE_PLATE_PADDING,
			width: boxWidth + WHITE_PLATE_PADDING * 2,
			height: boxHeight + WHITE_PLATE_PADDING * 2,
			color: rgb(1, 1, 1),
		});

		const { lines, fontSize, lineHeight } = fitTextToBox(String(value), font, boxWidth, boxHeight);

		lines.forEach((line, index) => {
			page.drawText(line, {
				x: boxX,
				y: boxTop - fontSize - index * lineHeight,
				size: fontSize,
				font,
				color: rgb(0, 0, 0),
			});
		});
	});

	return pdfDoc.save();
}

// Merges one filled scoresheet per fixture into a single PDF, in the order
// the fixtures were given. Used by "Print all scoresheets".
export async function mergeScoresheets(pdfByteArrays) {
	const merged = await PDFDocument.create();

	for (const bytes of pdfByteArrays) {
		const source = await PDFDocument.load(bytes);
		const pages = await merged.copyPages(source, source.getPageIndices());
		pages.forEach((page) => merged.addPage(page));
	}

	return merged.save();
}
