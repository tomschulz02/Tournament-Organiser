import "./App.css";
import { Outlet, Link } from "react-router-dom";
import React from "react";
import { useState, useEffect } from "react";
// import { useEffect } from "react";

export default function App() {
	return (
		<>
			<Header />
			<main id="app">
				<Outlet />
			</main>
			<Footer />
		</>
	);
}

function Header() {
	const [profileOpen, setProfileOpen] = useState(false);

	return (
		<>
			<header id="header">
				<h1>Tourganiser</h1>
				<nav>
					<ul>
						<Link to="/" className="nav-links">
							Home
						</Link>
						<Link to="/tournaments" className="nav-links">
							Tournaments
						</Link>
						<Link to="/about" className="nav-links">
							About
						</Link>
						<span onClick={() => setProfileOpen(true)} className="nav-links">
							Profile
						</span>
					</ul>
				</nav>
			</header>
			{<Profile isOpen={profileOpen} onClose={() => setProfileOpen(false)} />}
		</>
	);
}

function Footer() {
	return (
		<footer id="footer" className="site-footer">
			<div className="footer-content">
				<div className="footer-section">
					<h4>Quick Links</h4>
					<nav>
						<Link to="/" className="nav-links">
							Home
						</Link>
						<Link to="/tournaments" className="nav-links">
							Tournaments
						</Link>
						<Link to="/about" className="nav-links">
							About
						</Link>
					</nav>
				</div>
				<div className="footer-section">
					<h4>Connect With Us</h4>
					<div className="social-links">
						<a href="/" target="_blank" rel="noreferror">
							<i className="fab fa-discord"></i> Discord
						</a>
						<a href="https://github.com/tomschulz02/Tournament-Organiser" target="_blank" rel="noreferrer">
							<i className="fab fa-github"></i> GitHub
						</a>
					</div>
				</div>
				<div className="footer-section">
					<h4>Contact</h4>
					<p>Email: info@tourganiser.com</p>
					<p>Support: support@tourganiser.com</p>
				</div>
			</div>
			<div className="footer-bottom">
				<p>&copy; 2024 Tourganiser. All rights reserved.</p>
				<div className="legal-links">
					<a href="/">Privacy Policy</a>
					<a href="/">Terms of Service</a>
				</div>
			</div>
		</footer>
	);
}

function Profile({ isOpen, onClose }) {
	useEffect(() => {
		const profileTab = document.getElementById("profileTab");
		if (isOpen) {
			profileTab.style.display = "flex";
			profileTab.classList.remove("closing");
		} else {
			profileTab.classList.add("closing");
			setTimeout(() => {
				profileTab.style.display = "none";
				profileTab.classList.remove("closing");
			}, 280);
		}
	}, [isOpen]);

	return (
		<div id="profileTab" className="profile-tab">
			<button className="profile-close-btn" onClick={onClose}>
				&times;
			</button>
			<div className="profile-content">
				<h2>Profile - Username</h2>
				<div className="profile-item no-hover"></div>
				<div className="profile-item">
					<h4>My Tournament</h4>
				</div>
				<div className="profile-item">
					<h4>Friends</h4>
				</div>
				<div className="profile-actions">
					<div className="profile-actions-settings"></div>
					<div className="profile-actions-item" id="gotoLogin">
						Login
					</div>
					<div className="profile-actions-item" id="logout">
						Logout
					</div>
				</div>
			</div>
		</div>
	);
}

window.addEventListener("scroll", () => {
	const header = document.querySelector("header");
	if (window.scrollY > 25) {
		header.classList.add("scrolled");
	} else {
		header.classList.remove("scrolled");
	}
});
