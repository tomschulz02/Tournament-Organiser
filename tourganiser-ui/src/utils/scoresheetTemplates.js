// The system-shipped scoresheet templates. Both are static assets in the
// frontend bundle — the PDF plus a coordinate map committed here — because
// there are only ever a fixed, small, developer-curated set of them. See
// docs/handover-scoresheets.md for the mechanism this feeds.

// The fixed set of header fields Tourganiser can prefill — every field any
// template might have room for, offered the same way regardless of what the
// underlying sheet looks like. Not every template will have a marker for
// every one of these (a beach sheet has no "Time" cell, say), and that is
// fine: a field with no marker is simply never printed on that template —
// see ScoresheetTemplateModal's placement screen. This used to be split into
// indoor/beach lists gated by a sheet-type choice made before upload; that
// added a decision up front for no benefit, since which fields exist on a
// given PDF is exactly what placing markers already discovers.
//
// Several pieces of information — the date, the time, a team name — can be
// printed in more than one style, because different scoresheet layouts
// expect different ones. Each style is its own field id here rather than a
// formatting choice attached to one field, so a template can place several
// styles of the same underlying value in different places if it needs to
// (see docs/handover-scoresheets.md's follow-up on this). `date`, `time`,
// `matchNo`, `team1Name` and `team2Name` are the original field ids and stay
// exactly as they were, so templates seeded before the variants existed keep
// working unchanged.
export const SCORESHEET_FIELDS = [
	'competitionName',
	'hall',
	'site',
	'court',
	'date',
	'dateDMY',
	'dateMDY',
	'dateYMD',
	'dateLong',
	'time',
	'time12h',
	'poolPhase',
	'matchNo',
	'matchNoPadded',
	'team1Name',
	'team1Abbr3',
	'team1Abbr4',
	'team2Name',
	'team2Abbr3',
	'team2Abbr4',
	'division',
];

// Human-readable labels for the marker-placement screen and any future field list UI.
export const FIELD_LABELS = {
	competitionName: 'Name of Competition',
	hall: 'Hall',
	site: 'Site',
	court: 'Court',
	date: 'Date (YYYY-MM-DD)',
	dateDMY: 'Date (DD/MM/YYYY)',
	dateMDY: 'Date (MM/DD/YYYY)',
	dateYMD: 'Date (YYYY/MM/DD)',
	dateLong: 'Date (17 August 2026)',
	time: 'Time (24-hour)',
	time12h: 'Time (12-hour)',
	poolPhase: 'Pool / Phase',
	matchNo: 'Match No.',
	matchNoPadded: 'Match No. (zero-padded)',
	team1Name: 'Team A name',
	team1Abbr3: 'Team A abbreviation (3 letters)',
	team1Abbr4: 'Team A abbreviation (4 letters)',
	team2Name: 'Team B name',
	team2Abbr3: 'Team B abbreviation (3 letters)',
	team2Abbr4: 'Team B abbreviation (4 letters)',
	division: 'Division',
};

