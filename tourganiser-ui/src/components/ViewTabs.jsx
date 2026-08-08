import { useMemo, useState } from 'react';
import Icon from './Icons';
import LoadingScreen from './LoadingScreen';
import ScheduleMakerModal from './ScheduleMakerModal';
import { updateDivisionSchedule } from '../requests';
import { useMessage } from '../MessageContext';
import { calculateScheduledStats, formatDateLabel, getScheduleForDivision, normaliseDivisionFixtures } from '../utils/scheduleUtils';

export function TournamentOverviewTab({ tournament, dashboard, divisions, onSelectDivision }) {
	const divisionSummaries = Array.isArray(dashboard?.divisions) ? dashboard.divisions : [];
	const upcomingFixtures = Array.isArray(dashboard?.upcomingFixtures) ? dashboard.upcomingFixtures : [];
	const recentResults = Array.isArray(dashboard?.recentResults) ? dashboard.recentResults : [];

	return (
		<div className="tournament-dashboard">
			<section className="dashboard-hero">
				<div className="dashboard-hero-copy">
					<div className="dashboard-eyebrow">Tournament Overview</div>
					<h2>{tournament.name}</h2>
					<p>{tournament.description || 'No tournament description has been added yet.'}</p>
				</div>
				<div className="dashboard-hero-meta">
					<DetailPill icon="calendar" label={buildDateRangeLabel(tournament)} />
					<DetailPill icon="location" label={tournament.location || 'Location to be confirmed'} />
					<DetailPill icon="structure" label={tournament.type || formatDivisionCount(divisions.length)} />
					<DetailPill icon="progress" label={tournament.status || 'Not Started'} />
				</div>
			</section>

			<section className="dashboard-stats-grid">
				<StatCard label="Divisions" value={dashboard?.divisionCount || divisions.length || 0} />
				<StatCard label="Teams" value={dashboard?.totalTeams || 0} />
				<StatCard label="Fixtures" value={dashboard?.totalFixtures || 0} />
				<StatCard label="Upcoming" value={dashboard?.upcomingFixtureCount || 0} />
			</section>

			<section className="dashboard-section">
				<div className="dashboard-section-heading">
					<h3>Divisions</h3>
					<p>Select a division to open its overview, fixtures, standings, and teams.</p>
				</div>
				<div className="dashboard-division-grid">
					{divisionSummaries.length > 0 ? (
						divisionSummaries.map((division) => (
							<button
								key={division.id}
								type="button"
								className="dashboard-division-card"
								onClick={() => onSelectDivision(division.id)}>
								<div className="dashboard-division-card-top">
									<div>
										<h4>{division.name}</h4>
										<p>{division.type || 'Division'}</p>
									</div>
									<Icon name="arrowRight" className="dashboard-division-card-arrow" />
								</div>
								<div className="dashboard-division-card-stats">
									<span>{division.teamCount || 0} teams</span>
									<span>{division.fixtureCount || 0} fixtures</span>
									<span>{division.currentRoundName || 'No round active'}</span>
								</div>
								<div className="dashboard-division-card-footer">
									<span>{division.completedFixtureCount || 0} completed</span>
									<span>{division.upcomingFixtureCount || 0} upcoming</span>
									<span>{division.hasSchedule ? 'Schedule ready' : 'No schedule yet'}</span>
								</div>
							</button>
						))
					) : (
						<InlineEmptyState message="No divisions are available for this tournament yet." />
					)}
				</div>
			</section>

			<div className="dashboard-columns">
				<FixtureSection
					title="Upcoming Fixtures"
					description="Next matches across the tournament."
					fixtures={upcomingFixtures}
					emptyMessage="There are no upcoming fixtures yet."
				/>
				<FixtureSection
					title="Recent Results"
					description="Latest completed or cancelled fixtures."
					fixtures={recentResults}
					emptyMessage="There are no results to show yet."
				/>
			</div>
		</div>
	);
}

