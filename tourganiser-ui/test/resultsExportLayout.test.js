import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from '../src/components/tournament/fixtureUtils';
import {
	BLOCK_HEIGHTS,
	BODY_BUDGET,
	SUBTITLE_HEIGHT,
	blockHeight,
	describeFilters,
	filtersFromQuery,
	filtersToQuery,
	finalRankingPages,
	fixtureExportPages,
	fixtureResultPages,
	groupFixtures,
	isExportKind,
	packPages,
	paginate,
	selectExportFixtures,
	usesKnockoutTree,
} from '../src/utils/resultsExportLayout';

const fixture = (id, divisionId, matchNo, round, status = 'COMPLETED', extra = {}) => ({
	id,
	division_id: divisionId,
	match_no: matchNo,
	round,
	status,
	team1: 'Alpha',
	team2: 'Bravo',
	result: status === 'COMPLETED' ? [[21, 15]] : [],
	...extra,
});

// Two divisions: Men has pools then a knockout with a 3rd-place playoff and a
// placement match; Women is a league.
const men = {
	id: 'men',
	name: 'Men',
	state: {
		rounds: [
			{ name: 'Pool Play', type: 'pool' },
			{ name: 'Semifinals', type: 'knockout' },
			{ name: 'Finals', type: 'knockout' },
		],
	},
	bracket: { rounds: [{ name: 'Semifinals' }, { name: 'Finals' }] },
	fixtures: [
		fixture('m1', 'men', 1, 'Pool Play · Pool A', 'COMPLETED', { pool: 'Pool A' }),
		fixture('m2', 'men', 2, 'Pool Play · Pool B', 'COMPLETED', { pool: 'Pool B', team1: 'Chaos', team2: 'Delta' }),
		fixture('m3', 'men', 3, 'Pool Play · Pool A', 'CANCELLED', { pool: 'Pool A', result: [[0, 0]] }),
		fixture('m4', 'men', 5, 'Semifinals'),
		fixture('m5', 'men', 6, 'Semifinals · Places 5-8'),
		fixture('m6', 'men', 7, '3rd Place Playoff'),
		fixture('m7', 'men', 8, 'Finals', 'UPCOMING'),
	],
};

const women = {
	id: 'women',
	name: 'Women',
	state: { rounds: [{ name: 'Round Robin', type: 'round_robin' }] },
	bracket: { rounds: [] },
	fixtures: [fixture('w1', 'women', 4, 'Round Robin'), fixture('w2', 'women', 9, 'Round Robin', 'LIVE')],
};

const divisions = [men, women];

const schedule = {
	days: [
		{ date: '2026-03-01', label: 'Day 1' },
		{ date: '2026-03-02', label: 'Day 2' },
	],
	courts: [
		{ id: 'c1', name: 'Centre Court' },
		{ id: 'c2', name: 'Court 2' },
	],
	entries: [
		{ day: '2026-03-01', courtId: 'c1', fixtureId: 'm1' },
		{ day: '2026-03-01', courtId: 'c2', fixtureId: 'm2' },
		{ day: '2026-03-01', courtId: 'c1', fixtureId: 'w1' },
		{ day: '2026-03-02', courtId: 'c1', fixtureId: 'm4' },
		{ day: '2026-03-02', courtId: 'c2', fixtureId: 'm5' },
		{ day: '2026-03-02', courtId: 'c1', type: 'break' },
	],
};

const ids = (fixtures) => fixtures.map((item) => item.id);
const select = (filters, withSchedule = schedule) =>
	ids(selectExportFixtures({ divisions, filters: { ...EMPTY_FILTERS, ...filters }, schedule: withSchedule }));

describe('isExportKind', () => {
	it('knows the three kinds and nothing else', () => {
		expect(['fixtures', 'final', 'pack'].every(isExportKind)).toBe(true);
		expect(isExportKind('schedule')).toBe(false);
		expect(isExportKind(undefined)).toBe(false);
	});
});

