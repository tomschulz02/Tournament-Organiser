// What a division's configuration will actually produce: which pool each team is
// drawn into, and the knockout bracket that follows.
//
// A faithful mirror of `populateGroups` and `createClassicState` in
// api/src/services/divisions.service.js, and of `buildDivisionBracket` in
// api/src/utils/tournamentViewFormatter.js. The index arithmetic is copied
// rather than approximated, because the creation review is a claim about what
// will be created rather than an illustration of it — a pool the organiser is
// shown as holding four named teams really does hold those four.
//
// The duplication is deliberate and is recorded in docs/decisions.md, "The
// Creation Review Computes Pools And Rounds In The Client", which also records
// what it gives up. It is pinned by shared/division-structure.json: the API
// suite asserts the server produces those values and the UI suite asserts these
// functions do, so neither side can move alone without its own tests going red
// and naming the input that broke.
//
// No component lives in this file, for the same reason divisionFormats.js has
// none: the lint config forbids a module exporting both a component and a plain
// function.

// The serpentine, expressed as positions in the list rather than its contents.
//
// Group 1 takes the first entry, then counts back from the end of the second
// row, so the sizes are not simply "the remainder into the earlier pools".
// A group count below one produces nothing, exactly as populateGroups does.
function serpentinePositions(count, groupCount) {
	const perGroup = Math.ceil(count / groupCount);
	const groups = [];

	for (let groupNo = 1; groupNo <= groupCount; groupNo++) {
		const positions = [];

		for (let index = 0; index < perGroup; index++) {
			const position = index % 2 === 0 ? index * groupCount + groupNo - 1 : (index + 1) * groupCount - groupNo;
			// The generator skips an index past the end of the list; here that is
			// simply a place the group does not get filled.
			if (position < count) positions.push(position);
		}

		groups.push(positions);
	}

	return groups;
}

// The same walk, resolved against a list. populateGroups is handed the rank
// indices for a knockout round, and for a preliminary round it is handed a
// slice of them — so the positions have to be read back out of the list rather
// than used as the values.
function serpentineOf(list, groupCount) {
	return serpentinePositions(list.length, groupCount).map((positions) =>
		positions.map((position) => list[position]),
	);
}

// Which teams land in which pool, as indices into the division's team list in
// its seeded order. That order is `state.teams`, so reordering the list is what
// changes the answer here.
//
// Sizes fall out of membership rather than being counted separately.
//
// `draw` is the division's pool draw — docs/tournament-rules.md, "Pool Draw" —
// and mirrors drawPools in api/src/utils/poolDraw.js. Every draw has the
// snake's pool sizes:
//
//   SNAKE    the serpentine itself, and the default.
//   STRAIGHT consecutive seeds, one pool at a time.
//   POTS     only what can be known here. Pot 1 goes one per pool in seed
//            order; every later pot is drawn at random by the server from a
//            seed number the client never has, so those positions are left out
//            and each pool comes back holding its top seed alone. Use
//            poolSizes for how many it will hold.
export function poolMembership(teamCount, poolCount, draw = 'SNAKE') {
	// The configuration screen can hold a zero or a blank while it is being
	// typed into, and the review still has to draw something.
	const snake = serpentinePositions(teamCount, Math.max(1, Math.floor(poolCount) || 1));

	if (draw === 'STRAIGHT') {
		let next = 0;

		return snake.map((members) => {
			const pool = members.map((_, index) => next + index);
			next += members.length;

			return pool;
		});
	}

	if (draw === 'POTS') {
		return snake.map((_, pool) => (pool < teamCount ? [pool] : []));
	}

	return snake;
}

// The pool each seed position lands in: an array as long as the team list,
// holding a pool index, or null where the answer is a random draw this side
// cannot make ("drawn on save").
//
// Only a pots draw has nulls, and fewer than it might. The server's random
// choices come from a stored seed number and are made pot by pot, so they belong
// to the seed *position*, not the team: reordering teams re-applies them. That
// means a division that already exists has told us where each position goes.
// `savedPoolByPosition` is that — the pool index its saved order has at each
// position — and it still holds for every pot that is full both before and
// after the change. A pot that is, or was, short is drawn among fewer pools, so
// its positions are unknown again. With nothing saved, only pot 1 is known.
export function poolByPosition(teamCount, poolCount, draw = 'SNAKE', savedPoolByPosition = []) {
	const pools = Math.max(1, Math.floor(poolCount) || 1);
	const result = Array.from({ length: teamCount }, () => null);

	poolMembership(teamCount, pools, draw).forEach((members, pool) =>
		members.forEach((position) => {
			result[position] = pool;
		}),
	);

	if (draw === 'POTS') {
		const settled = Math.min(teamCount, savedPoolByPosition.length);

		for (let position = pools; position < teamCount; position++) {
			const potEnd = (Math.floor(position / pools) + 1) * pools;
			const saved = savedPoolByPosition[position];

			if (potEnd <= settled && Number.isInteger(saved)) result[position] = saved;
		}
	}

	return result;
}

// How many teams each pool holds. The same for every draw.
export function poolSizes(teamCount, poolCount) {
	return poolMembership(teamCount, poolCount).map((members) => members.length);
}

const FINALS = 'Finals';

// Conventional names below sixteen; anything larger is named by its size.
const ROUND_NAMES = { 2: FINALS, 4: 'Semifinals', 8: 'Quarterfinals' };

