import {
	EMPTY_FILTERS,
	flattenFixtures,
	matchesFixtureFilters,
	roundHolding,
} from '../components/tournament/fixtureUtils';

// What a results export contains and where its pages break.
//
// Pure, like schedulePrintLayout.js: nothing here renders, and nothing here
// recomputes a ranking, a standing or a winner. A printed pack is read as the
// official record, so every figure on it is the server's, passed through.
//
// The exports are fixed A4 pages built in JavaScript. A page that is given more
// than it can hold clips its last rows off the paper without any error, so the
// heights below are the contract: styles/results-export.css must hold every
// block at exactly the height named here (one-line team names with an ellipsis,
// fixed row heights), or the budget has to change with it.

export const EXPORT_KINDS = ['fixtures', 'final', 'pack'];

export function isExportKind(kind) {
	return EXPORT_KINDS.includes(kind);
}

// An A4 page at 96dpi, in CSS pixels, and what its chrome takes from it.
export const PAGE_HEIGHT = 1123;
export const HEADER_HEIGHT = 108;
export const FOOTER_HEIGHT = 40;
// The centred page title, including its margins.
export const TITLE_HEIGHT = 80;
// The line under the title stating the filter in force.
export const SUBTITLE_HEIGHT = 24;
// Clear paper kept above the footer band. Deliberately generous: the safe
// failure is a page that breaks a little early, not one that overflows.
export const BODY_BOTTOM_GAP = 24;

// What is left for blocks on a page with a title.
export const BODY_BUDGET = PAGE_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT - TITLE_HEIGHT - BODY_BOTTOM_GAP;

// The height of every block a page can hold, margins included. The stylesheet
// must match these.
export const BLOCK_HEIGHTS = {
	// A division's name above its fixtures or tables.
	heading: 40,
	// A round or pool name above its cards.
	subheading: 30,
	// One fixture: two team lines.
	card: 64,
	tableHead: 34,
	tableRow: 26,
	// The space after a table or a group of cards.
	gap: 16,
	// Final ranking: 1st place, 2nd and 3rd place, then the numbered list.
	rankingFirst: 96,
	rankingBlock: 64,
	rankingRow: 30,
};

// Blocks that introduce what follows them. One of these is never the last thing
// on a page.
const KEEP_WITH_NEXT = new Set(['heading', 'subheading', 'tableHead']);

const FILTER_KEYS = Object.keys(EMPTY_FILTERS);

// The tab's filters as a query string, without the leading "?". Only the known
// keys, and only those that are set.
export function filtersToQuery(filters = {}) {
	const params = new URLSearchParams();

	FILTER_KEYS.forEach((key) => {
		const value = typeof filters[key] === 'string' ? filters[key].trim() : '';
		if (value) params.set(key, value);
	});

	return params.toString();
}

// The address of the fixture results export for a tab's current filters.
export function resultsExportPath(tournamentId, filters) {
	const query = filtersToQuery(filters);

	return `/tournaments/view/${tournamentId}/results/fixtures${query ? `?${query}` : ''}`;
}

// The reverse of filtersToQuery. Accepts a string with or without its "?", or a URLSearchParams.
// Anything that is not a filter key is ignored.
export function filtersFromQuery(search = '') {
	const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
	const filters = { ...EMPTY_FILTERS };

	FILTER_KEYS.forEach((key) => {
		const value = params.get(key);
		if (value) filters[key] = value;
	});

	return filters;
}

// The fixtures an export lists: completed ones only, narrowed by the tab's
// filters. Returned flattened (with division_name and stage), in match-number
// order.
//
// Day and court are not on a fixture. They are applied through the schedule's
// entries, exactly as ScheduleTab's buildSections does — so with either set and
// no schedule to read, nothing matches.
//
// A status filter other than COMPLETED selects nothing, which is the point: the
// export holds results, and nothing else has one.
export function selectExportFixtures({ divisions = [], filters = EMPTY_FILTERS, schedule = null } = {}) {
	const applied = { ...EMPTY_FILTERS, ...filters };
	let scheduled = null;

	if (applied.day || applied.courtId) {
		const entries = Array.isArray(schedule?.entries) ? schedule.entries : [];

		scheduled = new Set(
			entries
				.filter((entry) => entry.fixtureId)
				.filter((entry) => !applied.day || entry.day === applied.day)
				.filter((entry) => !applied.courtId || entry.courtId === applied.courtId)
				.map((entry) => entry.fixtureId),
		);
	}

	return flattenFixtures(divisions).filter(
		(fixture) =>
			fixture.status === 'COMPLETED' &&
			matchesFixtureFilters(fixture, applied) &&
			(scheduled === null || scheduled.has(fixture.id)),
	);
}

