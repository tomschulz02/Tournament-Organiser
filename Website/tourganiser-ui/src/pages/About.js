import React from "react";
import "../styles/About.css";

export default function About() {
	return (
		<>
			<section className="about-section">
				<h1>About Us</h1>
				<div className="description">
					<p>
						Welcome to Tournament Organiser! We're dedicated to making tournament management simple and efficient for
						organizers and participants alike.
					</p>
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
