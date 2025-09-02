import { useEffect, useState } from 'react';
import Icon from './Icons';
import Tooltip from './Tooltip';
import { TeamNameChangePopup } from '../pages/Tournaments';
import LoadingScreen from './LoadingScreen';
import { updateTeams } from '../requests';
import { useMessage } from '../MessageContext';
import NextRoundModal from './NextRoundModal';

export function OverviewTab({ details, loggedIn, creator }) {
	let actions = [];
	if (creator) {
		actions.push(<div key={1}>Start</div>, <div key={2}>Delete</div>);
	} else {
		if (loggedIn) {
			actions.push(<div key={1}>Save</div>);
		}
	}

	return (
		<>
			<div className="overview-tab-content">
				<div className="overview-tab-details">
					<div className="overview-tab-details-title">{details.name}</div>
					<div className="overview-tab-details-description">{details.description}</div>
					<div className="overview-tab-details-tags">
						<div className="overview-tab-details-tag">
							<Icon name={'progress'} className="overview-tab-details-tag-icon" />
							{details.status}
						</div>
						<div className="overview-tab-details-tag">
							<Icon name={'calendar'} className="overview-tab-details-tag-icon" />
							{details.startDate}
						</div>
						<div className="overview-tab-details-tag">
							<Icon name={'location'} className="overview-tab-details-tag-icon" />
							{details.location}
						</div>
						<div className="overview-tab-details-tag">
							<Icon name={'structure'} className="overview-tab-details-tag-icon" />
							{details.format}
						</div>
					</div>
					<div className="overview-tab-details-actions">{actions}</div>
				</div>
				{/* <div className="overview-tab-links"></div> */}
				<div className="overview-tab-fixtures">
					<h2>Upcoming Fixtures</h2>
					<div className="overview-tab-fixtures-scroll">
						{details.upcomingFixtures.map((fixture, index) => {
							return <FixtureCard key={index} fixture={fixture} />;
						})}
					</div>
				</div>
				<div className="overview-tab-fixtures">
					<h2>Recent Results</h2>
					<div className="overview-tab-fixtures-scroll">
						{details.results.map((fixture, index) => {
							return <FixtureCard key={index} fixture={fixture} />;
						})}
					</div>
				</div>
			</div>
		</>
	);
}

export function ScheduleTab({ fixtures, creator, standings }) {
	const [filter, setFilter] = useState('all');
	const allFixtures = [...fixtures.remainingFixtures, ...fixtures.results];
	const [showNextRoundModal, setShowNextRoundModal] = useState(false);

	const filteredFixtures = allFixtures.filter((fixture) => {
		switch (filter) {
			case 'upcoming':
				return fixture.status === 'WAITING';
			case 'live':
				return fixture.status === 'ONGOING';
			case 'done':
				return fixture.status === 'COMPLETED' || fixture.status === 'CANCELLED';
			default:
				return true;
		}
	});

	return (
		<>
			{showNextRoundModal && (
				<NextRoundModal
					fixtures={fixtures}
					standings={standings}
					onCancel={() => setShowNextRoundModal(false)}
					onConfirm={() => setShowNextRoundModal(false)}
				/>
			)}
			<div className="schedule-tab">
				<div className="schedule-tab-header">
					<h2>Schedule</h2>
					<div className="schedule-tab-content-filters">
						<div
							className={`schedule-tab-content-filter ${filter === 'all' ? 'active' : ''}`}
							onClick={() => {
								setFilter('all');
							}}>
							All
						</div>
						<div
							className={`schedule-tab-content-filter ${filter === 'upcoming' ? 'active' : ''}`}
							onClick={() => {
								setFilter('upcoming');
							}}>
							Upcoming
						</div>
						<div
							className={`schedule-tab-content-filter ${filter === 'live' ? 'active' : ''}`}
							onClick={() => {
								setFilter('live');
							}}>
							Live
						</div>
						<div
							className={`schedule-tab-content-filter ${filter === 'done' ? 'active' : ''}`}
							onClick={() => {
								setFilter('done');
							}}>
							Results
						</div>
					</div>
				</div>
				<div className="schedule-tab-content">
					{filteredFixtures.map((fixture, index) => {
						return <FixtureCard key={index} fixture={fixture} />;
					})}
				</div>
				<div className="schedule-tab-progress">
					<div className="schedule-tab-progress-content">
						<h3>{fixtures.rounds[fixtures.currentRound].round}</h3>
						<div className="schedule-tab-progress-bar">
							<div
								className="schedule-tab-progress-bar fill"
								style={{
									width: `${
										(fixtures.rounds[fixtures.currentRound].completed /
											fixtures.rounds[fixtures.currentRound].matches) *
										100
									}%`,
								}}></div>
						</div>
						{creator &&
							fixtures.rounds[fixtures.currentRound].completed === fixtures.rounds[fixtures.currentRound].matches &&
							(fixtures.currentRound === fixtures.rounds.length ? (
								<div className="schedule-tab-progress-button">End Tournament</div>
							) : (
								<div className="schedule-tab-progress-button" onClick={() => setShowNextRoundModal(true)}>
									Next Round
								</div>
							))}
					</div>
				</div>
			</div>
		</>
	);
}

