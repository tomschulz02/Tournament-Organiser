// A division's ranking rules and placement options, as the client presents them.
//
// The rules themselves are applied on the server only (api/src/utils/standings.js);
// nothing here ranks a table. This is the labels, the presets and the arithmetic
// the Settings and Standings tabs show: what a row's match points come to, and
// which knockout places a placement depth has a match for.
// See docs/tournament-rules.md, "Ranking order" and "Placement matches".

export const MAX_MATCH_POINTS = 10;

// The four ways a match ends, in the order the settings list them.
export const POINT_RESULTS = [
	{ key: 'straightWin', label: 'Win in straight sets', hint: '2–0 in best of 3, 3–0 or 3–1 in best of 5' },
	{ key: 'decidingWin', label: 'Win in the deciding set', hint: '2–1 or 3–2' },
	{ key: 'decidingLoss', label: 'Loss in the deciding set', hint: '1–2 or 2–3' },
	{ key: 'straightLoss', label: 'Loss in straight sets', hint: '0–2, 0–3 or 1–3' },
];

// Presets only fill the numbers in; nothing records which one was pressed.
export const POINT_PRESETS = [
	{ label: 'FIVB 3·2·1·0', points: { straightWin: 3, decidingWin: 2, decidingLoss: 1, straightLoss: 0 } },
	{ label: 'Simple 2·1', points: { straightWin: 2, decidingWin: 2, decidingLoss: 1, straightLoss: 0 } },
];

export const TIEBREAKERS = [
	{ key: 'SET_RATIO', label: 'Set ratio', hint: 'Sets won ÷ sets lost' },
	{ key: 'POINT_RATIO', label: 'Point ratio', hint: 'Points won ÷ points lost' },
	{ key: 'HEAD_TO_HEAD', label: 'Head-to-head', hint: 'The result between the level teams. Skipped across pools' },
	{ key: 'SET_DIFFERENCE', label: 'Set difference', hint: 'Sets won − sets lost' },
	{ key: 'POINT_DIFFERENCE', label: 'Point difference', hint: 'Points won − points lost' },
	{ key: 'POINTS_SCORED', label: 'Points scored', hint: 'Total rally points won' },
	{ key: 'SETS_WON', label: 'Sets won', hint: 'Total sets won' },
];

const DEFAULT_RULES = { method: 'wins', wins: 'matches', tiebreakers: ['SET_RATIO', 'POINT_RATIO', 'HEAD_TO_HEAD'] };

// The rules in force for a division, as the view payload sends them. A payload
// from before the server sent any reads as the default.
export function rulesOf(division) {
	return division?.ranking_rules ?? DEFAULT_RULES;
}

export function tiebreakerLabel(key) {
	return TIEBREAKERS.find((entry) => entry.key === key)?.label ?? key;
}

export function samePoints(a, b) {
	return POINT_RESULTS.every(({ key }) => a?.[key] === b?.[key]);
}

// Switching method keeps the deciders and gives the new method a starting value:
// FIVB points, or match wins.
export function withMethod(rules, method) {
	if (method === rules.method) return rules;

	return method === 'points'
		? { method, points: { ...POINT_PRESETS[0].points }, tiebreakers: rules.tiebreakers }
		: { method, wins: 'matches', tiebreakers: rules.tiebreakers };
}

// Moves the decider at `from` to `to`. Out of range leaves the list as it is.
export function moveTiebreaker(tiebreakers, from, to) {
	if (from === to || from < 0 || to < 0 || from >= tiebreakers.length || to >= tiebreakers.length) {
		return tiebreakers;
	}

	const next = tiebreakers.slice();
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);

	return next;
}

// A match went to a deciding set when the loser took a set and the margin is one.
function decidingSet(won, lost) {
	return Math.min(won, lost) > 0 && Math.abs(won - lost) === 1;
}

// A standings row's match points under points rules, from its scoreline counter.
// The same sum the server ranks on, repeated only so the table can show it.
export function matchPoints(row, points) {
	return Object.entries(row?.setOutcomes ?? {}).reduce((total, [scoreline, count]) => {
		const [won, lost] = scoreline.split('-').map(Number);
		const deciding = decidingSet(won, lost);
		const value = won > lost ? (deciding ? points.decidingWin : points.straightWin) : deciding ? points.decidingLoss : points.straightLoss;

		return total + value * count;
	}, 0);
}

