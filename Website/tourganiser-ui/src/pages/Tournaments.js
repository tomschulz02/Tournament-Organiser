import React, { useEffect, useState, useContext, useRef } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../AuthContext";
import { useMessage } from "../MessageContext";
import { getTournaments, createCollection, createTournament, fetchUserCollections } from "../requests";
import Tooltip from "../components/Tooltip";
import { useConfirm } from "../components/ConfirmDialog";
import LoadingScreen from "../components/LoadingScreen";
import "../styles/Tournaments.css";

const tooltips = {
	collections:
		"You can group tournaments in collections so that they can be viewed together. Tournaments that are part of a collection will not be displayed on the browse page, but rather in the view page of the collection it belongs to.",
};

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
				{currentPage === "browse" ? (
					<BrowseTournaments />
				) : (
					<CreateTournament goBack={() => setCurrentPage("browse")} />
				)}
			</div>
		</div>
	);
}

function BrowseTournaments() {
	const [tournaments, setTournaments] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const { showMessage } = useMessage();
	const hasFetchedTournaments = useRef(false);
	const [filter, setFilter] = useState({
		format: "all",
		search: "",
	});

	const filteredTournaments = tournaments.filter((tournament) => {
		if (filter.format !== "all" && tournament.type !== filter.format) {
			return false;
		}
		if (filter.search && !tournament.name.toLowerCase().includes(filter.search.toLowerCase())) {
			return false;
		}
		return true;
	});

	useEffect(() => {
		setIsLoading(true);
		const fetchTournaments = async () => {
			try {
				const response = await getTournaments();
				if (response.message.length > 0) {
					setTournaments(response.message);
					// console.log("Fetched tournaments:", response.message);
				} else {
					// showMessage("Failed to fetch tournaments", "error");
					setTournaments([]);
				}
			} catch (error) {
				showMessage("Error fetching tournaments", "error");
			} finally {
				setIsLoading(false);
			}
		};
		if (!hasFetchedTournaments.current) {
			hasFetchedTournaments.current = true;
			fetchTournaments();
		}
	}, []);

	const handlefilterChange = (e) => {
		if (e.target.id === "searchTournaments") {
			setFilter((prev) => ({ ...prev, search: e.target.value }));
		} else if (e.target.id === "filterFormat") {
			setFilter((prev) => ({ ...prev, format: e.target.value }));
		}
	};

	return (
		<div className="browse-tournaments">
			{isLoading && <LoadingScreen />}
			<div className="search-section">
				<input
					type="text"
					id="searchTournaments"
					value={filter.search}
					onChange={handlefilterChange}
					placeholder="Search tournaments..."
				/>
				<select id="filterFormat" value={filter.format} onChange={handlefilterChange}>
					<option value="all">All</option>
					<option value="beach">Beach Tournaments</option>
					<option value="indoor">Indoor Tournaments</option>
					<option value="collection">Collections</option>
				</select>
			</div>
			<div className="tournaments-grid" id="tournamentsGrid">
				{filteredTournaments.length > 0 ? (
					filteredTournaments.map((tournament) => {
						if (tournament.classification === "tournament") {
							return (
								<div className="tournament-card" key={tournament.id}>
									<div className={`type-indicator ${tournament.type}`}>{tournament.type}</div>
									<h3>{tournament.name}</h3>
									<p className="tournament-date">Starting: {tournament.date}</p>
									<p className="tournament-format">Format: {tournament.format}</p>
									<p className="tournament-location">Location: {tournament.location}</p>
									<Link to={`/tournaments/view/${tournament.id}`} className="view-btn" name={tournament.id}>
										View Tournament
									</Link>
								</div>
							);
						} else if (tournament.classification === "collection") {
							return (
								<div className="tournament-card" key={tournament.id}>
									<div className="type-indicator collection">Collection</div>
									<h3>{tournament.name}</h3>
									<p className="tournament-date">Tournaments: {tournament.num_tournaments}</p>
									<Link to={`/tournaments/view/${tournament.id}`} className="view-btn" name={tournament.id}>
										View Collection
									</Link>
								</div>
							);
						}
					})
				) : (
					<div className="no-tournaments-message">No tournaments available</div>
				)}

				{/* <!-- Example tournament cards --> */}
				{/* <div className="tournament-card">
					<h3>Summer Volleyball Championship</h3>
					<p className="tournament-date">Starting: July 1, 2024</p>
					<p className="tournament-format">Format: Single Elimination</p>
					<p className="tournament-location">Location: London</p>
					<Link to="/tournaments/view/1" className="view-btn" name="1">
						Join Tournament
					</Link>
				</div> */}
				{/* <!-- More tournament cards... --> */}
			</div>
		</div>
	);
}