// The filter in force, for the line under the title: "Men · Playoffs · 14
// results". Day and court read their labels from the schedule and fall back to
// the raw value without one.
export function describeFilters({ filters = EMPTY_FILTERS, divisions = [], schedule = null, count = 0 } = {}) {
	const applied = { ...EMPTY_FILTERS, ...filters };
	const parts = [];

	if (applied.divisionId) {
		const division = divisions.find((item) => item.id === applied.divisionId);
		if (division?.name) parts.push(division.name);
	}

	if (applied.round) parts.push(applied.round);

	if (applied.day) {
		const day = schedule?.days?.find((item) => item.date === applied.day);
		parts.push(day?.label || applied.day);
	}

	if (applied.courtId) {
		const court = schedule?.courts?.find((item) => item.id === applied.courtId);
		parts.push(court?.name || applied.courtId);
	}

	const team = applied.team.trim();
	if (team) parts.push(`Teams matching "${team}"`);

	if (parts.length === 0) parts.push('All divisions');
	parts.push(`${count} ${count === 1 ? 'result' : 'results'}`);

	return parts.join(' · ');
}

// The selected fixtures by division, then round, each in match-number order,
// with a division's rounds split into round-robin and knockout.
//
// A round is knockout when it is one of the division's bracket rounds. The
// 3rd-place playoff and a placement match ("Semifinals · Places 5-8") are named
// for themselves but belong to a bracket round, which roundHolding resolves.
// "Pool Play · Pool A" resolves to "Pool Play", which no bracket holds.
//
// Divisions keep the order they arrive in, and one with nothing selected is
// left out.
export function groupFixtures(divisions = [], fixtures = []) {
	return divisions
		.map((division) => {
			const bracketRounds = new Set((division.bracket?.rounds ?? []).map((round) => round.name));
			const roundRobin = [];
			const knockout = [];
			const byRound = new Map();

			fixtures
				.filter((fixture) => fixture.division_id === division.id)
				.forEach((fixture) => {
					if (!byRound.has(fixture.round)) {
						const group = { round: fixture.round, fixtures: [] };

						byRound.set(fixture.round, group);
						(bracketRounds.has(roundHolding(fixture.round)) ? knockout : roundRobin).push(group);
					}

					byRound.get(fixture.round).fixtures.push(fixture);
				});

			return { division, roundRobin, knockout };
		})
		.filter((group) => group.roundRobin.length > 0 || group.knockout.length > 0);
}

export function blockHeight(block) {
	return block.height ?? BLOCK_HEIGHTS[block.type] ?? 0;
}

// Splits blocks into pages. A block is { type, ... } with its height read from
// BLOCK_HEIGHTS, or from its own `height` when it has one.
//
// A heading, subheading or table head never ends a page: when the block after
// it does not fit, it moves to the next page with that block. A block taller
// than the budget still gets a page — the caller's heights are wrong, and
// dropping it would be worse than showing it.
//
// `opener`, when given, is asked for blocks to put at the top of each page
// after the first, and is passed the block that page would otherwise open with.
// They count against that page's budget.
export function paginate(blocks = [], budget = BODY_BUDGET, opener = null) {
	const pages = [];
	let page = [];
	let used = 0;

	blocks.forEach((block) => {
		const height = blockHeight(block);

		if (page.length > 0 && used + height > budget) {
			const kept = [...page];
			const carried = [];

			while (kept.length > 0 && KEEP_WITH_NEXT.has(kept[kept.length - 1].type)) carried.unshift(kept.pop());

			// A page of nothing but headings is not ended: the block joins them
			// and overflows, rather than leaving a sheet with no content.
			if (kept.length > 0) {
				pages.push(kept);
				page = [...(opener ? opener(carried[0] ?? block) : []), ...carried];
				used = page.reduce((total, item) => total + blockHeight(item), 0);
			}
		}

		page.push(block);
		used += height;
	});

	if (page.length > 0) pages.push(page);

	return pages;
}

