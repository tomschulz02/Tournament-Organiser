import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OverviewTab, ScheduleTab } from './ViewTabs';

export default function TournamentView({ tournament }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const currentTab = searchParams.get('tab') || 'overview';
	const [showHeader, setShowHeader] = useState(true);
	const [lastScrollY, setLastScrollY] = useState(0);

	useEffect(() => {
		const handleScroll = () => {
			const scrollY = window.scrollY;
			if (scrollY > lastScrollY && scrollY > 100) {
				setShowHeader(false);
			} else {
				setShowHeader(true);
			}

			setLastScrollY(scrollY);
		};
		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	}, [lastScrollY]);

	const handleTabChange = (tab) => {
		setSearchParams({ tab });
	};

	console.log(tournament);

	return (
		<div className="tournament-view-section">
			<div className={`tournament-view-header ${showHeader ? 'visible' : 'hidden'}`}>
				<div>{tournament.message.details.name}</div>
			</div>
			<div className={`tournament-view-header-actions ${showHeader ? 'visible' : 'hidden'}`}>
				<div>Back</div>
				<div>Follow</div>
			</div>
			<div className={`tournament-view-nav-border ${showHeader ? 'down' : 'up'}`}>
				<div className={`tournament-view-nav`}>
					<div className="tournament-view-nav-item" onClick={() => handleTabChange('overview')}>
						Overview
					</div>
					<div className="tournament-view-nav-item" onClick={() => handleTabChange('schedule')}>
						Schedule & Results
					</div>
					<div className="tournament-view-nav-item" onClick={() => handleTabChange('standings')}>
						Standings
					</div>
					<div className="tournament-view-nav-item" onClick={() => handleTabChange('teams')}>
						Teams
					</div>
					<div className="tournament-view-nav-item" onClick={() => handleTabChange('settings')}>
						Settings
					</div>
				</div>
			</div>
			<div className={`tournament-view-content`}>
				{currentTab === 'overview' && (
					<OverviewTab
						details={tournament.message.details}
						loggedIn={tournament.loggedIn}
						creator={tournament.creator}
					/>
				)}
				{currentTab === 'schedule' && (
					<ScheduleTab fixtures={tournament.message.fixtures} creator={tournament.creator} />
				)}
				{currentTab === 'standings' && <h2>Standings</h2>}
				{currentTab === 'teams' && <h2>Teams</h2>}
				{currentTab === 'settings' && <h2>Settings</h2>}
			</div>
		</div>
	);
}
