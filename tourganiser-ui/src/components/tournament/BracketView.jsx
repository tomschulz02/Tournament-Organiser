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
// That is why connectors are conditional. Nothing in the payload says which
// match feeds which — progression is by rank, not by bracket position — so the
// pairing can only be inferred, and only where the counts actually support it.
// Where they do not, the rounds still render as columns and no line is drawn
// rather than a wrong one.
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

	// Whether round i's matches pair cleanly into round i + 1's. False for the
	// last round, and false across any gap an uneven round creates.
	const feeds = flow.map((round, index) => {
		const next = flow[index + 1];
		return Boolean(next) && round.matches.length === next.matches.length * 2;
	});

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
							className={`tv-bracket-round${index > 0 && feeds[index - 1] ? ' tv-bracket-round--fed' : ''}`}>
							<h4 className="tv-bracket-round-name">{round.name}</h4>

							<div className="tv-bracket-round-body">
								{feeds[index]
									? // Pairs exist only where the counts justify them: the vertical
									  // connector hangs off the pair, so no pair means no line.
									  toPairs(round.matches).map((pair) => (
											<div key={pair[0].id} className="tv-bracket-pair">
												{pair.map((match) => (
													<Slot key={match.id} match={match} />
												))}
											</div>
									  ))
									: round.matches.map((match) => <Slot key={match.id} match={match} />)}
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

function toPairs(matches) {
	const pairs = [];

	for (let index = 0; index < matches.length; index += 2) {
		pairs.push(matches.slice(index, index + 2));
	}

	return pairs;
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

			{participants.map((participant, index) => (
				<Participant key={participant?.id ?? index} participant={participant} winner={match.winner} />
			))}
		</article>
	);
}

// A participant is a team or a placeholder such as "Rank 3", and both render.
// That is how a knockout fixture exists before the pool it draws from has
// finished — see docs/division-state.md.
function Participant({ participant, winner }) {
	const placeholder = Boolean(participant?.placeholder);
	const isWinner = !placeholder && Boolean(winner) && keyOf(winner) === keyOf(participant);

	return (
		<div
			className={`tv-bracket-participant${isWinner ? ' tv-bracket-participant--winner' : ''}${
				placeholder ? ' tv-bracket-participant--placeholder' : ''
			}`}>
			<span>{participant?.name || 'TBD'}</span>
		</div>
	);
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
