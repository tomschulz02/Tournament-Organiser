import { Link, useParams, useNavigate, useSearchParams, data } from 'react-router-dom';
import React, { useState, useEffect, useContext, useRef, use } from 'react';
import {
	fetchTournamentData,
	joinTournament,
	leaveTournament,
	updateScore,
	startTournament,
	deleteTournament,
	updateTeams,
	updateRounds,
	endTournament,
} from '../requests';
import '../styles/Tournaments.css';
import '../styles/TournamentView.css';
import { useMessage } from '../MessageContext';
import { useConfirm } from '../components/ConfirmDialog';
import { AuthContext } from '../AuthContext';
import { TeamNameChangePopup } from './Tournaments';
import LoadingScreen from '../components/LoadingScreen';
import ScoreUpdateModal from '../components/ScoreUpdateModal';
import Tooltip from '../components/Tooltip';
import NextRoundModal from '../components/NextRoundModal';

export default function TournamentView() {
	const { id } = useParams();
	const [tournamentData, setTournamentData] = useState(null);
	const [status, setStatus] = useState('Not Started');
	const [creator, setCreator] = useState(false);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);
	const [currentTab, setCurrentTab] = useState('info');
	const { showMessage } = useMessage();
	const { isLoggedIn } = useContext(AuthContext);
	const [collection, setCollection] = useState(false);
	const [collectionName, setCollectionName] = useState('');
	const hasFetchedDetails = useRef(false);
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		const getTournamentDetails = async () => {
			try {
				const response = await fetchTournamentData(id);
				if (!response.success) {
					setNotFound(true);
					showMessage('Tournament not found', 'error');
					navigate('/not-found', { replace: true });
					return;
				}
				setNotFound(false);
				if (!response.collection) {
					setCollection(false);
					setTournamentData(response.message);
					setCreator(response.creator);
				} else {
					setCollection(true);
					setTournamentData(response.message);
					setCollectionName(response.collection);
				}
			} catch (error) {
				setNotFound(true);
				showMessage('Error fetching tournament data', 'error');
			} finally {
				setLoading(false);
			}
		};
		if (hasFetchedDetails.current) return;
		hasFetchedDetails.current = true;
		getTournamentDetails();
	}, [id]);

	const handleBackButtonClick = () => {
		if (hasUnsavedChanges) {
			const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
			if (!confirmed) {
				return;
			}
		}

		navigate('/tournaments');
	};

	if (loading) {
		return <LoadingScreen />;
	}

	if (notFound) {
		return (
			<div style={{ textAlign: 'center', marginTop: '2rem' }}>
				<h2>⛔ Tournament Not Found</h2>
				<p>The tournament you are looking for doesn’t exist or was removed.</p>
			</div>
		);
	}

	return !collection ? (
		<TournamentManager
			tournamentData={tournamentData}
			creator={creator}
			backButton={
				<div onClick={handleBackButtonClick} className="back-to-browse">
					&lt; Back to browse
				</div>
			}
			unsavedChanges={hasUnsavedChanges}
			setUnsavedChanges={setHasUnsavedChanges}
		/>
	) : (
		<CollectionView
			collection={tournamentData}
			collectionName={collectionName}
			unsavedChanges={hasUnsavedChanges}
			setUnsavedChanges={setHasUnsavedChanges}
		/>
	);
}