function CreateTournament({ goBack }) {
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
	const { isLoggedIn } = useContext(AuthContext);
	const [expandOptions, setExpandOptions] = useState(tournamentData.format === "combi");
	const [teamList, setTeamList] = useState([]);
	const [tempTeamCount, setTempTeamCount] = useState("");
	const [openCollectionPopup, setOpenCollectionPopup] = useState(false);
	const [openTeamNameChangePopup, setOpenTeamNameChangePopup] = useState(false);
	const [teamNameChange, setTeamNameChange] = useState({
		name: "",
		rank: 0,
	});
	const { showMessage } = useMessage();
	const [collectionOptions, setCollectionOptions] = useState([
		{ name: "--", id: "" },
		{ name: "Create new collection", id: "new" },
	]);
	const hasFetchedCollections = useRef(false);
	const confirm = useConfirm();
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		// setTempTeamCount(tournamentData.teamCount);
		setTeamList((prevTeamList) => {
			const updatedList = [...prevTeamList];

			if (tournamentData.teamCount > prevTeamList.length) {
				for (let i = prevTeamList.length; i < tournamentData.teamCount; i++) {
					updatedList.push(`Team ${i + 1}`);
				}
			} else if (tournamentData.teamCount < prevTeamList.length) {
				updatedList.length = tournamentData.teamCount;
			}

			setTournamentData({
				...tournamentData,
				teams: updatedList,
			});
			return updatedList;
		});
	}, [tournamentData.teamCount]);

	useEffect(() => {
		const fetchCollections = async () => {
			try {
				const response = await fetchUserCollections();
				if (response.message.length > 0) {
					setCollectionOptions((prevOptions) => [...prevOptions, ...response.message]);
				}
			} catch (error) {
				showMessage("Error fetching collections", "error");
			}
		};
		if (hasFetchedCollections.current) return;
		hasFetchedCollections.current = true;
		fetchCollections();
	}, []);

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

		if (tournamentData.tournamentCollection === "new") {
			// Open collection popup
			setOpenCollectionPopup(true);
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

		return true;
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

	const handleSubmit = async (e) => {
		e.preventDefault();
		console.log("Tournament data submitted:", tournamentData);

		// show loading spinner
		const confirmResult = await confirm("Are you sure you want to create this tournament?");
		setLoading(true);
		if (confirmResult) {
			const response = await createTournament(tournamentData);
			// console.log("Tournament creation response:", response);
			if (response.success) {
				// hide loading spinner
				// show success message
				showMessage("Tournament created successfully!", "success");
				goBack();
			} else {
				// hide loading spinner
				// show error message
				showMessage("Failed to create tournament. Please try again later", "error");
			}
		}
		setLoading(false);
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
			setTournamentData({
				...tournamentData,
				teams: updatedList,
			});
			return updatedList;
		});
	};

	const handleCollectionPopup = (action) => {
		setOpenCollectionPopup(action === "open");
	};

	const handleCollectionSubmit = (collectionName, collectionId) => {
		let newCollection = document.createElement("option");
		newCollection.value = collectionId;
		newCollection.innerHTML = collectionName;
		document.getElementById("tournamentCollection").appendChild(newCollection);
		setTournamentData({
			...tournamentData,
			tournamentCollection: collectionName,
		});
	};

	return (
		<div className="create-tournament">
			{loading && <LoadingScreen />}
			{openCollectionPopup && <CollectionPopup onClose={handleCollectionPopup} onSubmit={handleCollectionSubmit} />}
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
							<label htmlFor="tournamentCollection">
								Collection <Tooltip message={tooltips.collections} />
							</label>

							<select id="tournamentCollection" onChange={handleChange} value={tournamentData.tournamentCollection}>
								{collectionOptions.map((option) => {
									return (
										<option key={option.id} value={option.id}>
											{option.name}
										</option>
									);
								})}
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
										<option value={12}>Round of 24</option>
										<option value={8}>Round of 16</option>
										<option value={6}>Round of 12</option>
										<option value={4}>Quarterfinals</option>
										<option value={2}>Semifinals</option>
										<option value={1}>Finals</option>
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
										You can change the names of the teams here in this list, however the names will be final once you
										create the tournament. <br />
										You <strong>cannot</strong> change the number of teams or the team names after you create the
										tournament. <br />
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

function CollectionPopup({ onClose, onSubmit }) {
	const [collection, setCollection] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const { showMessage } = useMessage();

	const handleSubmit = async (e) => {
		e.preventDefault();
		setIsLoading(true);
		const response = await createCollection(collection);
		if (!response.success) {
			setIsLoading(false);
			showMessage("Failed to create collection", "error");
			return;
		}
		onSubmit(collection, response.message);
		setIsLoading(false);
		onClose("close");
	};

	const handleChange = (e) => {
		setCollection(e.target.value);
	};

	return (
		<div className="collection-popup">
			<div className="collection-popup-content">
				<div className="close-btn" id="closeCollectionPopup" onClick={() => onClose("close")}>
					&times;
				</div>
				<h2>Collection</h2>
				<p>Here you can create a collection for your tournaments.</p>
				<form id="collectionForm" className="collection-form" onSubmit={handleSubmit}>
					<div className="form-group">
						<label htmlFor="collectionName">Collection Name*</label>
						<input type="text" id="collectionName" value={collection} onChange={handleChange} required />
					</div>
					<button type="submit" className="collection-button">
						{isLoading ? (
							<div className="loading-spinner">
								<div className="spinner"></div>
							</div>
						) : (
							"Create Collection"
						)}
					</button>
				</form>
			</div>
		</div>
	);
}

export function TeamNameChangePopup({ onClose, onSubmit, currName, rank }) {
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
