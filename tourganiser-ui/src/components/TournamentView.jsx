import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { OverviewTab, ScheduleTab, StandingsTab, TeamsTab } from './ViewTabs';
import Icon from './Icons';

export default function TournamentView({ tournament }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const currentTab = searchParams.get('tab') || 'overview';
	const [showHeader, setShowHeader] = useState(true);
	const [lastScrollY, setLastScrollY] = useState(0);
	const [lastScrollUp, setLastScrollUp] = useState(0);
	const navigate = useNavigate();
	const location = useLocation();

	useEffect(() => {
		const handleScroll = () => {
			const scrollY = window.scrollY;
			if (scrollY > lastScrollY && scrollY > lastScrollUp + 60) {
				setShowHeader(false);
			} else {
				setShowHeader(true);
			}

			if (scrollY < lastScrollY) {
				setLastScrollUp(scrollY);
			}

			setLastScrollY(scrollY);
		};
		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	}, [lastScrollY]);

	// console.log(tournament);

	const tabs = [
		{
			name: 'overview',
			nav: (
				<div
					className={`tournament-view-nav-item ${currentTab === 'overview' ? 'active' : ''}`}
					onClick={() => handleTabChange('overview')}>
					Overview
				</div>
			),
			content: (
				<OverviewTab details={tournament.message.details} loggedIn={tournament.loggedIn} creator={tournament.creator} />
			),
		},
		{
			name: 'schedule',
			nav: (
				<div
					className={`tournament-view-nav-item ${currentTab === 'schedule' ? 'active' : ''}`}
					onClick={() => handleTabChange('schedule')}>
					Schedule & Results
				</div>
			),
			content: (
				<ScheduleTab
					fixtures={tournament.message.fixtures}
					creator={tournament.creator}
					standings={tournament.message.standings}
					id={tournament.message.details.id}
					tournamentName={tournament.message.details.name}
				/>
			),
		},
		{
			name: 'standings',
			nav: (
				<div
					className={`tournament-view-nav-item ${currentTab === 'standings' ? 'active' : ''}`}
					onClick={() => handleTabChange('standings')}>
					Standings
				</div>
			),
			content: (
				<StandingsTab
					standings={tournament.message.standings}
					currentRound={tournament.message.fixtures.currentRound}
					format={tournament.message.details.format}
				/>
			),
		},
		{
			name: 'teams',
			nav: (
				<div
					className={`tournament-view-nav-item ${currentTab === 'teams' ? 'active' : ''}`}
					onClick={() => handleTabChange('teams')}>
					Teams
				</div>
			),
			content: (
				<TeamsTab
					teams={tournament.message.teams}
					tournamentId={tournament.message.details.id}
					status={tournament.message.details.status}
					creator={tournament.creator}
					setPageUnsavedChanges={() => {}}
					onUpdate={() => {}}
				/>
			),
		},
		// {
		// 	name: 'settings',
		// 	nav: (
		// 		<div
		// 			className={`tournament-view-nav-item ${currentTab === 'settings' ? 'active' : ''}`}
		// 			onClick={() => handleTabChange('settings')}>
		// 			Settings
		// 		</div>
		// 	),
		// 	content: <h2>Settings</h2>,
		// },
	];

	const handleTabChange = (tab) => {
		setSearchParams({ tab });
	};

	const handleGoBack = () => {
		if (location.state?.from) {
			navigate(location.state.from, { replace: true });
		} else {
			navigate('/tournaments', { replace: true });
		}
	};

	return (
		<div className="tournament-view-section">
			<div className={`tournament-view-header ${showHeader ? 'visible' : 'hidden'}`}>
				<div>{tournament.message.details.name}</div>
			</div>
			<div className={`tournament-view-header-actions ${showHeader ? 'visible' : 'hidden'}`}>
				<div onClick={handleGoBack} className="tournament-view-header-action">
					<Icon name={'leftChevron'} />
				</div>
				<div>Follow</div>
			</div>
			<div className={`tournament-view-nav-border ${showHeader ? 'down' : 'up'}`}>
				<div className={`tournament-view-nav`}>
					{tabs.map((tab, index) => {
						return <React.Fragment key={index}>{tab.nav}</React.Fragment>;
					})}
				</div>
			</div>
			<div className={`tournament-view-content`}>
				{tabs.map((tab, index) => {
					if (currentTab === tab.name) return <React.Fragment key={index}>{tab.content}</React.Fragment>;
				})}
			</div>
		</div>
	);
}