describe('filters and the query string', () => {
	it('round-trips every filter', () => {
		const filters = {
			divisionId: 'men',
			round: 'Preliminary Round',
			status: 'COMPLETED',
			team: 'Alpha & Co',
			day: '2026-03-01',
			courtId: 'c1',
		};

		expect(filtersFromQuery(filtersToQuery(filters))).toEqual(filters);
	});

	it('omits empty values and gives an empty string for no filter', () => {
		expect(filtersToQuery(EMPTY_FILTERS)).toBe('');
		expect(filtersToQuery()).toBe('');
		expect(filtersToQuery({ ...EMPTY_FILTERS, divisionId: 'men', team: '   ' })).toBe('divisionId=men');
	});

	it('ignores unknown keys both ways', () => {
		expect(filtersToQuery({ divisionId: 'men', page: '2', round: 7 })).toBe('divisionId=men');
		expect(filtersFromQuery('?divisionId=men&utm_source=x')).toEqual({ ...EMPTY_FILTERS, divisionId: 'men' });
	});

	it('reads a URLSearchParams and an empty search', () => {
		expect(filtersFromQuery(new URLSearchParams('team=alpha'))).toEqual({ ...EMPTY_FILTERS, team: 'alpha' });
		expect(filtersFromQuery()).toEqual(EMPTY_FILTERS);
	});
});

describe('selectExportFixtures', () => {
	it('lists completed fixtures only, in match-number order', () => {
		expect(select({})).toEqual(['m1', 'm2', 'w1', 'm4', 'm5', 'm6']);
	});

	it('leaves out cancelled, upcoming and live fixtures', () => {
		const selected = select({});

		expect(selected).not.toContain('m3');
		expect(selected).not.toContain('m7');
		expect(selected).not.toContain('w2');
	});

	it('gives nothing for no input', () => {
		expect(selectExportFixtures()).toEqual([]);
	});

	it('filters by division', () => {
		expect(select({ divisionId: 'women' })).toEqual(['w1']);
	});

	it('filters by stage', () => {
		expect(select({ round: 'Preliminary Round' })).toEqual(['m1', 'm2', 'w1']);
		expect(select({ round: 'Playoffs' })).toEqual(['m5', 'm6']);
		expect(select({ round: 'Semifinals' })).toEqual(['m4']);
	});

	it('filters by team text', () => {
		expect(select({ team: ' chaos ' })).toEqual(['m2']);
	});

	it('selects nothing for a status other than completed', () => {
		expect(select({ status: 'COMPLETED' })).toEqual(['m1', 'm2', 'w1', 'm4', 'm5', 'm6']);
		expect(select({ status: 'UPCOMING' })).toEqual([]);
		expect(select({ status: 'CANCELLED' })).toEqual([]);
	});

	it('applies day through the schedule entries', () => {
		expect(select({ day: '2026-03-01' })).toEqual(['m1', 'm2', 'w1']);
		expect(select({ day: '2026-03-02' })).toEqual(['m4', 'm5']);
	});

	it('applies court through the schedule entries', () => {
		expect(select({ courtId: 'c2' })).toEqual(['m2', 'm5']);
	});

	it('combines filters', () => {
		expect(select({ divisionId: 'men', day: '2026-03-01', courtId: 'c1' })).toEqual(['m1']);
		expect(select({ divisionId: 'men', round: 'Preliminary Round', team: 'alpha' })).toEqual(['m1']);
		expect(select({ divisionId: 'women', day: '2026-03-02' })).toEqual([]);
	});

	it('matches nothing by day or court without a schedule', () => {
		expect(select({ day: '2026-03-01' }, null)).toEqual([]);
		expect(select({ courtId: 'c1' }, {})).toEqual([]);
	});

	it('carries the division name and stage for the card', () => {
		const [first] = selectExportFixtures({ divisions });

		expect(first).toMatchObject({ id: 'm1', division_name: 'Men', stage: 'Preliminary Round' });
	});
});

