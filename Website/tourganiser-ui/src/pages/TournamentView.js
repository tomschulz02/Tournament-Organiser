import { Link, useParams } from "react-router-dom";
import React, { useState, useEffect, useContext, useRef } from "react";
import { fetchTournamentData, joinTournament, leaveTournament, updateScore } from "../requests";
import "../styles/Tournaments.css";
import "../styles/TournamentView.css";
import { useMessage } from "../MessageContext";
import { useConfirm } from "../components/ConfirmDialog";
import { AuthContext } from "../AuthContext";
// import { TeamNameChangePopup } from "./Tournaments";
import LoadingScreen from "../components/LoadingScreen";
import ScoreUpdateModal from "../components/ScoreUpdateModal";

export default function TournamentView() {
	const { id } = useParams();
	const [tournamentData, setTournamentData] = useState(null);
	const [status, setStatus] = useState("Not Started");
	const [creator, setCreator] = useState(false);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);
	const [currentTab, setCurrentTab] = useState("info");
	const { showMessage } = useMessage();
	const { isLoggedIn } = useContext(AuthContext);
	const [collection, setCollection] = useState(false);
	const [collectionName, setCollectionName] = useState("");
	const hasFetchedDetails = useRef(false);

	useEffect(() => {
		const getTournamentDetails = async () => {
			try {
				const response = await fetchTournamentData(id);
				if (response.error) {
					setNotFound(true);
					showMessage("Tournament not found", "error");
					return;
				}
				setCreator(response.creator);
				setNotFound(false);
				if (!response.collection) {
					setCollection(false);
					console.log("Tournament data:", response.message);
					setTournamentData(response.message);
				} else {
					setCollection(true);
					setTournamentData(response.message);
					setCollectionName(response.collection);
				}
			} catch (error) {
				setNotFound(true);
				showMessage("Error fetching tournament data", "error");
			} finally {
				setLoading(false);
			}
		};
		if (hasFetchedDetails.current) return;
		hasFetchedDetails.current = true;
		getTournamentDetails();
	}, [id]);

	if (loading) {
		return <LoadingScreen />;
	}

	if (notFound) {
		return (
			<div style={{ textAlign: "center", marginTop: "2rem" }}>
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
				<Link to="/tournaments" className="back-to-browse">
					&lt; Back to browse
				</Link>
			}
		/>
	) : (
		<CollectionView collection={tournamentData} creator={creator} collectionName={collectionName} />
	);
}

function TournamentManager({ tournamentData, creator, backButton }) {
	const [currentTab, setCurrentTab] = useState("info");
	const { isLoggedIn } = useContext(AuthContext);

	return (
		<div className="tournament-view">
			{backButton}
			<div className="tab-navigation">
				<button
					className={`view-tab-btn ${currentTab === "info" ? "active" : ""}`}
					onClick={() => setCurrentTab("info")}>
					Overview
				</button>
				<button
					className={`view-tab-btn ${currentTab === "fixtures" ? "active" : ""}`}
					onClick={() => setCurrentTab("fixtures")}>
					Fixtures
				</button>
				<button
					className={`view-tab-btn ${currentTab === "results" ? "active" : ""}`}
					onClick={() => setCurrentTab("results")}>
					Results
				</button>
				<button
					className={`view-tab-btn ${currentTab === "teams" ? "active" : ""}`}
					onClick={() => setCurrentTab("teams")}>
					Teams
				</button>
			</div>
			{currentTab === "info" && (
				<TournamentDetails details={tournamentData.details} creator={creator} loggedIn={isLoggedIn} />
			)}
			{currentTab === "fixtures" && <TournamentFixtures fixtures={tournamentData.fixtures} creator={creator} />}
			{currentTab === "results" && <TournamentResults results={tournamentData.fixtures.results} />}
			{currentTab === "teams" && <TournamentTeams teams={tournamentData.teams[0]} />}
		</div>
	);
}

