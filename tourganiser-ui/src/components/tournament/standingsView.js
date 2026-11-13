import { canProgress, setsWon } from './fixtureUtils';

// Pure helpers for the Standings tab. Nothing here ranks a team: the order of
// every standings row is the server's (rankGroup). These only read state to say
// where a pool's qualification line sits, what each stage's status is and how a
// team's recent results ran.

export const STAGE_GROUPS = 'groups';
export const STAGE_KNOCKOUT = 'knockout';
export const STAGE_RANKINGS = 'rankings';

// The client mirror of qualifierCount in progression.service.js: the next
// round's groups hold indices into this round's results, so the number of teams
// it needs is one past the largest index it references.
export function qualifierCount(nextRound) {
	const groups = Array.isArray(nextRound?.groups) ? nextRound.groups : [];
	let max = -1;

	groups.forEach((group) =>
		(Array.isArray(group) ? group : []).forEach((index) => {
			if (typeof index === 'number' && index > max) max = index;
		}),
	);

	return max + 1;
}

// Where the qualification line sits under one round-robin round's pools.
//
// Qualifiers are ranked across the division (seedAcrossGroups), not per pool,
// so the client can only promise the places every pool is guaranteed:
// floor(qualifiers / pools). `extra` is how many of the next place go through
// as best runners-up, which the page says in words rather than drawing.
//
// `qualified` is the exact set when it is known: the round's confirmed results
// once it has progressed, or the server's proposal (passed in) while it is
// ready to. Null otherwise.
//
// Null when the next round is not a knockout: a league leg carries every team
// forward and a final round has nowhere to go, so there is no line to draw.
export function poolCut(state, roundIndex, groupCount, proposalIds = null) {
	const rounds = Array.isArray(state?.rounds) ? state.rounds : [];
	const round = rounds[roundIndex];
	const next = rounds[roundIndex + 1];
	if (!round || next?.type !== 'knockout' || groupCount < 1) return null;

	const qualifiers = qualifierCount(next);
	if (qualifiers < 1) return null;

	const guaranteed = Math.floor(qualifiers / groupCount);
	const results = Array.isArray(round.results) ? round.results.filter(Boolean) : [];
	const qualified =
		results.length > 0 ? new Set(results) : proposalIds && proposalIds.length > 0 ? new Set(proposalIds.filter(Boolean)) : null;

	return {
		nextRoundName: next.name ?? null,
		qualifiers,
		guaranteed,
		extra: qualifiers - guaranteed * groupCount,
		qualified,
	};
}

// A team's last results in the division, oldest first so the newest reads
// last: 'W' or 'L' per completed fixture, in match-number order. A completed
// fixture without a decided score (no sets, or level) is left out rather than
// guessed at.
export function recentForm(fixtures, teamId, limit = 5) {
	const form = [];

	[...(fixtures ?? [])]
		.filter((fixture) => fixture.status === 'COMPLETED' && (fixture.team_1_id === teamId || fixture.team_2_id === teamId))
		.sort((a, b) => (a.match_no ?? 0) - (b.match_no ?? 0))
		.forEach((fixture) => {
			const sets = setsWon(fixture.result);
			if (!sets || sets[0] === sets[1]) return;

			const teamOneWon = sets[0] > sets[1];
			form.push(teamOneWon === (fixture.team_1_id === teamId) ? 'W' : 'L');
		});

	return form.slice(-limit);
}

// The stages a division is built from, each with a status line, in the order
// they are played. A stage the division's structure has but whose content does
// not exist yet (a knockout before its draw, rankings before the end) is listed
// unavailable rather than left out, so the reader sees what is still to come.
//
// `content` says what the page can actually render: { groups, knockout,
// rankings } as booleans.
export function divisionStages(division, content) {
	const rounds = Array.isArray(division?.state?.rounds) ? division.state.rounds : [];
	const current = division?.state?.currentRound ?? 0;
	const finished = Boolean(content.rankings);
	const ready = canProgress(division ?? {});

	const robinIndexes = rounds.map((round, index) => (round.type === 'roundRobin' ? index : -1)).filter((i) => i >= 0);
	const firstKnockout = rounds.findIndex((round) => round.type === 'knockout');
	const stages = [];

	if (robinIndexes.length > 0 || content.groups) {
		const last = robinIndexes.length > 0 ? robinIndexes[robinIndexes.length - 1] : current;
		const done = current > last || finished || (current === last && ready && rounds[last + 1]?.type === 'knockout');
		const started = Boolean(content.groupsPlayed);

		stages.push({
			id: STAGE_GROUPS,
			label: firstKnockout >= 0 ? 'Pools' : 'League',
			status: done ? 'done' : started ? 'live' : 'idle',
			available: Boolean(content.groups),
		});
	}

	if (firstKnockout >= 0 || content.knockout) {
		let status = 'idle';
		if (finished) status = 'done';
		else if (firstKnockout >= 0 && current >= firstKnockout) status = 'live';
		else if (ready && current + 1 === firstKnockout) status = 'ready';

		stages.push({ id: STAGE_KNOCKOUT, label: 'Knockout', status, available: Boolean(content.knockout) });
	}

	if (stages.length > 0 || finished) {
		stages.push({
			id: STAGE_RANKINGS,
			label: 'Final rankings',
			status: finished ? 'done' : 'idle',
			available: finished,
		});
	}

	return stages;
}

// The stage to open on: the one being played. Rankings once the division has
// finished, the knockout while it runs, otherwise the first available.
export function defaultStage(stages) {
	const available = stages.filter((stage) => stage.available);
	const rankings = available.find((stage) => stage.id === STAGE_RANKINGS);
	if (rankings) return rankings.id;

	const live = available.find((stage) => stage.status === 'live');
	return (live ?? available[0])?.id ?? null;
}