function TournamentManager({ tournamentData, creator, backButton, unsavedChanges, setUnsavedChanges }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const currentTab = searchParams.get('tab') || 'info';
	const { isLoggedIn } = useContext(AuthContext);
	const [showUpdateWarning, setShowUpdateWarning] = useState(false);

	useEffect(() => {
		const handleBeforeUnload = (event) => {
			if (unsavedChanges) {
				event.preventDefault();
				event.returnValue = '';
				return '';
			}
		};
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	}, [unsavedChanges]);

	const handleTabChange = (tab) => {
		const newParams = new URLSearchParams(searchParams.toString());
		newParams.set('tab', tab);
		setSearchParams(newParams);
		// setSearchParams({ tab });
	};

	return (
		<div className="tournament-view">
			{showUpdateWarning && (
				<div className="update-warning-banner">
					<div className="warning-content">
						<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000">
							<path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
						</svg>
						<span>Some data may be outdated. Refresh the page to see the latest information.</span>
						<button className="close-warning" onClick={() => setShowUpdateWarning(false)}>
							×
						</button>
					</div>
				</div>
			)}
			{backButton}
			{<TournamentDetailsSummary details={tournamentData.details} creator={creator} loggedIn={isLoggedIn} />}
			<div className="tab-navigation">
				<button
					className={`view-tab-btn ${currentTab === 'info' ? 'active' : ''}`}
					onClick={() => handleTabChange('info')}>
					Overview
				</button>
				<button
					className={`view-tab-btn ${currentTab === 'fixtures' ? 'active' : ''}`}
					onClick={() => handleTabChange('fixtures')}>
					Fixtures
				</button>
				<button
					className={`view-tab-btn ${currentTab === 'standings' ? 'active' : ''}`}
					onClick={() => handleTabChange('standings')}>
					Standings
				</button>
				<button
					className={`view-tab-btn ${currentTab === 'teams' ? 'active' : ''}`}
					onClick={() => handleTabChange('teams')}>
					Teams
				</button>
			</div>
			{currentTab === 'info' && (
				<TournamentDetails details={tournamentData.details} creator={creator} loggedIn={isLoggedIn} />
			)}
			{currentTab === 'fixtures' && (
				<TournamentFixtures
					fixtures={tournamentData.fixtures}
					creator={creator}
					onUpdate={() => setShowUpdateWarning(true)}
					standings={tournamentData.standings}
					tournamentId={tournamentData.details.id}
					status={tournamentData.details.status}
				/>
			)}
			{currentTab === 'standings' && (
				<TournamentStandings
					standings={tournamentData.standings}
					format={tournamentData.details.format}
					currentRound={tournamentData.fixtures.currentRound}
				/>
			)}
			{currentTab === 'teams' && (
				<TournamentTeams
					teams={tournamentData.teams}
					status={tournamentData.details.status}
					setPageUnsavedChanges={setUnsavedChanges}
					tournamentId={tournamentData.details.id}
					creator={creator}
					onUpdate={() => setShowUpdateWarning(true)}
				/>
			)}
		</div>
	);
}

function TournamentDetailsSummary({ details, creator, loggedIn }) {
	const [loading, setLoading] = useState(false);
	const [following, setFollowing] = useState(creator);
	const { showMessage } = useMessage();
	const confirm = useConfirm();
	const { id } = useParams();

	const navigate = useNavigate();

	const handleDeleteTournament = async () => {
		const confirmed = await confirm('Are you sure you want to delete this tournament? This action cannot be undone.');

		if (!confirmed) return;

		setLoading(true);
		const response = await deleteTournament(details.id, id);

		if (response.error) {
			showMessage('Error deleting tournament', 'error');
			setLoading(false);
			return;
		}

		// setLoading(false);

		showMessage('Tournament deleted successfully', 'success');
		navigate('/tournaments');
	};

	const handleTournamentStart = async () => {
		// setLoading(true);
		// Logic to start the tournament
		const confirmed = await confirm('Are you sure you want to start the tournament? This action cannot be undone.');
		if (!confirmed) {
			// setLoading(false);
			return;
		}
		setLoading(true);
		const response = await startTournament(details.id);
		if (!response.success) {
			showMessage('Error starting tournament', 'error');
			setLoading(false);
			return;
		}
		details.status = 'Ongoing';
		setLoading(false);
		showMessage('Tournament started successfully', 'success');
		window.location.reload();
	};

	const handleFollow = async () => {
		if (!loggedIn) {
			showMessage('You must be logged in to follow tournaments', 'error');
			return;
		}
		setLoading(true);
		if (following) {
			// Logic to unfollow the tournament
			const confirmed = await confirm('Are you sure you want to unfollow the tournament?');
			if (!confirmed) {
				setLoading(false);
				return;
			}
			const response = await leaveTournament(details.id);
			if (response.error) {
				showMessage('Error unfollowing tournament', 'error');
				setLoading(false);
				return;
			}
			showMessage('Tournament unfollowed successfully', 'success');
			setFollowing(false);
			setLoading(false);
			return;
		}

		const response = await joinTournament(details.id);
		if (response.error) {
			showMessage('Error following tournament', 'error');
			setLoading(false);
			return;
		}
		showMessage('Tournament followed successfully', 'success');
		setFollowing(true);
		setLoading(false);
	};

	return (
		<>
			<div className="tournament-info">
				<div className="tournament-info-banner" style={{ '--banner-image': `url(/assets/bg-${details.type}.webp)` }}>
					<div className="tournament-info-heading">
						<div className="tournament-title-row">
							<h2>{details.name}</h2>
							<div className={`tournament-status-badge ${details.status.toLowerCase().replace(' ', '-')}`}>
								{details.status}
							</div>
						</div>
						<p>{details.description}</p>
						{!creator && (
							<button onClick={handleFollow} className="follow-tournament-btn" disabled={!loggedIn}>
								{following ? 'Following' : 'Follow'}
							</button>
						)}
					</div>

					<div className="tournament-info-format">
						<p>
							<strong>Format:</strong>
							{details.format}
						</p>
						<p>
							<strong>Location:</strong>
							{details.location}
						</p>
						<p>
							<strong>Teams:</strong>
							{details.teams}
						</p>
					</div>
					<div className="tournament-admin-actions">
						{creator && (
							<>
								<button className="delete-tournament-btn" onClick={handleDeleteTournament} title="Delete Tournament">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										height="20px"
										viewBox="0 -960 960 960"
										width="20px"
										fill="#FFFFFF">
										<path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
									</svg>
								</button>
								<button
									className="start-tournament-btn"
									disabled={details.status !== 'Not Started'}
									style={details.status === 'Not Started' ? {} : { display: 'none' }}
									onClick={handleTournamentStart}>
									Start Tournament
								</button>
							</>
						)}
					</div>
				</div>
			</div>
		</>
	);
}

