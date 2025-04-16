import React, { useEffect, useState } from "react";
import "../styles/Tournaments.css";

export default function Tournaments() {
	const [currentPage, setCurrentPage] = useState("browse");

	return (
		<div className="tabs-container">
			<div className="tab-buttons">
				<button
					className={`tab-btn ${currentPage === "browse" ? "active" : ""}`}
					data-tab="browse"
					onClick={() => setCurrentPage("browse")}>
					Browse Tournaments
				</button>
				<button
					className={`tab-btn ${currentPage === "create" ? "active" : ""}`}
					data-tab="create"
					onClick={() => setCurrentPage("create")}>
					Create Tournament
				</button>
			</div>
			<div className="tab-content active">
				{currentPage === "browse" ? <BrowseTournaments /> : <CreateTournament />}
			</div>
		</div>
	);
}

function BrowseTournaments() {
	return (
		<div className="browse-tournaments">
			<div className="search-section">
				<input type="text" id="searchTournaments" placeholder="Search tournaments..." />
				<select id="filterFormat">
					<option value="all">All Formats</option>
					<option value="single">Single Elimination</option>
					<option value="double">Double Elimination</option>
					<option value="round">Round Robin</option>
					<option value="combi">Round Robin + Knockout</option>
				</select>
			</div>
			<div className="tournaments-grid" id="tournamentsGrid">
				{/* <!-- Example tournament cards --> */}
				<div className="tournament-card">
					<h3>Summer Volleyball Championship</h3>
					<p className="tournament-date">Starting: July 1, 2024</p>
					<p className="tournament-format">Format: Single Elimination</p>
					<p className="tournament-location">Location: London</p>
					<button className="view-btn" name="1">
						Join Tournament
					</button>
				</div>
				{/* <!-- More tournament cards... --> */}
			</div>
		</div>
	);
}