describe('describeFilters', () => {
	it('names every filter in force and the count', () => {
		expect(
			describeFilters({
				filters: { ...EMPTY_FILTERS, divisionId: 'men', round: 'Playoffs' },
				divisions,
				count: 14,
			}),
		).toBe('Men · Playoffs · 14 results');
	});

	it('reads day and court labels from the schedule', () => {
		expect(
			describeFilters({
				filters: { ...EMPTY_FILTERS, day: '2026-03-01', courtId: 'c1', team: ' alpha ' },
				divisions,
				schedule,
				count: 1,
			}),
		).toBe('Day 1 · Centre Court · Teams matching "alpha" · 1 result');
	});

	it('falls back to the raw day and court without a schedule', () => {
		expect(describeFilters({ filters: { ...EMPTY_FILTERS, day: '2026-03-01', courtId: 'c9' }, count: 0 })).toBe(
			'2026-03-01 · c9 · 0 results',
		);
	});

	it('says so when nothing is filtered, and skips an unknown division', () => {
		expect(describeFilters({ divisions, count: 6 })).toBe('All divisions · 6 results');
		expect(describeFilters()).toBe('All divisions · 0 results');
		expect(describeFilters({ filters: { ...EMPTY_FILTERS, divisionId: 'gone' }, divisions, count: 0 })).toBe(
			'All divisions · 0 results',
		);
	});
});

describe('groupFixtures', () => {
	const grouped = groupFixtures(divisions, selectExportFixtures({ divisions }));

	it('groups by division in the order given', () => {
		expect(grouped.map((group) => group.division.id)).toEqual(['men', 'women']);
	});

	it('splits a division into round-robin and knockout rounds', () => {
		const [menGroup, womenGroup] = grouped;

		expect(menGroup.roundRobin.map((group) => group.round)).toEqual(['Pool Play · Pool A', 'Pool Play · Pool B']);
		expect(menGroup.knockout.map((group) => group.round)).toEqual([
			'Semifinals',
			'Semifinals · Places 5-8',
			'3rd Place Playoff',
		]);
		expect(womenGroup.roundRobin.map((group) => ids(group.fixtures))).toEqual([['w1']]);
		expect(womenGroup.knockout).toEqual([]);
	});

	it('keeps a round in match-number order', () => {
		const pool = { ...men, fixtures: [fixture('b', 'men', 2, 'Pool Play · Pool A'), fixture('a', 'men', 1, 'Pool Play · Pool A')] };
		const [group] = groupFixtures([pool], selectExportFixtures({ divisions: [pool] }));

		expect(ids(group.roundRobin[0].fixtures)).toEqual(['a', 'b']);
	});

	it('leaves out a division with nothing selected', () => {
		const selected = selectExportFixtures({ divisions, filters: { ...EMPTY_FILTERS, divisionId: 'women' } });

		expect(groupFixtures(divisions, selected).map((group) => group.division.id)).toEqual(['women']);
		expect(groupFixtures()).toEqual([]);
	});

	it('treats a division without a bracket as round-robin', () => {
		const league = { id: 'l', name: 'League', fixtures: [fixture('l1', 'l', 1, 'Round 1')] };
		const [group] = groupFixtures([league], selectExportFixtures({ divisions: [league] }));

		expect(group.knockout).toEqual([]);
		expect(group.roundRobin).toHaveLength(1);
	});
});

