import SectionState from './SectionState';
import { formatResult } from './fixtureUtils';

const PLACEMENT_ROUND = '3rd Place Playoff';

// The bracket match carries the fixture_status enum but not the server's display
// form of it, which only the fixture payload has. Four values, no other
// vocabulary — see docs/tournament-rules.md.
const STATUS_LABELS = {
	UPCOMING: 'Upcoming',
	LIVE: 'Live',
	COMPLETED: 'Completed',
	CANCELLED: 'Cancelled',
};

// The knockout bracket, drawn from division.bracket.rounds.
//
// The structure comes entirely from the data. Nothing here assumes a bracket
// size, a number of rounds, or that a round has twice the matches of the one
// after it — createClassicState produces uneven first rounds, where most teams
// get a bye and only the surplus play. Those byes are one-team groups, and
// buildDivisionBracket drops groups shorter than two, so an uneven round arrives
// carrying only its real matches: a "Round of 9" is a single match feeding a
// four-match Quarterfinals.
//
// Each match carries a `sources` array parallel to its participants, one entry
// per slot, saying which match in the previous round feeds that slot and whether
// it takes the winner or the loser. The pairing is therefore declared, not
// inferred from match counts, so an uneven round draws its connectors too. A slot
// fed by nothing — a bye, or the first knockout round, whose slots hold pool ranks
// rather than match outcomes — has a null source and keeps its rank placeholder.
export default function BracketView({ rounds = [] }) {
	const { flow, placements } = splitPlacements(rounds);

	if (flow.length === 0 && placements.length === 0) {
		return (
			<SectionState
				variant="empty"
				title="No knockout matches yet"
				message="The bracket appears once the division's knockout fixtures have been generated."
			/>
		);
	}

	// One entry per round: how its matches group into the pairs the connectors
	// hang off, taken from what the next round declares feeds it.
	//
	// Built right to left, because a column's order is decided by the order of the
	// column it feeds — a match has to sit on the row of the match it feeds into,
	// and that row is only known once the next column has been laid out.
	const layouts = [];
	for (let index = flow.length - 1; index >= 0; index -= 1) {
		layouts[index] = groupByFeed(flow[index], layouts[index + 1]);
	}

	return (
		<div className="tv-bracket-wrap">
			{/* The bracket owns its own horizontal axis, like the standings tables.
			    It is never scaled down to fit — a whole bracket shrunk to phone
			    width is unreadable in a way that scrolling is not. */}
			<div className="tv-bracket-scroll">
				<div className="tv-bracket">
					{flow.map((round, index) => (
						<div
							key={round.roundIndex}
							className={`tv-bracket-round${
								index > 0 && layouts[index - 1].some((item) => item.paired) ? ' tv-bracket-round--fed' : ''
							}`}>
							<h4 className="tv-bracket-round-name">{round.name}</h4>

							<div className="tv-bracket-round-body">
								{/* The vertical connector hangs off the pair, so a match that
								    feeds nothing renders as a bare slot and draws no line. A
								    pair of one — a bye round's single match feeding a
								    quarter-final — needs no vertical either, only its stub. */}
								{layouts[index].map((item) =>
									item.paired ? (
										<div
											key={item.key}
											className={`tv-bracket-pair${item.matches.length < 2 ? ' tv-bracket-pair--single' : ''}`}>
											{item.matches.map((match) => (
												<Slot key={match.id} match={match} />
											))}
										</div>
									) : (
										<Slot key={item.key} match={item.matches[0]} />
									)
								)}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Distinct from the bracket, not another node in it. The playoff decides
			    third and fourth; it feeds nothing and nothing feeds out of it, so
			    drawing it in the flow would imply a progression that does not exist. */}
			{placements.map((match) => (
				<div key={match.id} className="tv-bracket-placement">
					<h4 className="tv-bracket-round-name">{PLACEMENT_ROUND}</h4>
					<MatchCard match={match} />
				</div>
			))}
		</div>
	);
}

// The 3rd place playoff is unshifted onto the front of the Finals round by
// createClassicState, so it arrives inside that round's matches rather than in
// one of its own.
//
// isPlacementMatch is derived from the fixture, so it is only set once fixtures
// exist. round is checked too: it costs nothing and covers the same case from
// the other side.
function isPlacement(match) {
	return Boolean(match.isPlacementMatch) || match.round === PLACEMENT_ROUND;
}

function splitPlacements(rounds) {
	const flow = [];
	const placements = [];

	rounds.forEach((round) => {
		const matches = [];

		(round.matches ?? []).forEach((match) => {
			if (isPlacement(match)) {
				placements.push(match);
			} else {
				matches.push(match);
			}
		});

		// A round left with nothing is not a column. This drops a hypothetical
		// round of nothing but byes rather than rendering an empty gap.
		if (matches.length > 0) {
			flow.push({ ...round, matches });
		}
	});

	return { flow, placements };
}

// Groups a round's matches by the next-round match they feed, using the sources
// the server declares.
//
// The groups come out in the order the next column is *rendered* in, not in this
// round's own match order. That is the whole point: a Round of 12 numbers its
// matches 25, 26, 27, 28 while the quarter-finals they feed render as 29, 32, 30,
// 31, so laying the round out by its own numbering puts every match on the wrong
// row and the connectors point at matches that are not there.
//
// Each match renders exactly once, and one that feeds nothing — or the whole
// round, when there is no round after it — renders alone and draws no line.
function groupByFeed(round, nextLayout) {
	const matches = round.matches ?? [];

	if (!nextLayout) {
		return matches.map((match) => ({ key: match.id, matches: [match], paired: false }));
	}

	const byId = new Map(matches.map((match) => [match.id, match]));
	const items = [];
	const placed = new Set();

	nextLayout.forEach((item) => {
		item.matches.forEach((nextMatch) => {
			const feeders = [];

			(nextMatch.sources ?? []).forEach((source) => {
				const feeder = source ? byId.get(source.matchId) : null;
				if (feeder && !placed.has(feeder.id) && !feeders.includes(feeder)) feeders.push(feeder);
			});

			if (feeders.length === 0) return;

			feeders.forEach((feeder) => placed.add(feeder.id));
			items.push({ key: feeders[0].id, matches: feeders, paired: true });
		});
	});

	// Whatever feeds nothing keeps its own order, after the matches that do.
	matches.forEach((match) => {
		if (!placed.has(match.id)) {
			items.push({ key: match.id, matches: [match], paired: false });
		}
	});

	return items;
}

// The slot is the flex cell that owns a match's share of the column height, and
// the card sits centred inside it. The split matters: the connectors are
// positioned against the slot, so they land on the vertical centre of a match's
// share of the column rather than on the card, and stay aligned whatever height
// the card happens to be.
function Slot({ match }) {
	return (
		<div className="tv-bracket-slot">
			<MatchCard match={match} />
		</div>
	);
}

function MatchCard({ match }) {
	const outcome = getOutcome(match);
	const participants = match.participants ?? [];

	return (
		<article className={`tv-bracket-match${match.status === 'CANCELLED' ? ' tv-bracket-match--cancelled' : ''}`}>
			{(match.match_no != null || outcome) && (
				<div className="tv-bracket-match-head">
					{match.match_no != null && <span className="tv-match-no">#{match.match_no}</span>}
					{outcome && <span className="tv-bracket-outcome">{outcome}</span>}
				</div>
			)}

			{/* The source is passed from here rather than from Slot, because the
			    placement match renders through MatchCard without one — and it is
			    the match whose labels this improves most. */}
			{participants.map((participant, index) => (
				<Participant
					key={participant?.id ?? index}
					participant={participant}
					winner={match.winner}
					source={match.sources?.[index] ?? null}
				/>
			))}
		</article>
	);
}

// A participant is a team or a placeholder such as "Rank 3", and both render.
// That is how a knockout fixture exists before the pool it draws from has
// finished — see docs/division-state.md.
function Participant({ participant, winner, source }) {
	const placeholder = Boolean(participant?.placeholder);
	const isWinner = !placeholder && Boolean(winner) && keyOf(winner) === keyOf(participant);
	// An unbound slot says where its team comes from where the server named a
	// feeding match, and keeps the rank placeholder where it did not.
	const label = (placeholder && sourceLabel(source)) || participant?.name || 'TBD';

	return (
		<div
			className={`tv-bracket-participant${isWinner ? ' tv-bracket-participant--winner' : ''}${
				placeholder ? ' tv-bracket-participant--placeholder' : ''
			}`}>
			<span>{label}</span>
		</div>
	);
}

// Null until the feeding match has a fixture, which is when it gets its number.
function sourceLabel(source) {
	if (!source || source.matchNo == null) return null;

	return `${source.outcome === 'LOSER' ? 'Loser' : 'Winner'} of #${source.matchNo}`;
}

function keyOf(participant) {
	return participant?.id ?? participant?.name ?? null;
}

// The result where there is one, and the status only where it says something a
// reader cannot already see. An upcoming match with no score is self-evidently
// upcoming; a cancelled one is not.
function getOutcome(match) {
	const score = formatResult(match.result);
	if (score) return score;

	if (match.status && match.status !== 'UPCOMING') {
		return STATUS_LABELS[match.status] ?? match.status;
	}

	return null;
}