export function DivisionOverviewTab({ division, tournament }) {
	const overview = division?.overview || {};
	const fixtureCount = overview.totalFixtures || division?.fixtures?.length || 0;

	return (
		<div className="tournament-dashboard">
			<section className="dashboard-hero dashboard-hero--division">
				<div className="dashboard-hero-copy">
					<div className="dashboard-eyebrow">Division Overview</div>
					<h2>{division.name}</h2>
					<p>
						{division.type || 'Division'} division inside {tournament.name}. Use the tabs above to move between the
						schedule, standings, and team list.
					</p>
				</div>
				<div className="dashboard-hero-meta">
					<DetailPill icon="structure" label={division.type || 'Division'} />
					<DetailPill icon="calendar" label={buildDateRangeLabel(tournament)} />
					<DetailPill icon="progress" label={overview.currentRound || 'No round active'} />
				</div>
			</section>

			<section className="dashboard-stats-grid">
				<StatCard label="Teams" value={overview.teamCount || division?.teams?.length || 0} />
				<StatCard label="Fixtures" value={fixtureCount} />
				<StatCard label="Completed" value={overview.completedFixtures || 0} />
				<StatCard label="Upcoming" value={overview.upcomingFixturesCount || 0} />
			</section>

			<div className="dashboard-columns">
				<FixtureSection
					title="Upcoming Fixtures"
					description="Quick look at the next matches in this division."
					fixtures={overview.upcomingFixtures || []}
					emptyMessage="There are currently no upcoming fixtures in this division."
				/>
				<FixtureSection
					title="Recent Results"
					description="Most recent finished matches for this division."
					fixtures={overview.recentResults || []}
					emptyMessage="There are currently no results in this division."
				/>
			</div>

			<section className="dashboard-section">
				<div className="dashboard-section-heading">
					<h3>Division Snapshot</h3>
					<p>Quick context before diving into the more detailed tabs.</p>
				</div>
				<div className="dashboard-detail-grid">
					<InfoCard
						title="Current Round"
						value={overview.currentRound || 'No round active'}
						description={`${overview.completedFixtures || 0} of ${fixtureCount} fixtures completed`}
					/>
					<InfoCard
						title="Schedule"
						value={overview.hasSchedule ? 'Available' : 'Not created'}
						description={
							overview.hasSchedule
								? 'A saved division schedule is available in the Fixtures & Schedule tab.'
								: 'A schedule can be added later for this division.'
						}
					/>
					<InfoCard
						title="Teams"
						value={overview.teamCount || division?.teams?.length || 0}
						description="Participating teams currently registered in this division."
					/>
				</div>
			</section>
		</div>
	);
}

