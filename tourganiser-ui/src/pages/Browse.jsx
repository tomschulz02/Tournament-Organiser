import { useEffect, useState } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { useMessage } from '../MessageContext';
import { getTournaments } from '../requests';
import LoadingScreen from '../components/LoadingScreen';
import '../App.css';
import Icon from '../components/Icons';
import TournamentPattern from '../components/TournamentPattern';
import { tournamentAccentStyle } from '../utils/tournamentIdentity';

const TOURNAMENT_GROUPS = [
	{ key: 'ongoing', label: 'Ongoing', emptyMessage: 'There are currently no ongoing tournaments' },
	{ key: 'upcoming', label: 'Upcoming', emptyMessage: 'There are currently no upcoming tournaments' },
	{ key: 'completed', label: 'Completed', emptyMessage: 'There are currently no completed tournaments' },
];

const EMPTY_TOURNAMENT_GROUPS = {
	ongoing: [],
	upcoming: [],
	completed: [],
};

function normaliseTournamentGroups(groups) {
	const normalisedGroups = {};

	for (const { key } of TOURNAMENT_GROUPS) {
		normalisedGroups[key] = Array.isArray(groups?.[key]) ? groups[key] : [];
	}

	return normalisedGroups;
}

function getTournamentFormat(details) {
	return details.type || details.format || details.classification || '';
}

