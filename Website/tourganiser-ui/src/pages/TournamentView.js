import { Link, useParams } from "react-router-dom";
import React, { useState, useEffect, useContext } from "react";
import { fetchTournamentData } from "../requests";
import "../styles/Tournaments.css";
import { useMessage } from "../MessageContext";
import { AuthContext } from "../AuthContext";
import { TeamNameChangePopup } from "./Tournaments";

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
		getTournamentDetails();
	}, [id]);

	if (loading) {
		return (
			<div style={{ textAlign: "center", marginTop: "2rem" }}>
				<h2>Loading...</h2>
			</div>
		);
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
		<TournamentManager tournamentData={tournamentData} creator={creator} />
	) : (
		<CollectionView collection={tournamentData} creator={creator} collectionName={collectionName} />
	);
}

function TournamentManager({ tournamentData, creator }) {
	const [currentTab, setCurrentTab] = useState("info");
	const { isLoggedIn } = useContext(AuthContext);

	return (
		<div className="tournament-view">
			<Link to="/tournaments" className="back-to-browse">
				&lt; Back to browse
			</Link>
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
			{currentTab === "fixtures" && <TournamentFixtures fixtures={tournamentData.fixtures} />}
			{currentTab === "results" && <TournamentResults results={tournamentData.fixtures.results} />}
			{currentTab === "teams" && <TournamentTeams teams={tournamentData.teams} />}
		</div>
	);
}

function TournamentDetails({ details, loggedIn, creator }) {
	const [status, setStatus] = useState(details.status === "Not Started" ? "Start Tournament" : "Tournament Started");
	const [loading, setLoading] = useState(false);
	const { showMessage } = useMessage();

	const startTournament = () => {
		setLoading(true);
		// Logic to start the tournament
		const confirm = window.confirm("Are you sure you want to start the tournament? This action cannot be undone.");
		if (!confirm) {
			setLoading(false);
			return;
		}
		console.log("Tournament started");
		setStatus("Tournament Started");
		setLoading(false);
		showMessage("Tournament started successfully", "success");
	};

	return (
		<>
			<div className="tournament-info">
				<div className="tournament-info-heading">
					<h2>{details.name}</h2>
					<p>{details.description}</p>
					<button className="follow-tournament-btn" disabled={!loggedIn}>
						Follow Tournament
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
						{loading ? (
							<div className="loading-spinner">
								<div className="spinner"></div>
							</div>
						) : (
							status
						)}
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
									<p>Match #{fixture.match_no}</p>
									<p>
										{fixture.team1} vs. {fixture.team2}
									</p>
									<p>{fixture.round}</p>
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
							<p>No recent results</p>
						</div>
					)}
				</div>
			</div>
		</>
	);
}

function TournamentFixtures({ fixtures }) {
	return (
		<div className="tournament-fixtures">
			<h3>Fixtures</h3>
			{fixtures.remainingFixtures.length > 0 ? (
				fixtures.remainingFixtures.map((fixture) => {
					return (
						<div className="fixture-card" key={fixture.match_no}>
							<p>Match #{fixture.match_no}</p>
							<p>
								{fixture.team1} vs. {fixture.team2}
							</p>
							<p>{fixture.round}</p>
						</div>
					);
				})
			) : (
				<div className="fixture-card">
					<p>No remaining fixtures</p>
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
	return (
		<div className="tournament-teams">
			<h3>Teams</h3>
			{teams.length > 0 ? (
				teams.map((team) => {
					return (
						<div className="team-card" key={team}>
							{team}
						</div>
					);
				})
			) : (
				<div className="team-card">
					<p>No teams available</p>
				</div>
			)}
		</div>
	);
}

function CollectionView({ collection, collectionName, creator }) {
	const { showMessage } = useMessage();
	const [loading, setLoading] = useState(true);
	const { isLoggedIn } = useContext(AuthContext);

	return (
		<>
			<div className="collection-info">
				<h2>{collectionName}</h2>
			</div>
			<div className="collection-tournaments"></div>
		</>
	);
}