export function ScheduleTab({ division, creator, tournamentName, tournamentDetails }) {
	const [filter, setFilter] = useState('all');
	const [showScheduleModal, setShowScheduleModal] = useState(false);
	const [loading, setLoading] = useState(false);
	const [scheduleOverride, setScheduleOverride] = useState(null);
	const { showMessage } = useMessage();

	const fixtures = useMemo(() => normaliseDivisionFixtures(division?.fixtures || []), [division]);
	const divisionRecord = useMemo(() => {
		if (!scheduleOverride) {
			return division;
		}

		return {
			...division,
			schedule: scheduleOverride,
			state: {
				...(division?.state || {}),
				schedule: scheduleOverride,
			},
		};
	}, [division, scheduleOverride]);

	const divisionSchedule = getScheduleForDivision(divisionRecord, tournamentDetails);
	const divisionStats = calculateScheduledStats(divisionSchedule, fixtures);
	const filteredFixtures = fixtures.filter((fixture) => {
		switch (filter) {
			case 'upcoming':
				return fixture.status === 'UPCOMING';
			case 'live':
				return fixture.status === 'LIVE';
			case 'done':
				return fixture.status === 'COMPLETED' || fixture.status === 'CANCELLED';
			default:
				return true;
		}
	});
	const roundProgress = getRoundProgress(divisionRecord);

	const handleSaveDivision = async (schedulePayload) => {
		setLoading(true);
		try {
			const response = await updateDivisionSchedule(division.id, schedulePayload);

			setScheduleOverride(schedulePayload);
			showMessage('Division schedule updated successfully.', 'success');
			return response;
		} catch (error) {
			showMessage(error.message, 'error');
			// ScheduleMakerModal reads this to decide whether to stay open.
			return { success: false, message: error.message };
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			{loading && <LoadingScreen />}
			{showScheduleModal && divisionRecord && (
				<ScheduleMakerModal
					key={division.id}
					isOpen={showScheduleModal}
					division={divisionRecord}
					tournamentName={tournamentName}
					tournamentDetails={tournamentDetails}
					canEdit={creator}
					onClose={() => setShowScheduleModal(false)}
					onSave={handleSaveDivision}
				/>
			)}
			<div className="schedule-tab">
				<div className="schedule-tab-header">
					<div>
						<h2>Fixtures &amp; Schedule</h2>
						<p className="schedule-tab-subtitle">
							All fixtures for the {division.name} division, plus access to the saved schedule.
						</p>
					</div>
					<div className="schedule-tab-content-filters">
						{['all', 'upcoming', 'live', 'done'].map((option) => (
							<div
								key={option}
								className={`schedule-tab-content-filter ${filter === option ? 'active' : ''}`}
								onClick={() => setFilter(option)}>
								{option === 'done' ? 'Results' : capitalize(option)}
							</div>
						))}
					</div>
				</div>

				<div className="division-schedule-summary">
					<div className="division-schedule-summary-copy">
						<h3>Division Schedule</h3>
						<p>
							{divisionStats.scheduledFixtures}/{divisionStats.totalFixtures} fixtures scheduled across{' '}
							{divisionStats.days} day(s) and {divisionStats.courts} court(s).
						</p>
					</div>
					<div className="division-schedule-summary-meta">
						<span>{divisionStats.unscheduledFixtures} unscheduled</span>
						<button type="button" onClick={() => setShowScheduleModal(true)}>
							{creator ? 'Open Schedule Maker' : 'View Schedule'}
						</button>
					</div>
				</div>

				<div className="schedule-tab-content">
					{filteredFixtures.length > 0 ? (
						filteredFixtures.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} />)
					) : (
						<InlineEmptyState
							message={`No ${filter !== 'all' ? filter : ''} fixtures are available for this division.`.trim()}
						/>
					)}
				</div>

				{roundProgress && (
					<div className="schedule-tab-progress">
						<div className="schedule-tab-progress-content">
							<h3>{roundProgress.roundName}</h3>
							<p className="schedule-tab-progress-copy">
								{roundProgress.completed} of {roundProgress.total} fixtures completed in the active round.
							</p>
							<div className="schedule-tab-progress-bar">
								<div
									className="schedule-tab-progress-bar fill"
									style={{ width: `${roundProgress.percent}%` }}></div>
							</div>
						</div>
					</div>
				)}
			</div>
		</>
	);
}

