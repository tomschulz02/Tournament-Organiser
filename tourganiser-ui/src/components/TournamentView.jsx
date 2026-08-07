import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import {
	DivisionOverviewTab,
	ScheduleTab,
	StandingsTab,
	TeamsTab,
	TournamentOverviewTab,
} from './ViewTabs';
import Icon from './Icons';

const DIVISION_TABS = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'schedule', label: 'Fixtures & Schedule' },
	{ id: 'standings', label: 'Standings' },
	{ id: 'teams', label: 'Teams' },
];

export default function TournamentView({ tournament }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const location = useLocation();

	const tournamentMessage = tournament?.message || {};
	const tournamentDetails = tournamentMessage.tournament || {};
	const dashboard = tournamentMessage.dashboard || {};
	const divisions = Array.isArray(tournamentMessage.divisions) ? tournamentMessage.divisions : [];

	const selectedDivisionId = searchParams.get('division') || '';
	const selectedDivision = divisions.find((division) => division.id === selectedDivisionId) || null;
	const currentTab = selectedDivision ? searchParams.get('tab') || 'overview' : 'overview';

	const handleTabChange = (tab) => {
		if (!selectedDivision) return;
		setSearchParams({ division: selectedDivision.id, tab });
	};

	const handleDivisionChange = (event) => {
		const nextDivisionId = event.target.value;

		if (!nextDivisionId) {
			setSearchParams({});
			return;
		}

		setSearchParams({ division: nextDivisionId, tab: 'overview' });
	};

	const handleSelectDivision = (divisionId) => {
		setSearchParams({ division: divisionId, tab: 'overview' });
	};

	const handleGoBack = () => {
		if (location.state?.from) {
			navigate(location.state.from, { replace: true });
			return;
		}

		navigate('/tournaments', { replace: true });
	};

	return (
		<div className="tournament-view-shell">
			<div className="tournament-view-topbar">
				<div className="tournament-view-topbar-main">
					<button type="button" onClick={handleGoBack} className="tournament-view-back-button">
						<Icon name="leftChevron" />
						<span>Browse</span>
					</button>
					<div className="tournament-view-topbar-copy">
						<div className={`tournament-view-status-pill ${statusClassName(tournamentDetails.status)}`}>
							{tournamentDetails.status || 'Not Started'}
						</div>
						<h1>{tournamentDetails.name || 'Tournament'}</h1>
						<p>
							{selectedDivision
								? `${selectedDivision.name} division dashboard`
								: 'Tournament dashboard with quick division overviews'}
						</p>
					</div>
				</div>
				<div className="tournament-view-topbar-meta">
					<div className="tournament-view-topbar-meta-item">
						<span>{divisions.length}</span>
						<small>Division{divisions.length === 1 ? '' : 's'}</small>
					</div>
					<div className="tournament-view-topbar-meta-item">
						<span>{dashboard.totalTeams || 0}</span>
						<small>Teams</small>
					</div>
					{tournament.creator && (
						<div className="tournament-view-topbar-meta-item tournament-view-topbar-meta-item--creator">
							<span>Admin</span>
							<small>Creator</small>
						</div>
					)}
				</div>
			</div>

			<div className="tournament-view-toolbar">
				<div className="tournament-view-toolbar-field">
					<label htmlFor="divisionViewSelect">View</label>
					<select
						id="divisionViewSelect"
						className="tournament-view-selector"
						value={selectedDivision?.id || ''}
						onChange={handleDivisionChange}>
						<option value="">Tournament overview</option>
						{divisions.map((division) => (
							<option key={division.id} value={division.id}>
								{division.name}
							</option>
						))}
					</select>
				</div>

				{selectedDivision && (
					<div className="tournament-view-nav tournament-view-nav--division">
						{DIVISION_TABS.map((tab) => (
							<button
								key={tab.id}
								type="button"
								className={`tournament-view-nav-item ${currentTab === tab.id ? 'active' : ''}`}
								onClick={() => handleTabChange(tab.id)}>
								{tab.label}
							</button>
						))}
					</div>
				)}
			</div>

			<div className="tournament-view-content tournament-view-content--new">
				{selectedDivision ? (
					<>
						{currentTab === 'overview' && (
							<DivisionOverviewTab division={selectedDivision} tournament={tournamentDetails} />
						)}
						{currentTab === 'schedule' && (
							<ScheduleTab
								division={selectedDivision}
								creator={tournament.creator}
								tournamentName={tournamentDetails.name}
								tournamentDetails={tournamentDetails}
							/>
						)}
						{currentTab === 'standings' && (
							<StandingsTab
								standings={selectedDivision.standings}
								bracket={selectedDivision.bracket}
								finalStandings={selectedDivision.finalStandings}
								currentRound={selectedDivision.state?.currentRound || 0}
							/>
						)}
						{currentTab === 'teams' && (
							<TeamsTab teams={selectedDivision.teams} divisionName={selectedDivision.name} />
						)}
					</>
				) : (
					<TournamentOverviewTab
						tournament={tournamentDetails}
						dashboard={dashboard}
						divisions={divisions}
						onSelectDivision={handleSelectDivision}
					/>
				)}
			</div>
		</div>
	);
}

function statusClassName(status) {
	return (status || 'not-started').toLowerCase().replace(/\s+/g, '-');
}