// One line saying how a table is ranked, for the standings footnote.
export function describeRules(rules) {
	const method =
		rules.method === 'points'
			? `match points (${POINT_RESULTS.map(({ key }) => rules.points[key]).join('·')})`
			: rules.wins === 'sets'
				? 'sets won'
				: 'matches won';

	return `Ranked by ${[method, ...rules.tiebreakers.map((key) => tiebreakerLabel(key).toLowerCase()), 'seeding'].join(', then ')}.`;
}

export function ordinal(value) {
	const lastTwo = value % 100;
	if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;

	return `${value}${{ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th'}`;
}

// The knockout stage as the placement settings need it, read from state the way
// the server's readPlacementDepth reads it. Null for a division without one.
//
// `teams` is how many enter the knockout. `tiers` are the groups of teams
// knocked out together before the semifinals, each with the best place it can
// finish in: the quarterfinals' four losers are { first: 5, size: 4 }.
// `hasSemifinals` is false for a two-team knockout, which has no 3rd-place
// match to remove and nothing below it to play for.
export function knockoutOf(division) {
	if (division?.type !== 'Classic') return null;

	const rounds = Array.isArray(division.state?.rounds) ? division.state.rounds : [];
	const first = rounds.findIndex((round) => round.type === 'knockout');
	if (first < 1) return null;

	const knockout = rounds.slice(first);
	// A round's own groups come first; placement groups follow them.
	const mainGroups = (round) => (round.groups ?? []).slice(0, (round.groups ?? []).length - (round.placement ?? []).length);
	const entering = mainGroups(knockout[0]).flat().filter(Number.isInteger);
	const hasSemifinals = knockout.length > 1;

	// Every round before the semifinals sends its losers out as a tier.
	const tiers = knockout.slice(0, -2).map((round) => {
		const groups = mainGroups(round);
		return { first: groups.length + 1, size: groups.filter((group) => group.length > 1).length };
	});

	return {
		teams: hasSemifinals ? entering.length : 2,
		hasSemifinals,
		tiers,
		started: (Number(division.state?.currentRound) || 0) >= first,
	};
}

// How many matches a bracket of `size` teams needs to settle its places from
// `first` down to `depth`. Each round splits it: winners play on for the upper
// places, losers for the lower ones, and a part wholly below the depth is not
// played. An uneven bracket byes its strongest teams, as the main draw does.
function bracketMatches(size, first, depth) {
	if (size < 2 || first > depth) return 0;
	if (size === 2) return 1;

	const upper = 2 ** Math.floor(Math.log2(size));
	const through = upper === size ? size / 2 : upper;

	return size - through + bracketMatches(through, first, depth) + bracketMatches(size - through, first + through, depth);
}

// Placement matches a depth adds beyond the final and the 3rd-place match.
export function placementMatchCount(knockout, depth) {
	if (!depth || depth < 5) return 0;

	return knockout.tiers.reduce((total, tier) => total + bracketMatches(tier.size, tier.first, depth), 0);
}

// The depths on offer: 1 (final only), null (the default: final and 3rd place),
// then each odd place from 5th to the knockout's size.
export function placementOptions(knockout) {
	const options = [
		{ depth: 1, label: '1st' },
		{ depth: null, label: '3rd' },
	];
	for (let depth = 5; depth <= knockout.teams; depth += 2) options.push({ depth, label: ordinal(depth) });

	return options;
}

// The place ladder for a depth: one row per pair of places, saying whether a
// match decides it. `divisionTeams` adds the row for teams that never reach the
// knockout.
export function placementLadder(knockout, depth, divisionTeams = 0) {
	const playedTo = depth === 1 ? 1 : depth ?? 3;
	const rows = [];

	for (let place = 1; place <= knockout.teams; place += 2) {
		const played = place <= playedTo;
		const added = place >= 5 ? placementMatchCount(knockout, place) - placementMatchCount(knockout, place - 2) : 0;

		rows.push({
			place: ordinal(place),
			state: played ? 'played' : 'ranked',
			label: !played
				? 'Not played, ranked by the tiebreak deciders'
				: place === 1
					? 'Final'
					: place === 3
						? '3rd-place match'
						: added > 0
							? `${ordinal(place)}-place match`
							: `Decided by the ${ordinal(place - 2)}-place matches`,
			badge: !played ? null : place === 1 ? 'Always' : place === 3 ? 'Default' : added > 0 ? `+${added} ${added === 1 ? 'match' : 'matches'}` : null,
			isDefault: played && place === 3,
		});
	}

	if (divisionTeams > knockout.teams) {
		rows.push({ place: `${ordinal(knockout.teams + 1)}+`, state: 'pool', label: 'Ranked by pool results', badge: null, isDefault: false });
	}

	return rows;
}