export function StandingsTab({ standings = [], bracket = {}, finalStandings = [], currentRound = 0 }) {
	const [expandedRounds, setExpandedRounds] = useState(new Set([currentRound]));
	const bracketRounds = Array.isArray(bracket?.rounds) ? bracket.rounds : [];

	const toggleRound = (roundIndex) => {
		setExpandedRounds((prev) => {
			const next = new Set(prev);
			if (next.has(roundIndex)) {
				next.delete(roundIndex);
			} else {
				next.add(roundIndex);
			}
			return next;
		});
	};

	return (
		<div className="tournament-standings">
			<h2>Standings</h2>

			{finalStandings.length > 0 && (
				<section className="standings-summary-block">
					<div className="dashboard-section-heading">
						<h3>Final Standings</h3>
						<p>End-of-division placing generated from the available completed results.</p>
					</div>
					<div className="pool-standings">
						<table className="standings-table">
							<thead>
								<tr>
									<th>Rank</th>
									<th className="sticky-column">Team</th>
									<th>Note</th>
								</tr>
							</thead>
							<tbody>
								{finalStandings.map((team) => (
									<tr key={`${team.rank}-${team.team_id || team.name}`}>
										<td>{team.rank}</td>
										<td className="sticky-column">{team.name}</td>
										<td>{team.note || '-'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}

			{standings.length > 0 ? (
				standings.map((round, roundIndex) => (
					<div key={`${round.round}-${roundIndex}`} className="round-standings">
						<div
							className={`round-header ${expandedRounds.has(roundIndex) ? 'expanded' : ''}`}
							onClick={() => toggleRound(roundIndex)}>
							<h4>{round.round}</h4>
							<svg className="expand-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24">
								<path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
							</svg>
						</div>
						<div className={`round-content ${expandedRounds.has(roundIndex) ? 'expanded' : ''}`}>
							{round.groups?.length > 0 ? (
								<div className="pools-standings">
									{round.groups.map((group) => (
										<div key={`${round.round}-${group.groupIndex}`} className="pool-standings">
											<h5 className="standings-group-title">{group.name}</h5>
											{renderStandingsTable(group.standings || [], group.name)}
										</div>
									))}
								</div>
							) : (
								<InlineEmptyState message={`Standings for ${round.round} will appear once matches are completed.`} />
							)}
						</div>
					</div>
				))
			) : (
				<InlineEmptyState message="Round-robin standings are not available for this division yet." />
			)}

			<section className="dashboard-section">
				<div className="dashboard-section-heading">
					<h3>Knockout Bracket</h3>
					<p>Graph-friendly round structure built from the stored division rounds.</p>
				</div>
				{bracketRounds.length > 0 ? (
					<div className="bracket-rounds-grid">
						{bracketRounds.map((round) => (
							<div key={`${round.name}-${round.roundIndex}`} className="bracket-round-card">
								<h4>{round.name}</h4>
								<div className="bracket-match-list">
									{round.matches.map((match) => (
										<div key={match.id} className="bracket-match-card">
											<div className="bracket-match-meta">
												<span>{match.round}</span>
												<span>{match.match_no ? `Match #${match.match_no}` : 'TBD'}</span>
											</div>
											<div className="bracket-team-row">
												<strong>{match.participants?.[0]?.name || 'TBD'}</strong>
											</div>
											<div className="bracket-team-row">
												<strong>{match.participants?.[1]?.name || 'TBD'}</strong>
											</div>
											<div className="bracket-match-footer">
												<span>{match.status || 'UPCOMING'}</span>
												<span>{match.winner?.name ? `Winner: ${match.winner.name}` : 'Winner TBD'}</span>
											</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				) : (
					<InlineEmptyState message="This division does not currently have knockout bracket data." />
				)}
			</section>
		</div>
	);
}

export function TeamsTab({ teams = [], divisionName }) {
	if (!Array.isArray(teams) || teams.length === 0) {
		return (
			<div className="tournament-teams">
				<div className="tournament-teams-header">
					<h3>Teams</h3>
				</div>
				<InlineEmptyState message={`No teams are currently available for the ${divisionName || 'selected'} division.`} />
			</div>
		);
	}

	return (
		<div className="tournament-teams">
			<div className="tournament-teams-header">
				<h3>Teams</h3>
			</div>
			<div className="teams-grid">
				{teams.map((team, index) => (
					<div key={team.id || `${team.name}-${index}`} className="team-card">
						<div>
							<strong>{team.name}</strong>
							<div className="team-card-subtitle">{team.id || 'Pending team id'}</div>
						</div>
						<span className="team-card-rank">#{index + 1}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function FixtureCard({ fixture }) {
	const hasResult = Array.isArray(fixture.result) && fixture.result.length > 0;
	let cols = '1fr';
	const sets = { 1: [], 2: [] };

	if (hasResult) {
		let index = 0;
		for (const set of fixture.result) {
			cols += ' 25px';
			sets[1].push(<div key={index++}>{set[0]}</div>);
			sets[2].push(<div key={index++}>{set[1]}</div>);
		}
	} else {
		cols += ' 25px';
		sets[1].push(<div key={`${fixture.id}-a`}>0</div>);
		sets[2].push(<div key={`${fixture.id}-b`}>0</div>);
	}

	return (
		<div className="fixture-card" key={fixture.id}>
			<div className="fixture-card-header">
				<div className={`fixture-card-header-status ${String(fixture.status || '').toLowerCase()}`}>
					{fixture.statusLabel ?? fixture.status}
				</div>
				<div className="fixture-card-header-round">{fixture.round}</div>
				<div className="fixture-card-header-match">Match #{fixture.match_no || fixture.matchNo}</div>
				{fixture.division_name && <div className="fixture-card-header-division">{fixture.division_name}</div>}
			</div>
			<div className="fixture-card-content">
				<div className="fixture-card-content-team" style={{ gridTemplateColumns: cols }}>
					<div>{fixture.team1}</div>
					{sets[1]}
				</div>
				<div className="fixture-card-content-team" style={{ gridTemplateColumns: cols }}>
					<div>{fixture.team2}</div>
					{sets[2]}
				</div>
			</div>
		</div>
	);
}

function StatCard({ label, value }) {
	return (
		<div className="dashboard-stat-card">
			<small>{label}</small>
			<strong>{value}</strong>
		</div>
	);
}

function InfoCard({ title, value, description }) {
	return (
		<div className="dashboard-info-card">
			<small>{title}</small>
			<strong>{value}</strong>
			<p>{description}</p>
		</div>
	);
}

function DetailPill({ icon, label }) {
	return (
		<div className="dashboard-detail-pill">
			<Icon name={icon} className="dashboard-detail-pill-icon" />
			<span>{label}</span>
		</div>
	);
}

function FixtureSection({ title, description, fixtures, emptyMessage }) {
	return (
		<section className="dashboard-section">
			<div className="dashboard-section-heading">
				<h3>{title}</h3>
				<p>{description}</p>
			</div>
			<div className="dashboard-fixture-stack">
				{fixtures.length > 0 ? fixtures.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} />) : <InlineEmptyState message={emptyMessage} />}
			</div>
		</section>
	);
}

function InlineEmptyState({ message }) {
	return (
		<div className="dashboard-inline-empty">
			<p>{message}</p>
		</div>
	);
}

function renderStandingsTable(data, poolKey = null) {
	return data.length > 0 ? (
		<table className="standings-table">
			<thead>
				<tr>
					<th>Position</th>
					<th className="sticky-column">Team</th>
					<th>Played</th>
					<th>Won</th>
					<th>Lost</th>
					<th>Sets Won</th>
					<th>Sets Lost</th>
					<th>Set Ratio</th>
					<th>Points For</th>
					<th>Points Against</th>
					<th>Points Ratio</th>
				</tr>
			</thead>
			<tbody>
				{data.map((team, index) => (
					<tr key={`${poolKey}-${team.id || team.name}-${index}`}>
						<td>{index + 1}</td>
						<td className="sticky-column">{team.name}</td>
						<td>{team.played}</td>
						<td>{team.won}</td>
						<td>{team.lost}</td>
						<td>{team.setsWon}</td>
						<td>{team.setsLost}</td>
						<td>{team.setsRatio !== null ? Number(team.setsRatio).toFixed(3) : 'MAX'}</td>
						<td>{team.pointsFor}</td>
						<td>{team.pointsAgainst}</td>
						<td>{team.pointsRatio !== null ? Number(team.pointsRatio).toFixed(3) : 'MAX'}</td>
					</tr>
				))}
			</tbody>
		</table>
	) : (
		<InlineEmptyState message="Standings will be available once matches have been played." />
	);
}

function buildDateRangeLabel(tournament) {
	const start = tournament?.start_date_label || formatDateLabel(tournament?.startDate || tournament?.start_date);
	const end = tournament?.end_date_label || formatDateLabel(tournament?.endDate || tournament?.end_date);

	if (start && end && start !== end) {
		return `${start} - ${end}`;
	}

	return start || end || 'Date to be confirmed';
}

function formatDivisionCount(count) {
	return `${count} division${count === 1 ? '' : 's'}`;
}

function getRoundProgress(division) {
	const rounds = Array.isArray(division?.state?.rounds) ? division.state.rounds : [];
	const currentRound = rounds[division?.state?.currentRound || 0];

	if (!currentRound) {
		return null;
	}

	const completed = currentRound.completedGames ?? currentRound.completed ?? 0;
	const total = currentRound.totalGames ?? currentRound.matches ?? 0;

	return {
		roundName: currentRound.name || 'Current Round',
		completed,
		total,
		percent: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
	};
}

function capitalize(value) {
	if (!value) return '';
	return value.charAt(0).toUpperCase() + value.slice(1);
}