describe('paginate', () => {
	const cards = (count) => Array.from({ length: count }, (_, index) => ({ type: 'card', id: index }));
	const types = (pages) => pages.map((page) => page.map((block) => block.type));

	it('gives no pages for no blocks', () => {
		expect(paginate()).toEqual([]);
		expect(paginate([])).toEqual([]);
	});

	it('keeps everything on one page when it fits', () => {
		const blocks = [{ type: 'heading' }, ...cards(3)];

		expect(paginate(blocks)).toEqual([blocks]);
	});

	it('breaks when the budget is used up and loses nothing', () => {
		const perPage = Math.floor(BODY_BUDGET / BLOCK_HEIGHTS.card);
		const pages = paginate(cards(perPage * 2 + 1));

		expect(pages.map((page) => page.length)).toEqual([perPage, perPage, 1]);
		expect(pages.flat().map((block) => block.id)).toEqual(cards(perPage * 2 + 1).map((block) => block.id));
	});

	it('never puts more on a page than the budget', () => {
		const blocks = [{ type: 'heading' }, ...cards(9), { type: 'subheading' }, ...cards(20), { type: 'gap' }];

		paginate(blocks).forEach((page) => {
			expect(page.reduce((total, block) => total + blockHeight(block), 0)).toBeLessThanOrEqual(BODY_BUDGET);
		});
	});

	it('never leaves a heading at the foot of a page', () => {
		// Two cards fill the page; the heading fits but its card does not.
		const budget = BLOCK_HEIGHTS.card * 2 + BLOCK_HEIGHTS.heading;
		const pages = paginate([...cards(2), { type: 'heading' }, ...cards(1)], budget);

		expect(types(pages)).toEqual([
			['card', 'card'],
			['heading', 'card'],
		]);
	});

	it('carries a run of headings together', () => {
		const budget = BLOCK_HEIGHTS.card + BLOCK_HEIGHTS.heading + BLOCK_HEIGHTS.subheading + BLOCK_HEIGHTS.tableHead;
		const pages = paginate(
			[...cards(1), { type: 'heading' }, { type: 'subheading' }, { type: 'tableHead' }, { type: 'tableRow' }],
			budget,
		);

		expect(types(pages)).toEqual([['card'], ['heading', 'subheading', 'tableHead', 'tableRow']]);
	});

	it('does not emit an empty page when a page holds only headings', () => {
		const pages = paginate([{ type: 'heading' }, ...cards(1)], BLOCK_HEIGHTS.heading);

		expect(types(pages)).toEqual([['heading', 'card']]);
	});

	it('gives an oversized block a page rather than dropping it', () => {
		const pages = paginate([...cards(1), { type: 'tree', height: 5000 }, ...cards(1)], 200);

		expect(types(pages)).toEqual([['card'], ['tree'], ['card']]);
	});

	it('reads a height from the block before the table, and zero for an unknown type', () => {
		expect(blockHeight({ type: 'card', height: 10 })).toBe(10);
		expect(blockHeight({ type: 'card' })).toBe(BLOCK_HEIGHTS.card);
		expect(blockHeight({ type: 'mystery' })).toBe(0);
	});
});

describe('fixtureResultPages', () => {
	const types = (page) => page.map((block) => block.type);
	const many = (count) => ({
		id: 'big',
		name: 'Big',
		bracket: { rounds: [] },
		fixtures: Array.from({ length: count }, (_, index) => fixture(`b${index}`, 'big', index + 1, 'Round 1')),
	});
	const pagesFor = (list, budget) => fixtureResultPages(groupFixtures(list, selectExportFixtures({ divisions: list })), budget);

	it('gives no pages for nothing selected', () => {
		expect(fixtureResultPages()).toEqual([]);
		expect(fixtureResultPages([])).toEqual([]);
	});

	it('lays out a division heading, then each round and its cards, pools before knockout', () => {
		const [page] = pagesFor(divisions);

		expect(page.filter((block) => block.type !== 'card').map((block) => block.round ?? block.division.name)).toEqual([
			'Men',
			'Pool Play · Pool A',
			'Pool Play · Pool B',
			'Semifinals',
			'Semifinals · Places 5-8',
			'3rd Place Playoff',
			'Women',
			'Round Robin',
		]);
		expect(page.filter((block) => block.type === 'card').map((block) => block.fixture.id)).toEqual([
			'm1',
			'm2',
			'm4',
			'm5',
			'm6',
			'w1',
		]);
	});

	it('repeats the heading and round on a page that opens mid-round, and loses no card', () => {
		const pages = pagesFor([many(40)]);

		expect(pages.length).toBeGreaterThan(1);
		expect(types(pages[0]).slice(0, 2)).toEqual(['heading', 'subheading']);
		expect(pages[0][0].continued).toBe(false);
		expect(types(pages[1]).slice(0, 3)).toEqual(['heading', 'subheading', 'card']);
		expect(pages[1][0]).toMatchObject({ continued: true });
		expect(pages[1][1]).toMatchObject({ continued: true, round: 'Round 1' });
		expect(pages.flat().filter((block) => block.type === 'card')).toHaveLength(40);
	});

	it('repeats only the heading on a page that opens with a new round', () => {
		const two = {
			...many(2),
			fixtures: [fixture('x1', 'big', 1, 'Round 1'), fixture('x2', 'big', 2, 'Round 2')],
		};
		// Room for the first round and its card, and no more.
		const budget = BLOCK_HEIGHTS.heading * 2 + BLOCK_HEIGHTS.subheading * 2 + BLOCK_HEIGHTS.card;
		const pages = pagesFor([two], budget);

		expect(pages.map(types)).toEqual([
			['heading', 'subheading', 'card'],
			['heading', 'subheading', 'card'],
		]);
		expect(pages[1][0].continued).toBe(true);
		expect(pages[1][1].continued).toBe(false);
	});

	it('keeps every page within the page budget, repeated headings included', () => {
		pagesFor([many(120), ...divisions]).forEach((page) => {
			const used = page.reduce((total, block) => total + blockHeight(block), 0);

			expect(used).toBeLessThanOrEqual(BODY_BUDGET - SUBTITLE_HEIGHT);
			expect(page[page.length - 1].type).toBe('card');
		});
	});
});