function CreateTournament() {
	const [currentSlide, setCurrentSlide] = useState(1);
	const [tournamentData, setTournamentData] = useState({
		tournamentName: "",
		startDate: "",
		location: "",
		description: "",
		tournamentCollection: "",
		format: "combi",
		type: "indoor",
		teamCount: "",
		numGroups: "",
		knockoutRound: 0,
		teams: [],
	});
	const [isLoggedIn, setIsLoggedIn] = useState(true);
	const [expandOptions, setExpandOptions] = useState(true);
	const [teamList, setTeamList] = useState([]);
	const [tempTeamCount, setTempTeamCount] = useState(0);
	const [openCollectionPopup, setOpenCollectionPopup] = useState(false);
	const [openTeamNameChangePopup, setOpenTeamNameChangePopup] = useState(false);
	const [teamNameChange, setTeamNameChange] = useState({
		name: "",
		rank: 0,
	});

	useEffect(() => {
		setTempTeamCount(tournamentData.teamCount);
		setTeamList((prevTeamList) => {
			const updatedList = [...prevTeamList];

			if (tournamentData.teamCount > prevTeamList.length) {
				for (let i = prevTeamList.length; i < tournamentData.teamCount; i++) {
					updatedList.push(`Team ${i + 1}`);
				}
			} else if (tournamentData.teamCount < prevTeamList.length) {
				updatedList.length = tournamentData.teamCount;
			}

			return updatedList;
		});
	}, [tournamentData.teamCount]);

	const validateFirstSlide = () => {
		const tournamentName = tournamentData.tournamentName;
		const startDate = tournamentData.startDate;
		const location = tournamentData.location;

		// Check if required fields are filled
		if (!tournamentName || !startDate || !location) {
			// Add error class to empty required fields
			if (!tournamentName) document.getElementById("tournamentName").classList.add("error");
			if (!startDate) document.getElementById("startDate").classList.add("error");
			if (!location) document.getElementById("location").classList.add("error");
			return false;
		}

		return true;
	};

	const validateSecondSlide = () => {
		const format = tournamentData.format;
		const teams = tournamentData.teamCount;
		const groups = tournamentData.numGroups;

		if (format === "combi") {
			if (!teams || !groups) {
				if (!teams) document.getElementById("teamCount").classList.add("error");
				if (!groups) document.getElementById("numGroups").classList.add("error");
				return false;
			}
		} else {
			if (!teams) {
				document.getElementById("teamCount").classList.add("error");
				return false;
			}
		}

		populateTeamlist(teams);
		return true;
	};

	const populateTeamlist = (count) => {
		if (teamList.length === 0) {
			for (let index = 1; index <= count; index++) {
				setTeamList(...teamList, { id: index, name: `Team ${index}` });
			}
		} else if (teamList.length < count) {
			for (let index = teamList.length + 1; index <= count; index++) {
				setTeamList(...teamList, { id: index, name: `Team ${index}` });
			}
		} else if (teamList.length > count) {
			setTeamList(teamList.splice(count, teamList.length - count));
		}
	};

	const nextSlide = () => {
		if (currentSlide === 1 && validateFirstSlide()) {
			setCurrentSlide(2);
		} else if (currentSlide === 2 && validateSecondSlide()) {
			setCurrentSlide(3);
		}
	};

	const prevSlide = () => {
		if (currentSlide > 1) {
			setCurrentSlide(currentSlide - 1);
		} else {
			setCurrentSlide(1);
		}
	};

	const handleChange = (e) => {
		if (e.target.type === "radio") {
			setTournamentData({
				...tournamentData,
				type: e.target.value,
			});
		} else {
			if ((e.target.id === "teamCount" || e.target.id === "numGroups") && e.target.value !== "") {
				setTournamentData({
					...tournamentData,
					[e.target.id]: parseInt(e.target.value),
				});
			} else {
				setTournamentData({
					...tournamentData,
					[e.target.id]: e.target.value,
				});
			}
		}

		if (e.target.id === "format") {
			setExpandOptions(e.target.value === "combi");
		}
	};

	const handleBlur = () => {
		const parsed = parseInt(tempTeamCount, 10);
		if (!isNaN(parsed) && parsed > 0) {
			setTournamentData({
				...tournamentData,
				teamCount: parsed,
			});
		}
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		setTournamentData({
			...tournamentData,
			teams: teamList,
		});
		console.log("Tournament Created:", tournamentData);
	};

	const handleTeamNameChangePopup = (action, name, rank) => {
		setTeamNameChange({ name: name, rank: rank });
		setOpenTeamNameChangePopup(action === "open");
	};

	const handleTeamNameChangeSubmit = (e, rank, newName) => {
		e.preventDefault();
		setTeamList((prevTeamList) => {
			const updatedList = [...prevTeamList];
			updatedList[rank - 1] = newName;
			return updatedList;
		});
	};

	return (
		<div className="create-tournament">
			{openCollectionPopup && <CollectionPopup />}
			{openTeamNameChangePopup && (
				<TeamNameChangePopup
					onClose={() => handleTeamNameChangePopup("close")}
					onSubmit={handleTeamNameChangeSubmit}
					currName={teamNameChange.name}
					rank={teamNameChange.rank}
				/>
			)}
			<div id="signinRequest" className="signin-request" style={{ display: isLoggedIn ? "none" : "block" }}>
				<h3>You must be logged in to be able to create tournaments</h3>
			</div>
			<div id="createFormContainer" className="form-container" style={{ display: isLoggedIn ? "block" : "none" }}>
				<form id="tournament-form" className="multi-step-form" onSubmit={handleSubmit}>
					{/* <!-- Progress Bar --> */}
					<div className="progress-bar">
						<div className={`step ${currentSlide === 1 ? "active" : ""}`}>Details</div>
						<div className={`step ${currentSlide === 2 ? "active" : ""}`}>Format</div>
						<div className={`step ${currentSlide === 3 ? "active" : ""}`}>Teams</div>
					</div>

					{/* <!-- Slide 1: Tournament Details --> */}
					<div className={`form-slide ${currentSlide === 1 ? "active" : ""}`} id="slide-1">
						<h2>Tournament Details</h2>
						<br />
						<div className="form-group">
							<label htmlFor="tournamentName">Tournament Name*</label>
							<input
								type="text"
								id="tournamentName"
								onChange={handleChange}
								value={tournamentData.tournamentName}
								required
							/>
						</div>
						<div className="two-column-layout">
							<div className="column">
								<div className="form-group">
									<label htmlFor="startDate">Start Date*</label>
									<input type="date" id="startDate" onChange={handleChange} value={tournamentData.startDate} required />
								</div>
							</div>
							<div className="column">
								<div className="form-group">
									<label htmlFor="location">Location*</label>
									<input type="text" id="location" onChange={handleChange} value={tournamentData.location} required />
								</div>
							</div>
						</div>
						<div className="form-group" style={{ marginBottom: "30px" }}>
							<label htmlFor="description">Description (optional)</label>
							<textarea id="description" onChange={handleChange} value={tournamentData.description} rows="4"></textarea>
						</div>
						<div className="form-group">
							<label htmlFor="tournamentCollection">Collection </label>
							<span id="collectionTooltip">?</span>
							<select id="tournamentCollection" onChange={handleChange} value={tournamentData.tournamentCollection}>
								<option value="null">--</option>
								<option value="new">Create new Collection</option>
							</select>
						</div>
						<p>*required</p>
					</div>

					{/* <!-- Slide 2: Tournament Structure --> */}
					<div className={`form-slide ${currentSlide === 2 ? "active" : ""}`} id="slide-2">
						<h2>Tournament Format</h2>
						<br />
						<div className="two-column-layout">
							<div className="column">
								<div className="form-group">
									<label htmlFor="format">Tournament Format*</label>
									<select id="format" onChange={handleChange} value={tournamentData.format} required>
										{/* <!-- All options are disabled for now. Only combi is available for MVP --> */}
										<option value="single">Single Elimination</option>
										<option value="double">Double Elimination</option>
										<option value="round">Round Robin</option>
										<option value="combi">Round Robin + Knockout</option>
									</select>
								</div>
								<div className="two-column-layout">
									<div className="column">
										<div className="form-group">
											<div>Volleyball Type*</div>
											<div className="radio-group" id="volleyballType">
												<div className="radio-option">
													<input
														type="radio"
														id="indoor"
														name="volleyballType"
														value="indoor"
														onChange={handleChange}
														defaultChecked
														required
													/>
													<label htmlFor="indoor">Indoor</label>
												</div>
												<div className="radio-option">
													<input
														type="radio"
														id="beach"
														name="volleyballType"
														value="beach"
														onChange={handleChange}
														required
													/>
													<label htmlFor="beach">Beach</label>
												</div>
											</div>
										</div>
									</div>
									<div className="column">
										<div className="form-group">
											<label htmlFor="teamCount">Number of Teams*</label>
											<input
												type="number"
												id="teamCount"
												onChange={(e) => {
													setTempTeamCount(e.target.value);
												}}
												onBlur={handleBlur}
												min="2"
												value={tempTeamCount}
												required
											/>
										</div>
									</div>
								</div>
								<div className={`form-group ${expandOptions ? "" : "hidden"}`} id="groupCount">
									<label htmlFor="numGroups">Number of groups*</label>
									<input
										type="number"
										id="numGroups"
										min="2"
										onChange={handleChange}
										value={tournamentData.numGroups}
									/>
								</div>
								<div className={`form-group ${expandOptions ? "" : "hidden"}`} id="knockout">
									<label htmlFor="knockoutRound">First Knockout Round*</label>
									<select type="number" id="knockoutRound" onChange={handleChange} value={tournamentData.knockoutRound}>
										<option value="12">Round of 24</option>
										<option value="8">Round of 16</option>
										<option value="6">Round of 12</option>
										<option value="4">Quarterfinals</option>
										<option value="2">Semifinals</option>
										<option value="1">Finals</option>
									</select>
								</div>
								<p>*required</p>
							</div>
							<div className="divider"></div>
							<div className="column">
								<h2>Description</h2>
								<div className={`description ${tournamentData.format === "single" ? "" : "hidden"}`} id="single">
									<h3>Single Elimination</h3>
									<p>
										Teams are eliminated after losing a match. The tournament continues until only one team remains.
									</p>
								</div>
								<div className={`description ${tournamentData.format === "double" ? "" : "hidden"}`} id="double">
									<h3>Double Elimination</h3>
									<p>
										Teams have two chances to stay in the tournament. A team must lose twice to be eliminated. <br />
										Teams that have lost for the first time play other teams that have lost in a "Losers' Bracket". The
										winner moves on to face the next loser from the "Winners' Bracket". <br />
										The final two teams of the "Winners' Bracket" face the final two teams of the "Losers' Bracket" in
										the semifinals.
									</p>
								</div>
								<div className={`description ${tournamentData.format === "round" ? "" : "hidden"}`} id="round">
									<h3>Round Robin</h3>
									<p>
										Teams play against every other team in the tournament. Points are awarded for wins and ties. <br />
										The team with the most points at the end of the round wins.
									</p>
								</div>
								<div className={`description ${tournamentData.format === "combi" ? "" : "hidden"}`} id="combi">
									<h3>Round Robin + Knockout</h3>
									<p>
										Teams are divided equally (as possible) into groups. <br />
										Teams play against every other team in their group. Points are awarded for wins and ties. <br />
										The top teams from the round robin stage advance to the knockout stage. <br />
										<br />
										You choose the number of teams per group and the first knockout round. <br />
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* <!-- Slide 3: Team list --> */}
					<div className={`form-slide ${currentSlide === 3 ? "active" : ""}`} id="slide-3">
						<h2>Teams</h2>
						<div className="two-column-layout">
							<div className="column">
								<div className="team-list-headings">
									<h4>Rank</h4>
									<h4 style={{ width: "60%" }}>Team name</h4>
									<h4>Edit</h4>
								</div>
								<div id="teamList" className="team-list">
									{teamList.map((team, index) => {
										return (
											<div key={index + 1} className="team-slot">
												<p>{index + 1}.</p>
												<p className="team-name">{team}</p>
												<div
													className="edit-team-name"
													onClick={() => handleTeamNameChangePopup("open", team, index + 1)}>
													<i className="fas fa-pen"></i>
												</div>
											</div>
										);
									})}
								</div>
							</div>
							<div className="divider"></div>
							<div className="column">
								<h2>Description</h2>
								<div className="description">
									<h3>Team names</h3>
									<p>
										The teams are pre-generated based on the number of teams you selected in a previous step. <br />
										You can change the names of the teams here in this list, or you can also do that later in the
										tournament manager after creating this tournament.
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* <!-- Navigation Buttons --> */}
					<div className="form-navigation">
						<button
							type="button"
							id="nextBtn"
							className="nav-btn"
							onClick={nextSlide}
							style={{ display: `${currentSlide === 3 ? "none" : "block"}` }}>
							Next
						</button>
						<button
							type="submit"
							id="submitBtn"
							className="nav-btn"
							style={{ display: `${currentSlide === 3 ? "block" : "none"}` }}>
							Create Tournament
						</button>
						<button
							type="button"
							id="prevBtn"
							className="nav-btn"
							onClick={prevSlide}
							style={{ display: `${currentSlide === 1 ? "none" : "block"}` }}>
							Previous
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

