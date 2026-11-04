import { useEffect, useState } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { useMessage } from '../MessageContext';
import { useHelpTopic } from '../HelpContext';
import { getTournaments } from '../requests';
import LoadingScreen from '../components/LoadingScreen';
import '../App.css';
import Icon from '../components/Icons';
import TournamentPattern from '../components/TournamentPattern';
import { tournamentAccentStyle } from '../utils/tournamentIdentity';
import { formatStartCountdown, getDateTile } from '../utils/tournamentDates';

const UNDATED_TILE = { month: 'Date', day: 'TBC', year: '', isRange: true, spansMonths: false };

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

// The status as the card says it: "Not started" rather than the stored "Not Started".
function formatStatusLabel(status) {
	return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

// Browsing only. Creation moved to its own route, /tournaments/create — it was
// never a tab of this page in anything but layout, and switching to it on a URL
// hash meant the browser's own history and the post-creation redirect disagreed
// about where the user was.
export default function Browse() {
	useHelpTopic('browse');

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
			{isLoading && !id && <LoadingScreen context="pageLoad" />}
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

export function TournamentCard({ details, action, onRemove, roleName }) {
	const tournamentStatus = getTournamentStatus(details);
	const startDate = details.start_date || details.startDate || details.date || '';
	const endDate = details.end_date || details.endDate || '';
	const tile = getDateTile(startDate, endDate) ?? UNDATED_TILE;
	const location = details.location || 'Location to be confirmed';
	const statusVariant = getTournamentStatusVariant(details);
	const countdown = statusVariant === 'upcoming' ? formatStartCountdown(startDate) : '';

	const handleRemove = (e) => {
		e.stopPropagation();
		onRemove();
	};

	return (
		<button
			type="button"
			className="tournament-card"
			style={tournamentAccentStyle(details.id)}
			onClick={action}>
			{/* The date is what tells two tournaments apart at a glance, so it leads,
			    on the tournament's own colour and pattern. A grid item, so it always
			    fills the card's height however the text beside it wraps. */}
			<div className="tournament-card-tile">
				<TournamentPattern tournamentId={details.id} />
				<div className={`tournament-card-month${tile.spansMonths ? ' spans-months' : ''}`}>{tile.month}</div>
				<div className={`tournament-card-day${tile.isRange ? ' is-range' : ''}`}>{tile.day}</div>
				{tile.year && <div className="tournament-card-year">{tile.year}</div>}
			</div>
			<div className={`tournament-card-body${onRemove ? ' has-remove' : ''}`}>
				{onRemove && (
					<button
						type="button"
						className="tournament-card-remove"
						onClick={handleRemove}
						aria-label="Remove from saved tournaments">
						<Icon name={'delete'} size={16} fill='var(--error-color)' />
					</button>
				)}
				<div className="tournament-card-name">{details.name}</div>
				<div className="tournament-card-meta">
					<Icon name={'location'} className="tournament-card-meta-icon" size={18} />
					<span>{location}</span>
				</div>
				{roleName && (
					<div className="tournament-card-meta">
						<Icon name={'teams'} className="tournament-card-meta-icon" size={18} />
						<span>{roleName}</span>
					</div>
				)}
				{/* Kept even inside a status group: Profile reuses this card in lists
				    that mix statuses. */}
				{tournamentStatus && (
					<div className="tournament-card-status">
						<span className={`tournament-card-status-dot ${statusVariant}`} aria-hidden="true" />
						<span>{formatStatusLabel(tournamentStatus)}</span>
						{countdown && <span className="tournament-card-countdown">{countdown}</span>}
					</div>
				)}
			</div>
			<Icon name={'arrowRight'} className="tournament-card-action" label={`View ${details.name}`} />
		</button>
	);
}
