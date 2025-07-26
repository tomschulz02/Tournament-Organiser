import { Link } from 'react-router-dom';
import '../App.css';
import React, { useContext } from 'react';
import { AuthContext } from '../AuthContext';

export default function Home() {
	const { isLoggedIn } = useContext(AuthContext);
	return (
		<div className="home">
			<div className="banner-image"></div>

			<section id="home">
				<h2>Welcome to Tourganiser</h2>
				<p>
					Tourganiser helps you organise and manage your sports tournaments - no more spreadsheets, no more stress. Keep
					track of fixtures, results and more all in one place.
				</p>
				<p>Get started by browsing through other tournaments, or sign in and create your own.</p>
				<Link to={'/tournaments#browse'} className="cta-button">
					Discover
				</Link>
				{isLoggedIn ? (
					<Link to={'/tournaments#create'} className="cta-button">
						Create
					</Link>
				) : (
					<Link to={'/login'} className="cta-button">
						Sign In
					</Link>
				)}
			</section>

			<section className="donation-banner">
				<div className="banner-content">
					<h3>Support Tourganiser's Development</h3>
					<p>Help us improve and add new features by making a donation</p>
				</div>
				<Link to="/about#support" className="donate-button">
					Make a Donation
				</Link>
			</section>

			<section id="features" className="features-section">
				<h2 className="section-title">Features</h2>
				<div className="features-grid">
					<div className="feature-card">
						<div className="feature-image">
							<img src="/assets/creation.png" alt="tournament creation example image"></img>
						</div>
						<div className="feature-content">
							<h3 className="feature-title">Tournament Creation</h3>
							<p className="feature-description">
								Create and manage tournaments with just a few clicks. Set up brackets, rounds, and schedules
								effortlessly.
							</p>
						</div>
					</div>
					<div className="feature-card">
						<div className="feature-image">
							<img src="/assets/fixtures.png" alt="fixture generation example image"></img>
						</div>
						<div className="feature-content">
							<h3 className="feature-title">Fixture Generation</h3>
							<p className="feature-description">
								Automatically generate all the necessary fixtures for your tournament.
							</p>
						</div>
					</div>
					<div className="feature-card">
						<div className="feature-image">
							<img src="/assets/teams.png" alt="team management example image"></img>
						</div>
						<div className="feature-content">
							<h3 className="feature-title">Team Management</h3>
							<p className="feature-description">Add and manage teams with ease while creating your tournament.</p>
						</div>
					</div>
					<div className="feature-card">
						<div className="feature-image">
							<img src="/assets/format.png" alt="format customisation example image"></img>
						</div>
						<div className="feature-content">
							<h3 className="feature-title">Custom Rules</h3>
							<p className="feature-description">
								Define your own tournament rules and formats. Support for various competition styles and scoring
								systems.
							</p>
						</div>
					</div>
					<div className="feature-card">
						<div className="feature-image">
							<img src="/assets/results.png" alt="result analytics example image"></img>
						</div>
						<div className="feature-content">
							<h3 className="feature-title">Analytics</h3>
							<p className="feature-description">
								Get detailed insights and statistics. Track performance metrics and generate comprehensive reports.
							</p>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