describe('fixtureExportPages', () => {
	const groups = groupFixtures(divisions, selectExportFixtures({ divisions }));
	const cardIds = (pages) =>
		pages
			.filter((page) => page.kind === 'cards')
			.flatMap((page) => page.blocks)
			.filter((block) => block.type === 'card')
			.map((block) => block.fixture.id);

	it('is all cards without the tree, knockout fixtures included', () => {
		const pages = fixtureExportPages({ groups });

		expect(pages.every((page) => page.kind === 'cards')).toBe(true);
		expect(cardIds(pages)).toEqual(['m1', 'm2', 'm4', 'm5', 'm6', 'w1']);
		expect(fixtureExportPages()).toEqual([]);
	});

	it('draws a knockout as one tree page after the division\'s round-robin cards', () => {
		const pages = fixtureExportPages({ groups, tree: true });

		expect(pages.map((page) => (page.kind === 'tree' ? `tree:${page.division.id}` : 'cards'))).toEqual([
			'cards',
			'tree:men',
			'cards',
		]);
		expect(cardIds(pages)).toEqual(['m1', 'm2', 'w1']);
	});

	it('gives no tree page to a division whose knockout has no completed match', () => {
		const poolsOnly = { ...men, fixtures: men.fixtures.filter((item) => item.pool) };
		const pages = fixtureExportPages({
			groups: groupFixtures([poolsOnly], selectExportFixtures({ divisions: [poolsOnly] })),
			tree: true,
		});

		expect(pages.map((page) => page.kind)).toEqual(['cards']);
	});

	it('gives a knockout-only division a tree page and no empty cards page', () => {
		const knockoutOnly = { ...men, fixtures: men.fixtures.filter((item) => !item.pool) };
		const pages = fixtureExportPages({
			groups: groupFixtures([knockoutOnly], selectExportFixtures({ divisions: [knockoutOnly] })),
			tree: true,
		});

		expect(pages).toEqual([{ kind: 'tree', division: knockoutOnly }]);
	});
});

