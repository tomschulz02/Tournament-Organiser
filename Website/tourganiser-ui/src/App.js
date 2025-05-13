import "./App.css";
import { Outlet, Link } from "react-router-dom";
import React from "react";
import { useState, useEffect, useContext } from "react";
import { AuthContext } from "./AuthContext";
import { MessagePopup, useMessage } from "./MessageContext";
import { logoutUser } from "./requests";

export default function App({ username, setUsername }) {
	const { isLoggedIn, setIsLoggedIn } = useContext(AuthContext);
	return (
		<>
			<Header loggedIn={isLoggedIn} setLoggedIn={setIsLoggedIn} username={username} setUsername={setUsername} />
			<main id="app">
				<Outlet />
			</main>
			<Footer />
			<MessagePopup />
		</>
	);
}

function Header({ loggedIn, setLoggedIn, username, setUsername }) {
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
			{
				<Profile
					isOpen={profileOpen}
					onClose={() => setProfileOpen(false)}
					loggedIn={loggedIn}
					logout={setLoggedIn}
					username={username}
					setUsername={setUsername}
				/>
			}
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
						<a href="https://discord.gg/jwq963ugYR" target="_blank" rel="noreferror">
							<i className="fab fa-discord"></i> Discord
						</a>
						<a href="https://github.com/tomschulz02/Tournament-Organiser" target="_blank" rel="noreferrer">
							<i className="fab fa-github"></i> GitHub
						</a>
					</div>
				</div>
				<div className="footer-section">
					<h4>Contact</h4>
					<p>Email: support@tourganiser.co.za</p>
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

function Profile({ isOpen, onClose, loggedIn, logout, username, setUsername }) {
	const { showMessage } = useMessage();

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

	const handleLogout = async (e) => {
		e.preventDefault();
		try {
			const response = await logoutUser();
			if (response.success) {
				logout(false);
				showMessage("Successfully logged out!", "success");
				setUsername("Guest");
			} else {
				showMessage("Logout failed. Please try again.", "error");
			}
		} catch (error) {
			showMessage(`Error logging out: ${error}`, "error");
		}

		onClose();
	};

	return (
		<div id="profileTab" className="profile-tab">
			<button className="profile-close-btn" onClick={onClose}>
				&times;
			</button>
			<div className="profile-content">
				<h2>Profile - {username !== "" ? username : "Guest"}</h2>
				<div className="profile-item no-hover"></div>
				<div className="profile-item">
					<h4>My Tournament</h4>
				</div>
				<div className="profile-item">
					<h4>Friends</h4>
				</div>
				<div className="profile-actions">
					<div className="profile-actions-settings"></div>
					{!loggedIn ? (
						<Link to={"/login"} className="profile-actions-item" id="gotoLogin">
							Login
						</Link>
					) : (
						<div className="profile-actions-item" id="logout" onClick={handleLogout}>
							<i className="fas fa-sign-out-alt" title="Logout"></i>
						</div>
					)}
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