// The fixture results pages, from groupFixtures' output: each page a list of
// blocks — a division heading, a round subheading, or a fixture card.
//
// A page that opens part-way through a division or a round repeats the heading
// and subheading it belongs under, marked `continued`, so a sheet read on its
// own still says whose results it holds.
//
// The default budget allows for the filter line under the title.
export function fixtureResultPages(groups = [], budget = BODY_BUDGET - SUBTITLE_HEIGHT) {
	const blocks = groups.flatMap(({ division, roundRobin, knockout }) => [
		{ type: 'heading', division, continued: false },
		...[...roundRobin, ...knockout].flatMap(({ round, fixtures }) => [
			{ type: 'subheading', division, round, continued: false },
			...fixtures.map((fixture) => ({ type: 'card', division, round, fixture })),
		]),
	]);

	return paginate(blocks, budget, (first) => {
		if (first.type === 'heading') return [];

		const heading = { type: 'heading', division: first.division, continued: true };
		if (first.type === 'subheading') return [heading];

		return [heading, { type: 'subheading', division: first.division, round: first.round, continued: true }];
	});
}

// Whether a division has a knockout to draw as a tree.
function hasBracket(division) {
	return (division.bracket?.rounds ?? []).length > 0;
}

// The fixture results export's pages, each { kind, ... }:
//
//   cards  { blocks }     headings, round names and fixture cards
//   tree   { division }   that division's knockout, drawn as a bracket
//
// Without `tree`, everything is cards and the divisions run on from one another.
// With it, a division's knockout fixtures leave the cards for one tree page,
// which follows that division's round-robin cards — so each division then
// starts on a page of its own. A division whose knockout has no completed match
// gets no tree page.
export function fixtureExportPages({ groups = [], tree = false, budget = BODY_BUDGET - SUBTITLE_HEIGHT } = {}) {
	if (!tree) return fixtureResultPages(groups, budget).map((blocks) => ({ kind: 'cards', blocks }));

	return groups.flatMap(({ division, roundRobin, knockout }) => {
		const drawn = knockout.length > 0 && hasBracket(division);
		const cards = { division, roundRobin, knockout: drawn ? [] : knockout };

		return [
			...(cards.roundRobin.length + cards.knockout.length > 0
				? fixtureResultPages([cards], budget).map((blocks) => ({ kind: 'cards', blocks }))
				: []),
			...(drawn ? [{ kind: 'tree', division }] : []),
		];
	});
}

// How many division columns a final ranking page holds.
export const RANKING_COLUMNS_PER_PAGE = 2;

function rankingBlockType(rank) {
	if (rank === 1) return 'rankingFirst';
	if (rank === 2 || rank === 3) return 'rankingBlock';

	return 'rankingRow';
}

// The final ranking pages: each a list of columns, one division to a column.
//
// A column is { division, continued, rows }, where a row is the server's
// finalStandings entry with the block type it is drawn as. Rows keep the order
// and the ranks the server sent — a division still being played has only its
// lower places, and those are shown as they are.
//
// A division whose list is longer than a page continues in the same column
// position on the next page, so a page can carry a null where the division
// beside it has already finished. A division with no final standings is left
// out.
export function finalRankingPages(divisions = [], budget = BODY_BUDGET) {
	const columns = divisions
		.filter((division) => (division.finalStandings ?? []).length > 0)
		.map((division) => {
			const rows = division.finalStandings.map((row) => ({ type: rankingBlockType(row.rank), row }));

			// Every part of a column repeats the division's heading.
			return paginate(rows, budget - BLOCK_HEIGHTS.heading).map((part, index) => ({
				division,
				continued: index > 0,
				rows: part,
			}));
		});

	const pages = [];

	for (let start = 0; start < columns.length; start += RANKING_COLUMNS_PER_PAGE) {
		const group = columns.slice(start, start + RANKING_COLUMNS_PER_PAGE);
		const depth = Math.max(...group.map((parts) => parts.length));

		for (let index = 0; index < depth; index += 1) {
			pages.push(group.map((parts) => parts[index] ?? null));
		}
	}

	return pages;
}