describe('finalRankingPages', () => {
	const ranked = (id, count, from = 1) => ({
		id,
		name: id,
		finalStandings: Array.from({ length: count }, (_, index) => ({
			rank: from + index,
			team_id: `${id}-${index}`,
			name: `Team ${from + index}`,
			note: '',
		})),
	});

	it('gives no pages when nothing is decided', () => {
		expect(finalRankingPages()).toEqual([]);
		expect(finalRankingPages([{ id: 'a', finalStandings: [] }, { id: 'b' }])).toEqual([]);
	});

	it('puts two divisions on a page and leaves out one with no standings', () => {
		const pages = finalRankingPages([ranked('a', 4), { id: 'empty', finalStandings: [] }, ranked('b', 4), ranked('c', 4)]);

		expect(pages.map((page) => page.map((column) => column.division.id))).toEqual([['a', 'b'], ['c']]);
		expect(pages[0][0].continued).toBe(false);
	});

	it('draws places 1 to 3 as blocks and the rest as rows, in the order sent', () => {
		const [[column]] = finalRankingPages([ranked('a', 5)]);

		expect(column.rows.map((item) => item.type)).toEqual([
			'rankingFirst',
			'rankingBlock',
			'rankingBlock',
			'rankingRow',
			'rankingRow',
		]);
		expect(column.rows.map((item) => item.row.rank)).toEqual([1, 2, 3, 4, 5]);
	});

	it('shows only the lower places as rows while the top is undecided', () => {
		const [[column]] = finalRankingPages([ranked('a', 4, 5)]);

		expect(column.rows.every((item) => item.type === 'rankingRow')).toBe(true);
	});

	it('continues a long list in the same column on the next page', () => {
		const pages = finalRankingPages([ranked('a', 3), ranked('long', 60)]);

		expect(pages.length).toBeGreaterThan(1);
		expect(pages[0].map((column) => column.division.id)).toEqual(['a', 'long']);
		expect(pages[1][0]).toBeNull();
		expect(pages[1][1]).toMatchObject({ continued: true });
		expect(pages.flatMap((page) => page[1].rows).map((item) => item.row.rank)).toEqual(
			Array.from({ length: 60 }, (_, index) => index + 1),
		);
	});

	it('keeps every column within the budget, heading included', () => {
		finalRankingPages([ranked('long', 80)]).forEach(([column]) => {
			const used = BLOCK_HEIGHTS.heading + column.rows.reduce((total, item) => total + blockHeight(item), 0);

			expect(used).toBeLessThanOrEqual(BODY_BUDGET);
		});
	});
});