// createClassicState's knockout loop, in rank indices. A group holds the
// placings that meet in it — [0, 3] is the first qualifier against the fourth —
// and a one-team group is a bye rather than a match.
export function knockoutRounds(qualifiers) {
	let remaining = Math.floor(Number(qualifiers));
	if (!Number.isFinite(remaining)) return [];

	const rounds = [];

	while (remaining >= 2) {
		const ranks = Array.from({ length: remaining }, (_, index) => index);

		if (Number.isInteger(Math.log2(remaining))) {
			const name = remaining > 8 ? `Round of ${remaining}` : ROUND_NAMES[remaining];
			const groups = serpentineOf(ranks, remaining / 2);

			// The third place playoff is unshifted in front of the final, so
			// index 0 of the Finals round is the bronze match and that round
			// holds two matches rather than one.
			if (name === FINALS) groups.unshift([2, 3]);

			rounds.push({ name, groups });
			remaining /= 2;
		} else {
			// A count that is not a power of two opens with a qualifying round:
			// the surplus play, and the rest go through as one-team groups.
			const qualifying = 2 ** Math.floor(Math.log2(remaining));
			const straight = 2 * qualifying - remaining;

			const groups = serpentineOf(ranks.slice(0, straight), straight);
			serpentineOf(ranks.slice(straight, remaining), remaining - qualifying).forEach((group) =>
				groups.push(group),
			);

			rounds.push({ name: `Round of ${remaining}`, groups });
			remaining = qualifying;
		}
	}

	return rounds;
}

// Which match, if any, produces the team that lands at `index` in the previous
// round's results — a straight port of resolveMatchSource in
// api/src/utils/tournamentViewFormatter.js. See that function's own comment for
// the index arithmetic; it is not repeated here because it is not allowed to
// diverge.
function resolveMatchSource(index, previousRound) {
	if (!previousRound || !Number.isInteger(index)) return null;

	const { groups, matches } = previousRound;

	if (index >= groups.length) {
		return describeMatchSource(matches[index - groups.length], 'LOSER');
	}

	const group = groups[index];
	if (!Array.isArray(group) || group.length < 2) return null;

	// The matches array skips one-team groups, so the match for group `index`
	// sits at the number of groups of two or more that precede it.
	let matchIndex = 0;
	for (let position = 0; position < index; position += 1) {
		const earlier = groups[position];
		if (Array.isArray(earlier) && earlier.length >= 2) matchIndex += 1;
	}

	return describeMatchSource(matches[matchIndex], 'WINNER');
}

function describeMatchSource(match, outcome) {
	if (!match) return null;

	// matchNo is always null here — preview matches have no fixture yet, which
	// is the same case the server itself falls back to before fixtures exist.
	return { matchId: match.id, matchNo: match.match_no ?? null, outcome };
}

// The rounds above in the shape BracketView reads, which is what
// buildDivisionBracket produces once a division exists.
//
// Every participant is a rank placeholder, which BracketView renders natively —
// a knockout fixture exists before the pool feeding it has finished, so a
// preview is the same case rather than a special one.
//
// Each match also carries `sources`, mirroring buildDivisionBracket exactly:
// without it, BracketView's own feed-ordering (groupByFeed) has nothing to
// place matches by and every round falls back to its own construction order,
// which is wrong whenever match numbering and rendering order diverge (any
// non-power-of-two qualifier count).
export function previewBracket(qualifiers) {
	// The knockout round immediately before this one, if there is one — same
	// role as buildDivisionBracket's own previousRound.
	let previousRound = null;

	return knockoutRounds(qualifiers).map((round, index) => {
		const matches = round.groups
			.map((group, groupIndex) => ({ group, groupIndex }))
			// A bye generates no fixture, and buildDivisionBracket drops the
			// group for the same reason. The index is kept from before the drop
			// so it still names the group it came from.
			.filter((entry) => entry.group.length >= 2)
			.map(({ group, groupIndex }) => ({
				id: `${round.name}-${groupIndex}`,
				match_no: null,
				round: round.name,
				status: 'UPCOMING',
				participants: [rankPlaceholder(group[0]), rankPlaceholder(group[1])],
				sources: [resolveMatchSource(group[0], previousRound), resolveMatchSource(group[1], previousRound)],
				result: [],
				winner: null,
				// generateKnockoutFixtures names group 0 of the Finals round the
				// third place playoff, and BracketView pulls it out of the flow
				// by this flag. Unflagged, it would draw as a second final.
				isPlacementMatch: round.name === FINALS && groupIndex === 0,
			}));

		previousRound = { groups: round.groups, matches };

		return {
			name: round.name,
			// Pool Play is round 0 of state.rounds and the knockout follows it.
			roundIndex: index + 1,
			matches,
		};
	});
}

// How many matches this configuration will produce: every pool plays a full
// round robin among its own members, then the knockout stage adds one match
// per real (non-bye) group across every round, third-place playoff included —
// it is a real, played match whenever the knockout stage has 2+ qualifiers,
// same as any other.
//
// `qualifiers` of 0 or 1 is not a bracket (knockoutRounds already returns
// nothing for it), so a Round Robin division — which has no knockout stage —
// is just its pool total, passed a poolCount of 1 and no qualifiers.
export function totalMatches(teamCount, poolCount, qualifiers) {
	const poolMatches = poolMembership(teamCount, poolCount).reduce(
		(sum, members) => sum + (members.length * (members.length - 1)) / 2,
		0,
	);

	const knockoutMatches = knockoutRounds(qualifiers).reduce(
		(sum, round) => sum + round.groups.filter((group) => group.length >= 2).length,
		0,
	);

	return poolMatches + knockoutMatches;
}

function rankPlaceholder(rank) {
	const name = `Rank ${rank + 1}`;

	return { id: null, name, placeholder: name };
}