export function StandingsTab({ standings, format, currentRound }) {
	const [expandedRounds, setExpandedRounds] = useState(new Set([currentRound])); // First round expanded by default

	const toggleRound = (roundIndex) => {
		setExpandedRounds((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(roundIndex)) {
				newSet.delete(roundIndex);
			} else {
				newSet.add(roundIndex);
			}
			return newSet;
		});
	};

	const standingsMessage =
		'Standings are based on completed matches. The rankings are decided by number of wins, sets ratio, then points ratio (in that order)';

	const renderStandingsTable = (data, poolIndex = null) =>
		data.length > 0 ? (
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
						<tr key={`${poolIndex}-${index}`}>
							<td>{index + 1}</td>
							<td className="sticky-column">{team.name}</td>
							<td>{team.played}</td>
							<td>{team.won}</td>
							<td>{team.lost}</td>
							<td>{team.setsWon}</td>
							<td>{team.setsLost}</td>
							<td>{team.setsRatio !== null ? team.setsRatio.toFixed(3) : 'MAX'}</td>
							<td>{team.pointsFor}</td>
							<td>{team.pointsAgainst}</td>
							<td>{team.pointsRatio !== null ? team.pointsRatio.toFixed(3) : 'MAX'}</td>
						</tr>
					))}
				</tbody>
			</table>
		) : (
			<div className="standings-placeholder">
				<div className="placeholder-icon">📊</div>
				<p>Standings will be available once matches have been played</p>
				{format && <p className="format-info">Format: {format}</p>}
			</div>
		);

	const renderEmptyRound = (round) => (
		<div className="empty-round-placeholder">
			<div className="placeholder-content">
				<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24">
					<path d="M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" />
				</svg>
				<p>Standings for {round.round} will be available once matches begin</p>
			</div>
		</div>
	);

	return (
		<div className="tournament-standings">
			<h2>
				Standings
				{/* <Tooltip message={standingsMessage} /> */}
			</h2>
			{standings.map((round, roundIndex) => (
				<div key={roundIndex} className="round-standings">
					<div
						className={`round-header ${expandedRounds.has(roundIndex) ? 'expanded' : ''}`}
						onClick={() => toggleRound(roundIndex)}>
						<h4>{round.round}</h4>
						<svg
							className="expand-icon"
							xmlns="http://www.w3.org/2000/svg"
							height="24"
							viewBox="0 -960 960 960"
							width="24">
							<path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
						</svg>
					</div>
					<div className={`round-content ${expandedRounds.has(roundIndex) ? 'expanded' : ''}`}>
						{round.groups && round.groups.length > 0 ? (
							<div className="pools-standings">
								{round.groups.map((pool, index) => (
									<div key={index} className="pool-standings">
										{renderStandingsTable(pool, index)}
									</div>
								))}
							</div>
						) : (
							renderEmptyRound(round)
						)}
					</div>
				</div>
			))}
		</div>
	);
}