function formatTournamentType(type) {
	if (!type) {
		return '';
	}

	return type
		.split(/[_-\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(' ');
}

function getTournamentStatus(details) {
	return details.status || '';
}

function getTournamentStatusVariant(details) {
	const status = getTournamentStatus(details).toLowerCase();

	if (status === 'ongoing') {
		return 'ongoing';
	}

	if (status === 'finished' || status === 'completed') {
		return 'completed';
	}

	return 'upcoming';
}

function formatTournamentDate(value) {
	if (!value) {
		return '';
	}

	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const [year, month, day] = value.split('-').map(Number);
		const utcDate = new Date(Date.UTC(year, month - 1, day));
		return new Intl.DateTimeFormat('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC',
		}).format(utcDate);
	}

	const parsedDate = new Date(value);
	if (!Number.isNaN(parsedDate.getTime())) {
		return new Intl.DateTimeFormat('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		}).format(parsedDate);
	}

	return value;
}

function getTournamentDateRange(details) {
	const startDate = formatTournamentDate(details.start_date || details.startDate || details.date || '');
	const endDate = formatTournamentDate(details.end_date || details.endDate || '');

	return {
		startDate,
		endDate,
	};
}

// Browsing only. Creation moved to its own route, /tournaments/create — it was
// never a tab of this page in anything but layout, and switching to it on a URL
// hash meant the browser's own history and the post-creation redirect disagreed
// about where the user was.
export default function Browse() {
	return (
		<div className="tournament-tabs-container">
			<div className="tournament-tab-content active">
				<BrowseTournaments />
			</div>
		</div>
	);
}

function BrowseTournaments() {
	const [tournaments, setTournaments] = useState(EMPTY_TOURNAMENT_GROUPS);
	const [expandedGroups, setExpandedGroups] = useState({
		ongoing: true,
		upcoming: true,
		completed: true,
	});
	const [isLoading, setIsLoading] = useState(true);
	const { showMessage } = useMessage();
	const [filter, setFilter] = useState({
		format: 'all',
		search: '',
	});
	const { id } = useParams();
	const navigate = useNavigate();

	const filteredTournamentGroups = TOURNAMENT_GROUPS.map(({ key, label, emptyMessage }) => ({
		key,
		label,
		emptyMessage,
		tournaments: tournaments[key].filter((tournament) => {
			const tournamentFormat = getTournamentFormat(tournament).toLowerCase();
			const tournamentName = `${tournament.name || ''}`.toLowerCase();

			if (filter.format !== 'all' && !tournamentFormat.includes(filter.format)) {
				return false;
			}
			if (filter.search && !tournamentName.includes(filter.search.toLowerCase())) {
				return false;
			}
			return true;
		}),
	}));

	// Refetched every time the list comes back on screen, not once per mount.
	//
	// This component renders the Outlet that holds the tournament view, so it
	// stays mounted the whole time a tournament is open and coming back to the
	// list is not a remount. A one-shot guard therefore left the list showing
	// whatever it held on first load — a tournament started, finished or deleted
	// in the view still appeared under its original status.
	useEffect(() => {
		// The list is only on screen when no tournament is open.
		if (id) return;

		let active = true;

		const fetchTournaments = async () => {
			try {
				const response = await getTournaments();

				if (active) setTournaments(normaliseTournamentGroups(response?.data));
			} catch (error) {
				if (!active) return;

				setTournaments(EMPTY_TOURNAMENT_GROUPS);
				showMessage(error.message, 'error');
			} finally {
				if (active) setIsLoading(false);
			}
		};

		fetchTournaments();

		// A slower request must not overwrite a newer one's result.
		return () => {
			active = false;
		};
	}, [id, showMessage]);

	const handlefilterChange = (e) => {
		if (e.target.id === 'searchTournaments') {
			setFilter((prev) => ({ ...prev, search: e.target.value }));
		} else if (e.target.id === 'filterFormat') {
			setFilter((prev) => ({ ...prev, format: e.target.value }));
		}
	};

	const toggleGroup = (groupKey) => {
		setExpandedGroups((prev) => ({
			...prev,
			[groupKey]: !prev[groupKey],
		}));
	};

	return (
		<>
			{/* The list's loading state, so it cannot overlay the tournament
			    view — the fetch above is skipped entirely while one is open. */}
			{isLoading && !id && <LoadingScreen />}
			{id ? (
				<Outlet />
			) : (
				<div className="browse-tournaments">
					<Outlet />
					<div className="search-section" id="tournamentsSearch">
						<input
							type="text"
							id="searchTournaments"
							value={filter.search}
							onChange={handlefilterChange}
							placeholder="Search tournaments..."
						/>
						{/* <select id="filterFormat" value={filter.format} onChange={handlefilterChange}>
							<option value="all">All</option>
							<option value="beach">Beach Tournaments</option>
							<option value="indoor">Indoor Tournaments</option>
						</select> */}
					</div>
					<div className="browse-groups" id="tournamentsGrid">
						{filteredTournamentGroups.map(({ key, label, emptyMessage, tournaments }) => (
							<div key={key} className="browse-group">
								<button
									type="button"
									className={`browse-group-header ${expandedGroups[key] ? 'expanded' : ''}`}
									aria-expanded={expandedGroups[key]}
									aria-controls={`browse-group-${key}`}
									onClick={() => toggleGroup(key)}>
									<div className="browse-group-heading">
										<h3>{label}</h3>
										<span className="browse-group-count">{tournaments.length}</span>
									</div>
									<svg
										className="expand-icon"
										xmlns="http://www.w3.org/2000/svg"
										height="24"
										viewBox="0 -960 960 960"
										width="24">
										<path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
									</svg>
								</button>
								<div
									id={`browse-group-${key}`}
									className={`browse-group-content ${expandedGroups[key] ? 'expanded' : ''}`}>
									<div className="tournaments-grid browse-group-grid">
										{tournaments.length > 0 ? (
											tournaments.map((tournament) => (
												<TournamentCard
													key={tournament.id}
													details={tournament}
													action={() => navigate(`/tournaments/view/${tournament.id}`)}
												/>
											))
										) : (
											<div className="browse-group-empty-message">{emptyMessage}</div>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</>
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
					<div className="name-change-form-inputs">
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
					</div>
					<button type="submit" className="name-change-button">
						Save Changes
					</button>
				</form>
			</div>
		</div>
	);
}

export function TournamentCard({ details, action }) {
	const tournamentStatus = getTournamentStatus(details);
	const tournamentType = formatTournamentType(getTournamentFormat(details));
	const { startDate, endDate } = getTournamentDateRange(details);
	const location = details.location || 'Location to be confirmed';
	const statusVariant = getTournamentStatusVariant(details);

	return (
		<button
			type="button"
			className={`tournament-card tournament-card-${statusVariant}`}
			style={tournamentAccentStyle(details.id)}
			onClick={action}>
			<div className="tournament-card-identity" aria-hidden="true">
				<TournamentPattern tournamentId={details.id} />
			</div>
			<div className="tournament-card-accent" aria-hidden="true" />
			{/* .tournament-card-body itself stays transparent — it is the frame that
			    keeps the pattern always visible around the edges of the card, not
			    just on hover. The text lives in .tournament-card-content, which has
			    its own near-opaque backing (white in light mode, grey in dark, via
			    --background-color) so the pattern never fights readability. */}
			<div className="tournament-card-body">
				<div className="tournament-card-content">
					<div className="tournament-card-topline">
						<div className="tournament-card-name">{details.name}</div>
						{tournamentStatus && <div className={`tournament-card-status ${statusVariant}`}>{tournamentStatus}</div>}
					</div>
					<div className="tournament-card-subline">
						{tournamentType ? (
							<div className="tournament-card-type">
								<Icon name={'structure'} className="tournament-card-meta-icon" size={18} />
								<span>{tournamentType}</span>
							</div>
						) : (
							<div className="tournament-card-type tournament-card-type-empty">Tournament</div>
						)}
					</div>
					<div className="tournament-card-meta">
						<div className="tournament-card-location">
							<Icon name={'location'} className="tournament-card-meta-icon" size={18} />
							<span>{location}</span>
						</div>
					</div>
					<div className="tournament-card-dates">
						<div className="tournament-card-date">
							<Icon name={'calendar'} className="tournament-card-meta-icon" size={18} />
							<span>{startDate ? `Starts: ${startDate}` : 'Start date to be confirmed'}</span>
						</div>
						<div className="tournament-card-date">
							<Icon name={'calendar'} className="tournament-card-meta-icon" size={18} />
							<span>{endDate ? `Ends: ${endDate}` : 'End date to be confirmed'}</span>
						</div>
					</div>
				</div>
			</div>
			<Icon name={'arrowRight'} className="tournament-card-action" label={`View ${details.name}`} />
		</button>
	);
}