function TournamentDetails({ details, loggedIn, creator }) {
	const [loading, setLoading] = useState(false);
	const [following, setFollowing] = useState(creator);
	const { showMessage } = useMessage();
	const confirm = useConfirm();
	const { id } = useParams();

	const navigate = useNavigate();

	/* const handleDeleteTournament = async () => {
		const confirmed = await confirm('Are you sure you want to delete this tournament? This action cannot be undone.');

		if (!confirmed) return;

		setLoading(true);
		const response = await deleteTournament(details.id, id);

		if (response.error) {
			showMessage('Error deleting tournament', 'error');
			setLoading(false);
			return;
		}

		// setLoading(false);

		showMessage('Tournament deleted successfully', 'success');
		navigate('/tournaments');
	};

	const handleTournamentStart = async () => {
		// setLoading(true);
		// Logic to start the tournament
		const confirmed = await confirm('Are you sure you want to start the tournament? This action cannot be undone.');
		if (!confirmed) {
			// setLoading(false);
			return;
		}
		setLoading(true);
		const response = await startTournament(details.id);
		if (!response.success) {
			showMessage('Error starting tournament', 'error');
			setLoading(false);
			return;
		}
		details.status = 'Ongoing';
		setLoading(false);
		showMessage('Tournament started successfully', 'success');
		window.location.reload();
	};

	const handleFollow = async () => {
		if (!loggedIn) {
			showMessage('You must be logged in to follow tournaments', 'error');
			return;
		}
		setLoading(true);
		if (following) {
			// Logic to unfollow the tournament
			const confirmed = await confirm('Are you sure you want to unfollow the tournament?');
			if (!confirmed) {
				setLoading(false);
				return;
			}
			const response = await leaveTournament(details.id);
			if (response.error) {
				showMessage('Error unfollowing tournament', 'error');
				setLoading(false);
				return;
			}
			showMessage('Tournament unfollowed successfully', 'success');
			setFollowing(false);
			setLoading(false);
			return;
		}

		const response = await joinTournament(details.id);
		if (response.error) {
			showMessage('Error following tournament', 'error');
			setLoading(false);
			return;
		}
		showMessage('Tournament followed successfully', 'success');
		setFollowing(true);
		setLoading(false);
	}; */

	return (
		<>
			{loading && <LoadingScreen />}
			{/* <div className="tournament-info">
				<div className="tournament-info-banner" style={{ '--banner-image': `url(/assets/bg-${details.type}.webp)` }}>
					<div className="tournament-info-heading">
						<div className="tournament-title-row">
							<h2>{details.name}</h2>
							<div className={`tournament-status-badge ${details.status.toLowerCase().replace(' ', '-')}`}>
								{details.status}
							</div>
						</div>
						<p>{details.description}</p>
						{!creator && (
							<button onClick={handleFollow} className="follow-tournament-btn" disabled={!loggedIn}>
								{following ? 'Following' : 'Follow'}
							</button>
						)}
					</div>

					<div className="tournament-info-format">
						<p>
							<strong>Format:</strong>
							{details.format}
						</p>
						<p>
							<strong>Location:</strong>
							{details.location}
						</p>
						<p>
							<strong>Teams:</strong>
							{details.teams}
						</p>
					</div>
					<div className="tournament-admin-actions">
						{creator && (
							<>
								<button className="delete-tournament-btn" onClick={handleDeleteTournament} title="Delete Tournament">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										height="20px"
										viewBox="0 -960 960 960"
										width="20px"
										fill="#FFFFFF">
										<path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
									</svg>
								</button>
								<button
									className="start-tournament-btn"
									disabled={details.status !== 'Not Started'}
									style={details.status === 'Not Started' ? {} : { display: 'none' }}
									onClick={handleTournamentStart}>
									Start Tournament
								</button>
							</>
						)}
					</div>
				</div>
			</div> */}
			<div className="tournament-info-fixtures">
				<h3>Upcoming Fixtures</h3>
				<div className="fixture-summary-scroll">
					{details.upcomingFixtures.length > 0 ? (
						details.upcomingFixtures.map((fixture) => {
							return (
								<div className="fixture-card" key={fixture.match_no}>
									<div className="fixture-header">
										<div className="fixture-match-number">Match #{fixture.match_no}</div>
										<div className="fixture-match-details">{fixture.round}</div>
									</div>
									<div className="details-fixture-teams">
										<div className="fixture-team">{fixture.team1}</div>
										<div className="fixture-team">{fixture.team2}</div>
									</div>
								</div>
							);
						})
					) : (
						<div className="fixture-card">
							<p>No upcoming fixtures</p>
						</div>
					)}
				</div>
			</div>
			<div className="tournament-info-fixtures">
				<h3>Recent Results</h3>
				<div className="fixture-summary-scroll">
					{details.results.length > 0 ? (
						details.results.map((result) => {
							return (
								<div className="result-card" key={result.match_no}>
									<div className="fixture-header">
										<div className="fixture-match-number">Match #{result.match_no}</div>
										<div className="fixture-match-details">{result.round}</div>
									</div>
									<table>
										<tbody>
											<tr>
												<td>{result.team1}</td>
												{result.result.map((score, index) => {
													return <td key={index}>{score[0]}</td>;
												})}
											</tr>
											<tr>
												<td>{result.team2}</td>
												{result.result.map((score, index) => {
													return <td key={index}>{score[1]}</td>;
												})}
											</tr>
										</tbody>
									</table>
								</div>
							);
						})
					) : (
						<div className="result-card">No results yet</div>
					)}
				</div>
			</div>
		</>
	);
}