function TournamentDetails({ details, loggedIn, creator }) {
	const [status, setStatus] = useState(details.status === "Not Started" ? "Start Tournament" : "Tournament Started");
	const [loading, setLoading] = useState(false);
	const [following, setFollowing] = useState(creator);
	const { showMessage } = useMessage();
	const confirm = useConfirm();

	const startTournament = async () => {
		setLoading(true);
		// Logic to start the tournament
		const confirmed = await confirm("Are you sure you want to start the tournament? This action cannot be undone.");
		if (!confirmed) {
			setLoading(false);
			return;
		}
		console.log("Tournament started");
		setStatus("Tournament Started");
		setLoading(false);
		showMessage("Tournament started successfully", "success");
	};

	const handleFollow = async () => {
		if (!loggedIn) {
			showMessage("You must be logged in to follow tournaments", "error");
			return;
		}
		setLoading(true);
		if (following) {
			// Logic to unfollow the tournament
			const confirmed = await confirm("Are you sure you want to unfollow the tournament?");
			if (!confirmed) {
				setLoading(false);
				return;
			}
			const response = await leaveTournament(details.id);
			if (response.error) {
				showMessage("Error unfollowing tournament", "error");
				setLoading(false);
				return;
			}
			showMessage("Tournament unfollowed successfully", "success");
			setFollowing(false);
			setLoading(false);
			return;
		}

		const response = await joinTournament(details.id);
		if (response.error) {
			showMessage("Error following tournament", "error");
			setLoading(false);
			return;
		}
		showMessage("Tournament followed successfully", "success");
		setFollowing(true);
		setLoading(false);
	};

	return (
		<>
			{loading && <LoadingScreen />}
			<div className="tournament-info">
				<div className="tournament-info-heading">
					<h2>{details.name}</h2>
					<p>{details.description}</p>
					<button onClick={handleFollow} className="follow-tournament-btn" disabled={!loggedIn || creator}>
						{following ? "Following" : "Follow"}
					</button>
				</div>
				<div className="tournament-info-format">
					<p>
						<strong>Format:</strong>
						{" " + details.format}
					</p>
					<p>
						<strong>Status:</strong>
						{" " + details.status}
					</p>
					<p>
						<strong>Teams:</strong>
						{" " + details.teams}
					</p>
				</div>
				{creator && (
					<button
						className="start-tournament-btn"
						disabled={details.status !== "Not Started"}
						onClick={startTournament}>
						{status}
					</button>
				)}
			</div>
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
									<div className="fixture-match-number">Match #{result.match_no}</div>
									<div className="fixture-match-details">{result.round}</div>
									<table>
										<tr>
											<td style={{ width: "auto" }}>{result.team1}</td>
											{result.score.map((score, index) => {
												return <td key={index}>{score[0]}</td>;
											})}
										</tr>
										<tr>
											<td style={{ width: "auto" }}>{result.team2}</td>
											{result.score.map((score, index) => {
												return <td key={index}>{score[1]}</td>;
											})}
										</tr>
									</table>
								</div>
							);
						})
					) : (
						<div className="result-card">
							<div className="fixture-match-number">Match #1</div>
							<div className="fixture-match-details">Group Stage - Round 1</div>
							<table>
								<tbody>
									<tr>
										<td>Team Alpha</td>
										<td>2</td>
									</tr>
									<tr>
										<td>Team Beta</td>
										<td>1</td>
									</tr>
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		</>
	);
}