function CollectionPopup() {
	return (
		<div>
			<h2>Collection</h2>
			<p>Here you can create a collection for your tournaments.</p>
			<div className="form-group">
				<label htmlFor="collectionName">Collection Name*</label>
				<input type="text" id="collectionName" required />
			</div>
		</div>
	);
}

function TeamNameChangePopup({ onClose, onSubmit, currName, rank }) {
	const handleSubmit = (e) => {
		e.preventDefault();
		const newName = document.getElementById("newTeamName").value;
		if (newName === "") {
			document.getElementById("newTeamName").classList.add("error");
			return;
		}
		document.getElementById("newTeamName").classList.remove("error");

		onSubmit(e, rank, newName);
		onClose();
	};

	return (
		<div id="teamNameChangePopup" className="team-name-change">
			<div className="team-name-change-content">
				<div className="close-btn" id="closeNameChangePopup" onClick={onClose}>
					&times;
				</div>
				<h2>Change team name</h2>
				<sub>
					Change the name of the team at rank: <span id="nameChangeTeamRank">{rank}</span>
				</sub>
				<form id="nameChangeForm" className="name-change-form" onSubmit={handleSubmit}>
					<div className="name-change-input">
						<label htmlFor="currentTeamName">Current:</label>
						<input id="currentTeamName" type="text" value={currName} disabled />
					</div>
					<div className="exchange-icon">
						<i className="fas fa-exchange-alt"></i>
					</div>
					<div className="name-change-input">
						<label htmlFor="newTeamName">New:</label>
						<input type="text" id="newTeamName" />
					</div>
					<button type="submit" className="name-change-button">
						Save Changes
					</button>
				</form>
			</div>
		</div>
	);
}