// Each fields array was seeded through the marker-placement screen itself,
// not hand-typed — see docs/handover-scoresheets.md, Step 9.
export const SYSTEM_TEMPLATES = [
	{
		key: 'fivb-indoor-2013',
		label: 'FIVB Indoor Volleyball (2013)',
		pdfUrl: '/scoresheet-templates/fivb-indoor-2013.pdf',
		pageCount: 1,
		pageSize: [{ width: 1190.55, height: 841.89 }],
		fields: [
			{ field: 'competitionName', page: 0, xRatio: 0.15511204481792717, yRatio: 0.04096534653465347, widthRatio: 0.37675070028011204, heightRatio: 0.020792079207920793 },
			{ field: 'hall', page: 0, xRatio: 0.06477591036414566, yRatio: 0.08849009900990099, widthRatio: 0.13375350140056022, heightRatio: 0.01782178217821782 },
			{ field: 'dateDMY', page: 0, xRatio: 0.405812324929972, yRatio: 0.0686881188118812, widthRatio: 0.07983193277310924, heightRatio: 0.01881188118811881 },
			{ field: 'time', page: 0, xRatio: 0.5241596638655462, yRatio: 0.0686881188118812, widthRatio: 0.056022408963585436, heightRatio: 0.019801980198019802 },
			{ field: 'poolPhase', page: 0, xRatio: 0.25315126050420167, yRatio: 0.0875, widthRatio: 0.04201680672268908, heightRatio: 0.019801980198019802 },
			{ field: 'matchNoPadded', page: 0, xRatio: 0.34558823529411764, yRatio: 0.0875, widthRatio: 0.028011204481792718, heightRatio: 0.020792079207920793 },
			{ field: 'team1Abbr3', page: 0, xRatio: 0.4170168067226891, yRatio: 0.10433168316831683, widthRatio: 0.04481792717086835, heightRatio: 0.02574257425742574 },
			{ field: 'team2Abbr3', page: 0, xRatio: 0.5073529411764706, yRatio: 0.10433168316831683, widthRatio: 0.04341736694677871, heightRatio: 0.02574257425742574 },
			{ field: 'team2Abbr3', page: 0, xRatio: 0.8918067226890757, yRatio: 0.5271039603960396, widthRatio: 0.046218487394957986, heightRatio: 0.024752475247524754 },
			{ field: 'team1Abbr3', page: 0, xRatio: 0.8105742296918768, yRatio: 0.5271039603960396, widthRatio: 0.04481792717086835, heightRatio: 0.02277227722772277 },
		],
	},
	{
		key: 'fivb-beach-2024',
		label: 'FIVB Beach Volleyball (2024)',
		pdfUrl: '/scoresheet-templates/fivb-beach-2024.pdf',
		pageCount: 2,
		pageSize: [
			{ width: 841.92, height: 595.32 },
			{ width: 841.92, height: 595.32 },
		],
		fields: [
			{ field: 'competitionName', page: 0, xRatio: 0.11534653465346535, yRatio: 0.0859593837535014, widthRatio: 0.45643564356435645, heightRatio: 0.03081232492997199 },
			{ field: 'matchNoPadded', page: 0, xRatio: 0.07673267326732673, yRatio: 0.12657563025210083, widthRatio: 0.048514851485148516, heightRatio: 0.03221288515406162 },
			{ field: 'site', page: 0, xRatio: 0.15, yRatio: 0.12937675070028012, widthRatio: 0.10594059405940594, heightRatio: 0.029411764705882353 },
			{ field: 'court', page: 0, xRatio: 0.43415841584158416, yRatio: 0.1209733893557423, widthRatio: 0.04257425742574258, heightRatio: 0.0392156862745098 },
			{ field: 'dateDMY', page: 0, xRatio: 0.5014851485148515, yRatio: 0.12377450980392157, widthRatio: 0.07128712871287128, heightRatio: 0.03361344537815126 },
			{ field: 'team1Name', page: 0, xRatio: 0.07277227722772277, yRatio: 0.1713935574229692, widthRatio: 0.297029702970297, heightRatio: 0.046218487394957986 },
			{ field: 'team2Name', page: 0, xRatio: 0.5628712871287128, yRatio: 0.17279411764705882, widthRatio: 0.30495049504950494, heightRatio: 0.047619047619047616 },
			{ field: 'team1Abbr3', page: 1, xRatio: 0.15594059405940594, yRatio: 0.40808823529411764, widthRatio: 0.06831683168316832, heightRatio: 0.028011204481792718 },
			{ field: 'team1Abbr3', page: 0, xRatio: 0.39455445544554457, yRatio: 0.18820028011204482, widthRatio: 0.07227722772277227, heightRatio: 0.03361344537815126 },
			{ field: 'team2Abbr3', page: 0, xRatio: 0.8905940594059406, yRatio: 0.18960084033613445, widthRatio: 0.07425742574257425, heightRatio: 0.03081232492997199 },
			{ field: 'team2Abbr3', page: 1, xRatio: 0.3410891089108911, yRatio: 0.4108893557422969, widthRatio: 0.07227722772277227, heightRatio: 0.03221288515406162 },
			{ field: 'team2Abbr3', page: 1, xRatio: 0.556930693069307, yRatio: 0.5187324929971989, widthRatio: 0.07227722772277227, heightRatio: 0.03361344537815126 },
			{ field: 'team1Abbr3', page: 1, xRatio: 0.556930693069307, yRatio: 0.4795168067226891, widthRatio: 0.07227722772277227, heightRatio: 0.03081232492997199 },
		],
	},
];

export function getSystemTemplate(key) {
	return SYSTEM_TEMPLATES.find((template) => template.key === key) || null;
}