function TournamentFixtures({ fixtures, creator }) {
	const [filter, setFilter] = useState("all");
	const [selectedFixture, setSelectedFixture] = useState(null);
	const { showMessage } = useMessage();

	const filteredFixtures = fixtures.remainingFixtures.filter((fixture) => {
		switch (filter) {
			case "upcoming":
				return fixture.status === "WAITING";
			case "live":
				return fixture.status === "ONGOING";
			case "completed":
				return fixture.status === "COMPLETED";
			default:
				return true;
		}
	});

	const formatResults = (score) => {
		const scores = score.map((s, index) => {
			return <div key={index}>{s}</div>;
		});
		return scores;
	};

	const handleUpdateScore = (fixture) => {
		setSelectedFixture(fixture);
	};

	const handleCloseScoreModal = () => {
		setSelectedFixture(null);
	};

	const handleSaveScore = async (score) => {
		const id = selectedFixture.id;
		const response = await updateScore(id, score, "ONGOING");
		if (!response.success) {
			showMessage("Error updating score. Please try again later", "error");
			return;
		}
	};

	const handleEndMatch = (result) => {
		console.log(fixtures);
	};

	return (
		<div className="tournament-fixtures">
			{selectedFixture && (
				<ScoreUpdateModal
					fixture={selectedFixture}
					onClose={handleCloseScoreModal}
					onSave={handleSaveScore}
					onEndMatch={handleEndMatch}
				/>
			)}
			<div className="fixtures-header">
				<h3>Fixtures</h3>
				<div className="fixtures-filter">
					<button className={`filter-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
						All
					</button>
					<button
						className={`filter-btn ${filter === "upcoming" ? "active" : ""}`}
						onClick={() => setFilter("upcoming")}>
						Upcoming
					</button>
					<button className={`filter-btn ${filter === "live" ? "active" : ""}`} onClick={() => setFilter("live")}>
						Live
					</button>
					<button
						className={`filter-btn ${filter === "completed" ? "active" : ""}`}
						onClick={() => setFilter("completed")}>
						Completed
					</button>
				</div>
			</div>
			{filteredFixtures.length > 0 ? (
				filteredFixtures.map((fixture) => (
					<div className="tournament-fixture-card" key={fixture.match_no}>
						<div className="fixture-match-number">Match #{fixture.match_no}</div>
						<div className="fixture-match-details">{fixture.round}</div>
						<div className="fixture-teams">
							<div className="fixture-team">{fixture.team1}</div>
							<div className="fixture-team">{fixture.team2}</div>
						</div>
						<div className="fixture-result">
							<div className="fixture-score">{fixture.score ? formatResults(fixture.score) : formatResults([0])}</div>
							<div className="fixture-score">{fixture.score ? formatResults(fixture.score) : formatResults([0])}</div>
						</div>
						<div className="fixture-footer">
							<div className={`fixture-status ${fixture.status.toLowerCase()}`}>{fixture.status}</div>
							{creator && (
								<button
									className="update-score-btn"
									onClick={() => handleUpdateScore(fixture)}
									disabled={fixture.status === "COMPLETED"}>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										height="24px"
										viewBox="0 -960 960 960"
										width="24px"
										fill="#2962ff">
										<path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" />
									</svg>
								</button>
							)}
						</div>
					</div>
				))
			) : (
				<div className="no-tournaments-message">
					<p>No {filter !== "all" ? filter : ""} fixtures found</p>
				</div>
			)}
		</div>
	);
}

function TournamentResults({ results }) {
	return (
		<div className="tournament-results">
			<h3>Results</h3>
			{results.length > 0 ? (
				results.map((result) => {
					return (
						<div className="result-card" key={result.match_no}>
							<p>Match #{result.match_no}</p>
							<table>
								<tr>
									<td style={{ width: "auto" }}>{result.team1}</td>
									{result.score.map((score, index) => {
										return <td key={index}>{score[0]}</td>;
									})}
								</tr>
								<tr>
									<td style={{ width: "auto" }}>{result.team2}</td>
									{result.score.map((score, index) => {
										return <td key={index}>{score[1]}</td>;
									})}
								</tr>
							</table>
						</div>
					);
				})
			) : (
				<div className="result-card">
					<p>No results available</p>
				</div>
			)}
		</div>
	);
}

function TournamentTeams({ teams }) {
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
	console.log("Teams:", teams);
	const isPooled = Array.isArray(teams[0]);

	return (
		<div className="tournament-teams">
			<h3>Teams</h3>
			{isPooled ? (
				<div className="teams-pools">
					{teams.map((pool, poolIndex) => (
						<div key={poolIndex} className="team-pool">
							<h4>Pool {poolIndex + 1}</h4>
							{pool.map((team, teamIndex) => (
								<div key={`${poolIndex}-${teamIndex}`} className="team-card">
									{team}
								</div>
							))}
						</div>
					))}
				</div>
			) : (
				<div className="teams-grid">
					{teams.map((team, index) => (
						<div key={index} className="team-card">
							{team}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function CollectionView({ collection, collectionName, creator }) {
	const { showMessage } = useMessage();
	const [loading, setLoading] = useState(true);
	const { isLoggedIn } = useContext(AuthContext);
	const [selectedTournament, setSelectedTournament] = useState(null);

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
						{collection.map((tournament) => {
							return (
								<div key={tournament.details.id} className="collection-tournament-card">
									<div className="tournament-name">{tournament.details.name}</div>
									<div className="tournament-description">{tournament.details.description}</div>
									<div className={`tournament-status ${tournament.details.status.toLowerCase().replace(" ", "-")}`}>
										{tournament.details.status}
									</div>
									<button onClick={() => setSelectedTournament(tournament)} className="view-tournament-btn">
										View
									</button>
								</div>
							);
						})}
					</div>
				</>
			) : (
				<TournamentManager
					tournamentData={selectedTournament}
					creator={creator}
					backButton={
						<div className="back-to-browse" onClick={() => setSelectedTournament(null)}>
							&lt; Back to Collection
						</div>
					}
				/>
			)}
		</>
	);
}