function TournamentFixtures({ fixtures, creator, onUpdate, standings, tournamentId, status }) {
	const [filter, setFilter] = useState('all');
	const [selectedFixture, setSelectedFixture] = useState(null);
	const { showMessage } = useMessage();
	const hashId = useParams().id;
	const confirm = useConfirm();
	const [loading, setLoading] = useState(false);
	const [roundComplete, setRoundComplete] = useState(false);
	const [currentRound, setCurrentRound] = useState({});
	const [showNextRoundModal, setShowNextRoundModal] = useState(false);
	const [isLastRound, setIsLastRound] = useState(false);

	const allFixtures = [...fixtures.remainingFixtures, ...fixtures.results];

	const filteredFixtures = allFixtures.filter((fixture) => {
		switch (filter) {
			case 'upcoming':
				return fixture.status === 'WAITING';
			case 'live':
				return fixture.status === 'ONGOING';
			case 'completed':
				return fixture.status === 'COMPLETED';
			default:
				return true;
		}
	});

	useEffect(() => {
		const cRound = fixtures.rounds[fixtures.currentRound];
		setCurrentRound(cRound);
		setIsLastRound(fixtures.currentRound === fixtures.rounds.length - 1);
		setRoundComplete(cRound.completed === cRound.matches);
	}, [fixtures]);

	const formatResults = (score, team) => {
		const scores = score.map((s, index) => {
			return <div key={index}>{s[team]}</div>;
		});
		return scores;
	};

	const formatScore = (score) => {
		const updatedScores = score.map((s) => {
			return [s.team1, s.team2];
		});
		return updatedScores;
	};

	const handleUpdateScore = (fixture) => {
		setSelectedFixture(fixture);
	};

	const handleCloseScoreModal = () => {
		setSelectedFixture(null);
	};

	const handleSaveScore = async (score) => {
		const id = selectedFixture.id;
		score = formatScore(score);
		setLoading(true);
		const response = await updateScore(id, score, 'ONGOING', tournamentId, null);
		if (!response.success) {
			showMessage('Error updating score. Please try again later', 'error');
			handleCloseScoreModal();
			setLoading(false);
			return;
		} else {
			selectedFixture.status = 'ONGOING';
			selectedFixture.result = score;
			setLoading(false);
			handleCloseScoreModal();
			showMessage('Score updated successfully', 'success');
			onUpdate();
		}
	};

	const handleEndMatch = async (score) => {
		const id = selectedFixture.id;
		score = formatScore(score);

		const confirmed = await confirm(
			"Are you sure you want to end the match? You won't be able to update the score after this."
		);
		if (!confirmed) {
			setLoading(false);
			return;
		}
		setLoading(true);
		fixtures.rounds[fixtures.currentRound].completed += 1;
		const response = await updateScore(id, score, 'COMPLETED', tournamentId, fixtures.rounds);
		if (!response.success) {
			showMessage('Error updating score. Please try again later', 'error');
			fixtures.rounds[fixtures.currentRound].completed -= 1;
			handleCloseScoreModal();
			setLoading(false);
			return;
		} else {
			selectedFixture.status = 'COMPLETED';
			selectedFixture.result = score;

			if (fixtures.rounds[fixtures.currentRound].completed === fixtures.rounds[fixtures.currentRound].matches) {
				setRoundComplete(true);
			}
			showMessage('Score updated successfully', 'success');
			setLoading(false);
			handleCloseScoreModal();

			window.location.reload();
		}
	};

	const handleNextRound = () => {
		setShowNextRoundModal(true);
	};

	const handleNextRoundConfirm = async (qualifiedTeams) => {
		const confirmed = await confirm('Are you sure you want to start the next round? This action cannot be undone.');
		if (!confirmed) {
			setShowNextRoundModal(false);
			return;
		}
		setLoading(true);

		// send qualified teams, standings, remaining fixtures, currentRound, and rounds to server
		const response = await updateRounds(
			tournamentId,
			fixtures.rounds,
			qualifiedTeams,
			null,
			fixtures.remainingFixtures,
			fixtures.currentRound
		);
		setLoading(false);
		if (!response.success) {
			showMessage('Error starting next round. Please try again later', 'error');
			return;
		}
		setShowNextRoundModal(false);
		showMessage('Started next round. Please refresh to see changes', 'success');
	};

	const handleEndTournament = async () => {
		const confirmed = await confirm('Are you sure you want to end the tournament? This action cannot be undone.');

		if (!confirmed) return;

		setLoading(true);
		const response = await endTournament(tournamentId);

		if (!response.success) {
			showMessage('Error ending tournament', 'error');
			setLoading(false);
			return;
		}

		showMessage('Tournament completed successfully', 'success');
		window.location.reload();
	};

	return (
		<div className="tournament-fixtures-container">
			<div className="tournament-fixtures">
				{loading && <LoadingScreen />}
				{selectedFixture && (
					<ScoreUpdateModal
						fixture={selectedFixture}
						onClose={handleCloseScoreModal}
						onSave={handleSaveScore}
						onEndMatch={handleEndMatch}
					/>
				)}
				{showNextRoundModal && (
					<NextRoundModal
						standings={standings}
						onCancel={() => setShowNextRoundModal(false)}
						onConfirm={handleNextRoundConfirm}
						fixtures={fixtures}
					/>
				)}
				<div className="fixtures-summary">
					<div className="round-info-banner">
						<div className="round-status">
							<h4>Current Round</h4>
							<p className="current-round">{currentRound.round}</p>
							<div className="round-progress">
								<div className="round-progress-bar">
									<div
										className="progress-fill"
										style={{
											width: `${(currentRound.completed / currentRound.matches) * 100}%`,
										}}></div>
								</div>
							</div>
						</div>
						{creator &&
							roundComplete &&
							status !== 'Finished' &&
							(isLastRound ? (
								<button className="end-tournament-btn" onClick={handleEndTournament}>
									End Tournament
								</button>
							) : (
								<button className="next-round-btn" onClick={handleNextRound}>
									Start Next Round
								</button>
							))}
					</div>
					<div className="fixtures-content">
						<div className="fixtures-header">
							<h3>Fixtures</h3>
							<div className="fixtures-filter">
								<button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
									All
								</button>
								<button
									className={`filter-btn ${filter === 'upcoming' ? 'active' : ''}`}
									onClick={() => setFilter('upcoming')}>
									Upcoming
								</button>
								<button className={`filter-btn ${filter === 'live' ? 'active' : ''}`} onClick={() => setFilter('live')}>
									Live
								</button>
								<button
									className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
									onClick={() => setFilter('completed')}>
									Completed
								</button>
							</div>
						</div>
						<div className="fixtures-list">
							{filteredFixtures.length > 0 ? (
								filteredFixtures.map((fixture) => (
									<div className="tournament-fixture-card" key={fixture.match_no}>
										<div className="fixture-match-number">Match #{fixture.match_no}</div>
										<div className="fixture-match-details">{fixture.round}</div>
										<div className="fixture-teams-container">
											<div className="fixture-teams">
												<div className="fixture-team">{fixture.team1}</div>
												<div className="fixture-team">{fixture.team2}</div>
											</div>
											<div className="fixture-result">
												<div className="fixture-score">{fixture.result ? formatResults(fixture.result, 0) : 0}</div>
												<div className="fixture-score">{fixture.result ? formatResults(fixture.result, 1) : 0}</div>
											</div>
										</div>
										<div className="fixture-footer">
											<div className={`fixture-status ${fixture.status.toLowerCase()}`}>{fixture.status}</div>
											{creator && (
												<button
													className="update-score-btn"
													title="Update Score"
													onClick={() => handleUpdateScore(fixture)}
													disabled={fixture.status === 'COMPLETED'}
													style={fixture.editable ? {} : { display: 'none' }}>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														height="24px"
														viewBox="0 -960 960 960"
														width="24px"
														fill="#000000">
														<path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L530-360H360Zm481-424-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z" />
													</svg>
												</button>
											)}
										</div>
									</div>
								))
							) : (
								<div className="no-tournaments-message">
									<p>No {filter !== 'all' ? filter : ''} fixtures found</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function TournamentStandings({ standings, format, currentRound }) {
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
							<td className="sticky-column" style={{ backgroundColor: 'white' }}>
								{team.name}
							</td>
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
			<h3>
				Standings <Tooltip message={standingsMessage} />
			</h3>
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

function TournamentTeams({ teams, status, setPageUnsavedChanges, tournamentId, creator, onUpdate }) {
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
					<div>
						{stagedTeams.map((team, index) => (
							<div key={index} className="team-card">
								{team}
								{editTeams && (
									<svg
										xmlns="http://www.w3.org/2000/svg"
										height="24px"
										viewBox="0 -960 960 960"
										width="24px"
										fill="#FFFFFF"
										onClick={(e) => handleTeamNameChange(e, index)}>
										<path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L530-360H360Zm481-424-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z" />
									</svg>
								)}
							</div>
						))}
					</div>
					<div>{'Feature coming soon...'}</div>
				</div>
			</div>
		</>
	);
}

function CollectionView({ collection, collectionName, unsavedChanges, setUnsavedChanges }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const selectedTournament = collection[searchParams.get('selected')] || null;

	const handleTournamentSelect = (tournament) => {
		if (tournament !== null) {
			setSearchParams({ selected: tournament });
		} else {
			if (unsavedChanges) {
				const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
				if (!confirmed) {
					return;
				}
			}
			setSearchParams({});
		}
	};

	return (
		<>
			{!selectedTournament ? (
				<>
					<Link to="/tournaments" className="back-to-browse">
						&lt; Back to browse
					</Link>
					<div className="collection-info">
						<h2>{collectionName}</h2>
					</div>
					<div className="collection-tournaments">
						{collection.map((tournament, index) => {
							return (
								<div key={tournament.message.details.id} className="collection-tournament-card">
									<div className="tournament-name">{tournament.message.details.name}</div>
									<div className="tournament-description">{tournament.message.details.description}</div>
									<div
										className={`tournament-status ${tournament.message.details.status
											.toLowerCase()
											.replace(' ', '-')}`}>
										{tournament.message.details.status}
									</div>
									<button onClick={() => handleTournamentSelect(index)} className="view-tournament-btn">
										View
									</button>
								</div>
							);
						})}
					</div>
				</>
			) : (
				<TournamentManager
					tournamentData={selectedTournament.message}
					creator={selectedTournament.creator}
					backButton={
						<div className="back-to-browse" onClick={() => handleTournamentSelect(null)}>
							&lt; Back to Collection
						</div>
					}
					unsavedChanges={unsavedChanges}
					setUnsavedChanges={setUnsavedChanges}
				/>
			)}
		</>
	);
}