describe('packPages', () => {
	const row = (name) => ({ id: name, name, played: 1 });
	const withTables = {
		...men,
		finalStandings: [{ rank: 1, team_id: 'a', name: 'Alpha', note: 'Champion' }],
		standings: [
			{
				round: 'Pool Play',
				roundIndex: 0,
				groups: [
					{ name: 'Pool A', groupIndex: 0, standings: [row('Alpha'), row('Bravo')] },
					{ name: 'Pool B', groupIndex: 1, standings: [row('Chaos'), row('Delta')] },
				],
			},
		],
	};
	const league = {
		...women,
		standings: [{ round: 'Round Robin', roundIndex: 0, groups: [{ name: '', groupIndex: 0, standings: [row('Alpha')] }] }],
	};
	const unplayed = {
		id: 'idle',
		name: 'Idle',
		bracket: { rounds: [] },
		fixtures: [fixture('i1', 'idle', 20, 'Round Robin', 'UPCOMING')],
		standings: [{ round: 'Round Robin', roundIndex: 0, groups: [{ name: '', groupIndex: 0, standings: [row('Zulu')] }] }],
		finalStandings: [],
	};
	const outline = (pages) => pages.map((page) => (page.division ? `${page.kind}:${page.division.id}` : page.kind));

	it('is empty when nothing has been completed', () => {
		expect(packPages()).toEqual([]);
		expect(packPages({ divisions: [unplayed] })).toEqual([]);
	});

	it('runs cover, final ranking, then each division: standings, results, knockout', () => {
		expect(outline(packPages({ divisions: [withTables, league] }))).toEqual([
			'cover',
			'ranking',
			'standings:men',
			'results:men',
			'knockout:men',
			'standings:women',
			'results:women',
		]);
	});

	it('leaves out a division with no completed fixture, and the ranking when none is decided', () => {
		expect(outline(packPages({ divisions: [unplayed, league] }))).toEqual(['cover', 'standings:women', 'results:women']);
	});

	it('leaves out a section with nothing in it', () => {
		const knockoutOnly = { ...men, standings: [], fixtures: men.fixtures.filter((item) => !item.pool) };

		expect(outline(packPages({ divisions: [knockoutOnly] }))).toEqual(['cover', 'knockout:men']);
	});

	it('builds a table per group, named in its head, rows in the order sent', () => {
		const standings = packPages({ divisions: [withTables] }).find((page) => page.kind === 'standings');

		expect(standings.blocks.map((block) => block.type)).toEqual([
			'heading',
			'tableHead',
			'tableRow',
			'tableRow',
			'gap',
			'tableHead',
			'tableRow',
			'tableRow',
		]);
		expect(standings.blocks.filter((block) => block.type === 'tableHead').map((block) => block.label)).toEqual([
			'Pool A',
			'Pool B',
		]);
		expect(standings.blocks.filter((block) => block.type === 'tableRow').map((block) => `${block.position} ${block.row.name}`)).toEqual([
			'1 Alpha',
			'2 Bravo',
			'1 Chaos',
			'2 Delta',
		]);
	});

	it('names an unnamed group after its round', () => {
		const standings = packPages({ divisions: [league] }).find((page) => page.kind === 'standings');

		expect(standings.blocks.find((block) => block.type === 'tableHead').label).toBe('Round Robin');
	});

	it('repeats the table head when a table is cut by a page break', () => {
		const big = {
			...league,
			standings: [
				{
					round: 'Round Robin',
					roundIndex: 0,
					groups: [{ name: 'All', groupIndex: 0, standings: Array.from({ length: 60 }, (_, index) => row(`T${index}`)) }],
				},
			],
		};
		const pages = packPages({ divisions: [big] }).filter((page) => page.kind === 'standings');

		expect(pages.length).toBeGreaterThan(1);
		expect(pages[1].blocks.slice(0, 3).map((block) => block.type)).toEqual(['heading', 'tableHead', 'tableRow']);
		expect(pages[1].blocks[1]).toMatchObject({ continued: true, label: 'All' });
		expect(pages.flatMap((page) => page.blocks).filter((block) => block.type === 'tableRow')).toHaveLength(60);
		pages.forEach((page) => {
			expect(page.blocks.reduce((total, block) => total + blockHeight(block), 0)).toBeLessThanOrEqual(BODY_BUDGET);
		});
	});

	it('keeps knockout fixtures off the results cards and gives the knockout one tree page', () => {
		const pages = packPages({ divisions: [withTables] });
		const cardIds = pages
			.filter((page) => page.kind === 'results')
			.flatMap((page) => page.blocks)
			.filter((block) => block.type === 'card')
			.map((block) => block.fixture.id);

		expect(cardIds).toEqual(['m1', 'm2']);
		expect(pages.filter((page) => page.kind === 'knockout')).toEqual([{ kind: 'knockout', division: withTables }]);
	});
});

describe('usesKnockoutTree', () => {
	it('always draws the tree in the pack', () => {
		expect(usesKnockoutTree('pack')).toBe(true);
		expect(usesKnockoutTree('pack', { ...EMPTY_FILTERS, round: 'Playoffs' })).toBe(true);
	});

	it('draws it in the fixture export with no filter or only a division', () => {
		expect(usesKnockoutTree('fixtures')).toBe(true);
		expect(usesKnockoutTree('fixtures', { divisionId: 'men' })).toBe(true);
		expect(usesKnockoutTree('fixtures', { ...EMPTY_FILTERS, divisionId: 'men', team: '  ' })).toBe(true);
	});

	it('falls back to cards with any other filter', () => {
		expect(usesKnockoutTree('fixtures', { ...EMPTY_FILTERS, divisionId: 'men', round: 'Semifinals' })).toBe(false);
		expect(usesKnockoutTree('fixtures', { ...EMPTY_FILTERS, status: 'COMPLETED' })).toBe(false);
		expect(usesKnockoutTree('fixtures', { ...EMPTY_FILTERS, team: 'alpha' })).toBe(false);
		expect(usesKnockoutTree('fixtures', { ...EMPTY_FILTERS, day: '2026-03-01' })).toBe(false);
		expect(usesKnockoutTree('fixtures', { ...EMPTY_FILTERS, courtId: 'c1' })).toBe(false);
	});

	it('never draws it in the final results export', () => {
		expect(usesKnockoutTree('final')).toBe(false);
	});
});
