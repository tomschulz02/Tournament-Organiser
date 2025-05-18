import React from "react";
import "../styles/About.css";

export default function About() {
	React.useEffect(() => {
		if (window.location.hash === "#support") {
			const element = document.getElementById("support");
			if (element) {
				element.scrollIntoView({ behavior: "smooth" });
			}
		}
	}, []);

	return (
		<>
			<section className="about-section">
				<h1>About Us</h1>
				<div className="description">
					<p>
						Tourganiser is a tournament organisation and management platform designed to streamline the planning and
						execution of sports tournaments — with a current focus on volleyball. Built for tournament directors,
						coaches, players, and even spectators, Tourganiser simplifies the process of setting up and managing
						competitions from start to finish.
					</p>
					<p>
						What sets Tourganiser apart is its flexibility. Whether you're running a small local event or a multi-day
						competition, the platform allows you to fully customise your tournament format, manage teams, and stay on
						top of match fixtures and results — all in one place.
					</p>
					<p>
						Developed with real-world tournament challenges in mind, Tourganiser aims to take the hassle out of the
						technical side of organising, so you can focus more on the game and less on spreadsheets and scheduling
						headaches.
					</p>
					<p>More sports support is on the horizon — this is just the beginning.</p>
				</div>
			</section>

			<section className="about-section" id="support">
				<h1>Support Us</h1>
				<div className="description">
					<p>
						Tourganiser is free to use for everyone — no subscriptions, no paywalls, and no ads. This decision was made
						to ensure that organisers, coaches, and players can access the tools they need without barriers or
						distractions.
					</p>
					<p>
						If you find value in what Tourganiser offers and would like to support its continued development, you’re
						welcome to contribute through a voluntary donation. Every contribution helps cover hosting costs and enables
						ongoing improvements to the platform — from new features to support for more sports.
					</p>
					<p>Your support is completely optional, but always appreciated.</p>
				</div>
				<div className="donation-container">
					{/* International Option: Buy Me a Coffee */}
					<a
						href="https://buymeacoffee.com/tourganiser"
						target="_blank"
						rel="noopener noreferrer"
						className="coffee-button">
						<img
							src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
							alt="Buy Me A Coffee"
							style={{ height: "60px", width: "217px" }}
						/>
					</a>
				</div>
			</section>

			<section className="contact-section">
				<h2>Contact Information</h2>
				<div className="contact-details">
					<div className="contact-item">
						<h3>Email</h3>
						<p>
							<a href="mailto:support@tourganiser.co.za">support@tourganiser.co.za</a>
						</p>
					</div>
				</div>
			</section>
		</>
	);
}
