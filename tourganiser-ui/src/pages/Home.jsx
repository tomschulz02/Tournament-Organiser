import { Link } from 'react-router-dom';
import '../App.css';
import '../styles/home.css';
import { useContext } from 'react';
import { AuthContext } from '../AuthContext';
import { useHelpTopic } from '../HelpContext';

// The drawings show one made-up event, labelled as an example on the page.
const SEEDS = [
	['Net Ninjas', 'Pool A'],
	['Sand Sharks', 'Pool B'],
	['Block Party', 'Pool B'],
	['Ace Hunters', 'Pool A'],
];
const POOLS = [
	['Pool A', ['Net Ninjas', 'Ace Hunters', 'Dig Deep', 'Sky Ballers']],
	['Pool B', ['Sand Sharks', 'Block Party', 'Set Point', 'Side Out']],
];
const COURTS = [
	['Court 1', 'Net Ninjas', 'Sky Ballers'],
	['Court 2', 'Sand Sharks', 'Side Out'],
	['Court 3', 'Ace Hunters', 'Dig Deep'],
];

const STOPS = [
	{
		title: 'Enter your teams',
		text: 'Add a division, type in the teams and set the seeding order. Reorder until the tournament starts.',
		who: 'Organiser',
		drawing: (
			<ul className="hm-sheet">
				{SEEDS.map(([team, pool], index) => (
					<li key={team}>
						<span className="hm-seed">{index + 1}</span>
						{team}
						<span className="hm-pool">{pool}</span>
					</li>
				))}
			</ul>
		),
	},
	{
		title: 'The format builds itself',
		text: 'Pools and knockout rounds are worked out from the team count, with every fixture generated. Choose the pool draw, ranking rules and placement matches.',
		who: 'Organiser',
		drawing: (
			<>
				<div className="hm-court">
					{POOLS.map(([pool, teams]) => (
						<div key={pool}>
							<h3>{pool}</h3>
							<ul>
								{teams.map((team, index) => (
									<li key={team} className={index < 2 ? 'hm-through' : undefined}>
										{team}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
				<p className="hm-note">Underlined teams go through to the semi-finals.</p>
			</>
		),
	},
	{
		title: 'Courts and times',
		text: 'Auto-schedule across your courts and drag what needs to move. Print the schedule and the FIVB scoresheets.',
		who: 'Organiser',
		drawing: (
			<>
				<span className="hm-cap">09:00</span>
				<div className="hm-courts">
					{COURTS.map(([court, home, away]) => (
						<div key={court}>
							{court}
							<div className="hm-mini">
								<span>{home}</span>
								<span>{away}</span>
							</div>
						</div>
					))}
				</div>
			</>
		),
	},
	{
		title: 'Match day',
		text: 'Scorers enter each set courtside. Players, parents and coaches follow on their phones with no account: on court now, up next, standings and the bracket.',
		who: 'Organiser, helpers and everyone at the venue',
		drawing: (
			<>
				<div className="hm-board">
					<div>
						<span className="hm-cap">Court 1 · Set 2 in progress</span>
						<span className="hm-live">Live</span>
					</div>
					<div className="hm-team">
						<span>Net Ninjas</span>
						<b>1</b>
					</div>
					<div className="hm-team">
						<span>Ace Hunters</span>
						<b>0</b>
					</div>
				</div>
				<p className="hm-note">Up next on Court 2 at 11:45: Sand Sharks v Block Party</p>
			</>
		),
	},
	{
		title: 'Final rankings',
		text: 'End the tournament and every team has a place. Export the results pack to share afterwards.',
		who: 'Everyone',
		drawing: (
			<div className="hm-podium">
				<div>
					Sand Sharks<b>2</b>
				</div>
				<div className="hm-first">
					Net Ninjas<b>1</b>
				</div>
				<div className="hm-third">
					Block Party<b>3</b>
				</div>
			</div>
		),
	},
];

export default function Home() {
	const { isLoggedIn } = useContext(AuthContext);
	useHelpTopic('home');
	return (
		<div className="hm">
			<div className="banner-image"></div>

			<section className="hm-wrap hm-intro">
				<h1>Your whole tournament, on one line.</h1>
				<p>Tourganiser builds your tournament from the team list and runs it on the day.</p>
				<div className="hm-doors">
					<Link to={isLoggedIn ? '/tournaments/create' : '/login'} className="hm-btn">
						Run a tournament
					</Link>
					<Link to="/tournaments" className="hm-btn hm-btn-line">
						Find a tournament
					</Link>
				</div>
			</section>

			<section className="hm-wrap">
				<div className="hm-path">
					<div className="hm-lead"></div>
					{STOPS.map((stop, index) => (
						<div key={stop.title} className={index === STOPS.length - 1 ? 'hm-stop hm-stop-last' : 'hm-stop'}>
							<span className="hm-n">{index + 1}</span>
							<div className="hm-copy">
								<h2>{stop.title}</h2>
								<p>{stop.text}</p>
								<p className="hm-who">{stop.who}</p>
							</div>
							<div className="hm-draw">{stop.drawing}</div>
						</div>
					))}
					<div className="hm-tail"></div>
				</div>
			</section>

			<section className="hm-wrap hm-end">
				<div className="hm-circle">
					<h2>Free for everyone</h2>
					<p>No subscriptions, no paywalls, no ads. Funded by voluntary donations.</p>
					<Link to="/about#support">Support Tourganiser</Link>
				</div>
				<p className="hm-example">The teams and scores drawn on this page are an example.</p>
			</section>
		</div>
	);
}
