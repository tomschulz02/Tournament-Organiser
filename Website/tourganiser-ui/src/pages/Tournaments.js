import React, { useEffect, useState, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { useMessage } from '../MessageContext';
import { getTournaments, createCollection, createTournament, fetchUserCollections } from '../requests';
import Tooltip from '../components/Tooltip';
import { useConfirm } from '../components/ConfirmDialog';
import LoadingScreen from '../components/LoadingScreen';
import '../App.css';
import TournamentCreation from '../components/TournamentCreation';

const tooltips = {
	collections:
		'You can group tournaments in collections so that they can be viewed together. Tournaments that are part of a collection will not be displayed on the browse page, but rather in the view page of the collection it belongs to.',
};

export default function Tournaments() {
	const [currentPage, setCurrentPage] = useState('browse');

	useEffect(() => {
		const section = window.location.hash.replace('#', '');
		if (section) {
			setCurrentPage(section);

			window.history.replaceState(null, '', window.location.pathname + window.location.search);
		}
	}, []);

	return (
		<div className="tournament-tabs-container">
			<div className="tournament-tab-buttons">
				<div
					className={`tournament-tab-btn ${currentPage === 'browse' ? 'active' : ''}`}
					data-tab="browse"
					onClick={() => setCurrentPage('browse')}>
					Browse Tournaments
				</div>
				<div
					className={`tournament-tab-btn ${currentPage === 'create' ? 'active' : ''}`}
					data-tab="create"
					onClick={() => setCurrentPage('create')}>
					Create Tournament
				</div>
			</div>
			<div className="tournament-tab-content active">
				{currentPage === 'browse' ? <BrowseTournaments /> : <TournamentCreation />}
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
		format: 'all',
		search: '',
	});

	const filteredTournaments = tournaments.filter((tournament) => {
		if (filter.format !== 'all' && tournament.type !== filter.format) {
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
				} else {
					setTournaments([]);
				}
			} catch (error) {
				showMessage('Error fetching tournaments', 'error');
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
		if (e.target.id === 'searchTournaments') {
			setFilter((prev) => ({ ...prev, search: e.target.value }));
		} else if (e.target.id === 'filterFormat') {
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
						if (tournament.classification === 'tournament') {
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
						} else if (tournament.classification === 'collection') {
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
			</div>
		</div>
	);
}

export function TeamNameChangePopup({ onClose, onSubmit, currName, rank }) {
	const { showMessage } = useMessage();
	const handleSubmit = (e) => {
		e.preventDefault();
		const newName = document.getElementById('newTeamName').value;
		if (newName === '') {
			document.getElementById('newTeamName').classList.add('error');
			return;
		}
		if (newName === 'TBD') {
			showMessage("Team name cannot be 'TBD'", 'error');
			return;
		}
		document.getElementById('newTeamName').classList.remove('error');

		if (!onSubmit(e, rank, newName)) {
			showMessage('Team name already exists', 'error');
			return;
		}
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