export function TeamsTab({ teams, status, setPageUnsavedChanges, tournamentId, creator, onUpdate }) {
	const editTeams = status === 'Not Started' && creator;
	const [openTeamNameChangePopup, setOpenTeamNameChangePopup] = useState(false);
	const [currentTeam, setCurrentTeam] = useState(null);
	const [selectedTeamIndex, setSelectedTeamIndex] = useState(null);
	const { showMessage } = useMessage();
	const [unsavedChanges, setUnsavedChanges] = useState(false);
	const [originalTeams, setOriginalTeams] = useState(teams);
	const [stagedTeams, setStagedTeams] = useState(JSON.parse(JSON.stringify(teams)));
	const [loading, setLoading] = useState(false);

	if (!Array.isArray(teams) || teams.length === 0) {
		return (
			<div className="tournament-teams">
				<h3>Teams</h3>
				<div className="team-card">
					<p>No teams available</p>
				</div>
			</div>
		);
	}

	const handleTeamNameChange = async (event, teamIndex) => {
		setCurrentTeam({ element: event.currentTarget });
		setSelectedTeamIndex(teamIndex);
		setOpenTeamNameChangePopup(true);
	};

	const changeTeamName = (e, rank, newName) => {
		if (stagedTeams.includes(newName)) {
			return false;
		}
		const updated = [...stagedTeams];
		updated[selectedTeamIndex] = newName;
		setStagedTeams(updated);
		currentTeam.element.parentElement.classList.add('team-name-changed');
		setUnsavedChanges(true);
		setPageUnsavedChanges(true);
		setCurrentTeam(null);
		return true;
	};

	const handleDiscardChanges = () => {
		setStagedTeams(JSON.parse(JSON.stringify(originalTeams)));
		document.querySelectorAll('.team-name-changed').forEach((element) => {
			element.classList.remove('team-name-changed');
		});
		setUnsavedChanges(false);
		setPageUnsavedChanges(false);
		showMessage('Changes discarded', 'success');
	};

	const handleSaveChanges = async () => {
		setLoading(true);
		if (JSON.stringify(originalTeams) === JSON.stringify(stagedTeams)) {
			setLoading(false);
			showMessage('No changes to save', 'info');
			return;
		}
		if (stagedTeams.includes('')) {
			setLoading(false);
			showMessage('Team names cannot be empty', 'error');
			return;
		}
		const response = await updateTeams(tournamentId, stagedTeams);
		if (!response.success) {
			setLoading(false);
			showMessage('Error saving changes. Please try again later', 'error');
			return;
		} else {
			setLoading(false);
			setOriginalTeams(JSON.parse(JSON.stringify(stagedTeams)));
			document.querySelectorAll('.team-name-changed').forEach((element) => {
				element.classList.remove('team-name-changed');
			});
			setUnsavedChanges(false);
			setPageUnsavedChanges(false);
			showMessage('Changes saved successfully', 'success');
			onUpdate();
		}
	};

	return (
		<>
			{openTeamNameChangePopup && (
				<TeamNameChangePopup
					onClose={() => setOpenTeamNameChangePopup(false)}
					onSubmit={changeTeamName}
					currName={currentTeam.element.parentElement.innerText ? currentTeam.element.parentElement.innerText : ''}
					rank={selectedTeamIndex + 1}
				/>
			)}
			{loading && <LoadingScreen />}
			<div className="tournament-teams">
				<div className="tournament-teams-header">
					<h3>Teams</h3>
					{unsavedChanges && (
						<div className="button-group">
							<button onClick={handleSaveChanges}>Save Changes</button>
							<button onClick={handleDiscardChanges}>Discard Changes</button>
						</div>
					)}
				</div>
				<div className="teams-grid">
					{stagedTeams.map((team, index) => (
						<div key={index} className="team-card">
							{team}
							{true && (
								<Icon
									className="teams-tab-edit-team-icon"
									name={'edit'}
									onClick={(e) => handleTeamNameChange(e, index)}
								/>
							)}
						</div>
					))}
				</div>
			</div>
		</>
	);
}

function FixtureCard({ fixture, actions = [] }) {
	let cols = '1fr';
	let sets = { 1: [], 2: [] };
	if (fixture.result) {
		for (let set of fixture.result) {
			cols += ' 25px';
			sets[1].push(<div key={1}>{set[0]}</div>);
			sets[2].push(<div key={2}>{set[1]}</div>);
		}
	} else {
		cols += ' 25px';
		sets[1].push(<div key={1}>0</div>);
		sets[2].push(<div key={2}>0</div>);
	}

	const statusMap = {
		ONGOING: 'LIVE',
		WAITING: 'UPCOMING',
		COMPLETED: 'COMPLETED',
		CANCELLED: 'CANCELLED',
	};

	return (
		<div className="fixture-card" key={fixture.id}>
			<div className="fixture-card-header">
				<div className={`fixture-card-header-status ${fixture.status.toLowerCase()}`}>{statusMap[fixture.status]}</div>
				<div className="fixture-card-header-round">{fixture.round}</div>
				<div className="fixture-card-header-match">Match #{fixture.match_no}</div>
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
			{actions.length > 0 && <div className="fixture-card-actions">&#8942;</div>}
		</div>
	);
}
