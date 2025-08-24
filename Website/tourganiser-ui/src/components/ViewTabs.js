import { useEffect, useState } from 'react';
import Icon from './Icons';

export function OverviewTab({ details, loggedIn, creator }) {
	let actions = [];
	if (creator) {
		actions.push(<div>Start</div>, <div>Delete</div>);
	} else {
		if (loggedIn) {
			actions.push(<div>Save</div>);
		}
	}

	return (
		<>
			<div className="overview-tab-content">
				<div className="overview-tab-details">
					<div className="overview-tab-details-title">{details.name}</div>
					<div className="overview-tab-details-description">{details.description}</div>
					<div className="overview-tab-details-tags">
						<div className="overview-tab-details-tag">
							<Icon name={'progress'} className="overview-tab-details-tag-icon" />
							{details.status}
						</div>
						<div className="overview-tab-details-tag">
							<Icon name={'calendar'} className="overview-tab-details-tag-icon" />
							{details.startDate}
						</div>
						<div className="overview-tab-details-tag">
							<Icon name={'location'} className="overview-tab-details-tag-icon" />
							{details.location}
						</div>
						<div className="overview-tab-details-tag">
							<Icon name={'structure'} className="overview-tab-details-tag-icon" />
							{details.format}
						</div>
					</div>
					<div className="overview-tab-details-actions">{actions}</div>
				</div>
				{/* <div className="overview-tab-links"></div> */}
				<div className="overview-tab-fixtures">
					<h2>Upcoming Fixtures</h2>
					<div className="overview-tab-fixtures-scroll">
						{details.upcomingFixtures.map((fixture) => {
							return <FixtureCard fixture={fixture} />;
						})}
					</div>
				</div>
				<div className="overview-tab-fixtures">
					<h2>Recent Results</h2>
					<div className="overview-tab-fixtures-scroll">
						{details.results.map((fixture) => {
							return <FixtureCard fixture={fixture} />;
						})}
					</div>
				</div>
			</div>
		</>
	);
}

export function ScheduleTab({ fixtures, creator }) {
	const [filter, setFilter] = useState('all');
	const allFixtures = [];
	let filteredFixtures;
	allFixtures.push(...fixtures.remainingFixtures, ...fixtures.results);

	useEffect(() => {
		if (filter === 'all') {
			filteredFixtures = allFixtures;
		} else if (filter === 'upcoming') {
			filteredFixtures = allFixtures.filter();
		}
	}, [filter]);

	return (
		<>
			<div className="schedule-tab">
				<div className="schedule-tab-header">
					<h2>Schedule</h2>
					<div className="schedule-tab-content-filters">
						<div
							className={`schedule-tab-content-filter ${filter === 'all' ? 'active' : ''}`}
							onClick={() => {
								setFilter('all');
							}}>
							All
						</div>
						<div
							className={`schedule-tab-content-filter ${filter === 'upcoming' ? 'active' : ''}`}
							onClick={() => {
								setFilter('upcoming');
							}}>
							Upcoming
						</div>
						<div
							className={`schedule-tab-content-filter ${filter === 'live' ? 'active' : ''}`}
							onClick={() => {
								setFilter('live');
							}}>
							Live
						</div>
						<div
							className={`schedule-tab-content-filter ${filter === 'done' ? 'active' : ''}`}
							onClick={() => {
								setFilter('done');
							}}>
							Results
						</div>
					</div>
				</div>
				<div className="schedule-tab-content">
					{filteredFixtures.map((fixture) => {
						return <FixtureCard fixture={fixture} />;
					})}
				</div>
			</div>
		</>
	);
}

function FixtureCard({ fixture, actions = [] }) {
	let cols = '1fr';
	let sets = { 1: [], 2: [] };
	if (fixture.result) {
		for (let set of fixture.result) {
			cols += ' 25px';
			sets[1].push(<div>{set[0]}</div>);
			sets[2].push(<div>{set[1]}</div>);
		}
	}

	return (
		<div className="fixture-card" key={fixture.id}>
			<div className="fixture-card-header">
				<div className="fixture-card-header-round">{fixture.round}</div>
				<div className="fixture-card-header-match">Match #{fixture.match_no}</div>
			</div>
			<div className="fixture-card-content">
				<div className="fixture-card-content-team" style={{ gridTemplateColumns: cols }}>
					<div>{fixture.team1}</div>
					{sets[1]}
				</div>
				<div className="fixture-card-content-team" style={{ gridTemplateColumns: cols }}>
					<div>{fixture.team2}</div>
					{sets[2]}
				</div>
			</div>
			{actions.length > 0 && <div className="fixture-card-actions">&#8942;</div>}
		</div>
	);
}