// One division's standings as blocks: its heading, then a table per group — a
// head carrying the group's name, a row per team in the order the server
// ranked them, and a gap. A division with more than one round-robin round
// names each round above its tables.
function standingsBlocks(division) {
	const rounds = (division.standings ?? []).filter((round) => (round.groups ?? []).some((group) => group.standings?.length));
	if (rounds.length === 0) return [];

	return [
		{ type: 'heading', division, continued: false },
		...rounds.flatMap((round) => [
			...(rounds.length > 1 ? [{ type: 'subheading', division, round: round.round, continued: false }] : []),
			...round.groups
				.filter((group) => group.standings?.length)
				.flatMap((group) => {
					const table = { division, key: `${round.roundIndex}:${group.groupIndex}`, label: group.name || round.round };

					return [
						{ type: 'tableHead', ...table, continued: false },
						...group.standings.map((row, index) => ({ type: 'tableRow', ...table, position: index + 1, row })),
						{ type: 'gap', ...table },
					];
				}),
		]),
	];
}

// A page of standings never ends on the space after a table, and a table cut
// by a page break repeats its head.
function standingsPages(division, budget) {
	const pages = paginate(standingsBlocks(division), budget, (first) => {
		const heading = { type: 'heading', division: first.division, continued: true };
		if (first.type !== 'tableRow') return first.type === 'heading' ? [] : [heading];

		return [heading, { type: 'tableHead', division: first.division, key: first.key, label: first.label, continued: true }];
	});

	return pages
		.map((page) => page.filter((block, index) => block.type !== 'gap' || (index > 0 && index < page.length - 1)))
		.filter((page) => page.some((block) => block.type === 'tableRow'));
}

// The whole results pack, as one list of pages in print order. Each page is
// { kind, ... }:
//
//   cover      the first sheet
//   ranking    { columns }            final ranking, see finalRankingPages
//   standings  { division, blocks }   a division's round-robin tables
//   results    { division, blocks }   its round-robin fixtures, as cards
//   knockout   { division }           its knockout, drawn as a bracket: one
//                                     page, never split
//
// The order is the cover, the final ranking, then each division's standings,
// results and knockout. A section with nothing in it is left out, and a
// division with no completed fixture is left out entirely — its standings
// would be a table of zeros. With no completed fixture anywhere there is no
// pack at all, and the list is empty.
export function packPages({ divisions = [], budget = BODY_BUDGET } = {}) {
	const groups = groupFixtures(divisions, selectExportFixtures({ divisions }));
	if (groups.length === 0) return [];

	const played = groups.map((group) => group.division);

	return [
		{ kind: 'cover' },
		...finalRankingPages(played, budget).map((columns) => ({ kind: 'ranking', columns })),
		...groups.flatMap(({ division, roundRobin, knockout }) => [
			...standingsPages(division, budget).map((blocks) => ({ kind: 'standings', division, blocks })),
			...fixtureResultPages([{ division, roundRobin, knockout: [] }], budget)
				.filter(() => roundRobin.length > 0)
				.map((blocks) => ({ kind: 'results', division, blocks })),
			...(knockout.length > 0 && hasBracket(division) ? [{ kind: 'knockout', division }] : []),
		]),
	];
}

// Whether a division's knockout is drawn as a tree rather than as cards. Always
// in the pack. In the fixture export only when nothing but the division is
// filtered: any other filter can remove matches from the tree, and a tree with
// holes in it misreports the knockout.
export function usesKnockoutTree(kind, filters = EMPTY_FILTERS) {
	if (kind === 'pack') return true;
	if (kind !== 'fixtures') return false;

	const applied = { ...EMPTY_FILTERS, ...filters };

	return FILTER_KEYS.filter((key) => key !== 'divisionId').every((key) => !applied[key].trim());
}
