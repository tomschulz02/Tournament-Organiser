import './App.css';
import { Outlet, Link } from 'react-router-dom';
import { useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { MessagePopup, useMessage } from './MessageContext';
import { useTheme } from './ThemeContext';
import { logoutUser } from './requests';

export default function App() {
	const { isLoggedIn, setIsLoggedIn } = useContext(AuthContext);
	const [showHelpMenu, setShowHelpMenu] = useState(false);

	useEffect(() => {
		window.addEventListener('scroll', () => {
			const header = document.querySelector('header');
			if (header) {
				if (window.scrollY > 25) {
					header.classList.add('scrolled');
				} else {
					header.classList.remove('scrolled');
				}
			}
		});
	}, []);

	return (
		<>
			<Header loggedIn={isLoggedIn} setLoggedIn={setIsLoggedIn} />
			<main id="app">
				<Outlet />
			</main>
			<Footer />
			<MessagePopup />
			{showHelpMenu && <HelpMenu onClose={() => setShowHelpMenu(false)} />}
			{!showHelpMenu && (
				<div className="help-button" onClick={() => setShowHelpMenu(true)}>
					<i className="fas fa-question-circle"></i>
				</div>
			)}
		</>
	);
}

function Header({ loggedIn, setLoggedIn }) {
	const [profileOpen, setProfileOpen] = useState(false);
	const [openMenu, setOpenMenu] = useState(false);

	useEffect(() => {
		document.body.style.overflow = openMenu ? 'hidden' : 'auto';
	}, [openMenu]);

	return (
		<>
			<header id="header">
				<div className={`menu-button ${openMenu ? 'open' : ''}`} onClick={() => setOpenMenu(!openMenu)}>
					<span />
					<span />
					<span />
				</div>
				<Link to="/" className="website-title" onClick={() => setOpenMenu(false)}>
					Tourganiser
				</Link>
			</header>
			{<MenuBar isOpen={openMenu} onClose={() => setOpenMenu(false)} loggedIn={loggedIn} />}
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

function MenuBar({ isOpen, onClose, loggedIn }) {
	const { theme, toggleTheme } = useTheme();

	const handleClickOutside = (e) => {
		if (e.target.classList.contains('menu-bar')) {
			onClose();
		}
	};

	return (
		<div className={`menu-bar ${isOpen ? 'open' : 'close'}`} onClick={handleClickOutside}>
			<div className={`menu-bar-content`}>
				<div className="menu-section quick-actions">
					<Link to="/" className="menu-item quick-action" onClick={onClose} title="Home">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
							<path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z" />
						</svg>
					</Link>
					<Link to="/about" className="menu-item quick-action" onClick={onClose} title="About Us">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
							<path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
						</svg>
					</Link>
				</div>
				<div className="menu-section">
					<h2>Account</h2>
					{!loggedIn && (
						<Link to="/login" className="menu-item" onClick={onClose}>
							Sign In / Sign Up
						</Link>
					)}
					{/* Change divs to Links once the profile page has been created */}
					{loggedIn && (
						<div className="menu-item" onClick={onClose}>
							Profile
						</div>
					)}
					{loggedIn && (
						<div className="menu-item" onClick={onClose}>
							Friends
						</div>
					)}
					{loggedIn && (
						<div className="menu-item" onClick={onClose}>
							Saved Tournaments
						</div>
					)}
					{loggedIn && (
						<div className="menu-item" onClick={onClose}>
							Logout
						</div>
					)}
				</div>
				<div className="menu-section">
					<h2>Tournaments</h2>
					<Link to="/tournaments#browse" className="menu-item" onClick={onClose}>
						Discover
					</Link>
					<Link to="/tournaments#create" className="menu-item" onClick={onClose}>
						Create
					</Link>
				</div>
				<div className="menu-actions-bar">
					<div className="menu-action">
						{theme === 'light' ? (
							<i
								className="fas fa-sun"
								onClick={toggleTheme}
								title="Switch to Dark Mode"
								style={{ color: '#FFD700' }}></i>
						) : (
							<i
								className="fas fa-moon"
								onClick={toggleTheme}
								title="Switch to Light Mode"
								style={{ color: '#FFD700' }}></i>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function Profile({ isOpen, onClose, loggedIn, logout }) {
	const { showMessage } = useMessage();
	const { username, setUsername } = useContext(AuthContext);

	useEffect(() => {
		const profileTab = document.getElementById('profileTab');
		if (isOpen) {
			profileTab.style.display = 'flex';
			profileTab.classList.remove('closing');
		} else {
			profileTab.classList.add('closing');
			setTimeout(() => {
				profileTab.style.display = 'none';
				profileTab.classList.remove('closing');
			}, 280);
		}
	}, [isOpen]);

	const handleLogout = async (e) => {
		e.preventDefault();
		try {
			const response = await logoutUser();
			if (response.success) {
				logout(false);
				showMessage('Successfully logged out!', 'success');
				setUsername('Guest');
				window.location.reload();
			} else {
				showMessage('Logout failed. Please try again.', 'error');
			}
		} catch (error) {
			showMessage(`Error logging out: ${error}`, 'error');
		}

		onClose();
	};

	return (
		<div id="profileTab" className="profile-tab">
			<button className="profile-close-btn" onClick={onClose}>
				&times;
			</button>
			<div className="profile-content">
				<h2>Profile - {username !== '' ? username : 'Guest'}</h2>
				<div className="profile-item no-hover"></div>
				<div className="profile-item">
					<h4>My Tournaments - Coming soon</h4>
				</div>
				<div className="profile-item">
					<h4>Friends - Coming soon</h4>
				</div>
				<div className="profile-actions">
					<div className="profile-actions-settings"></div>
					{!loggedIn ? (
						<Link to={'/login'} className="profile-actions-item" id="gotoLogin">
							Login
						</Link>
					) : (
						<div className="profile-actions-item" id="logout" onClick={handleLogout}>
							Logout
							<i className="fas fa-sign-out-alt" title="Logout"></i>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function HelpMenu({ onClose }) {
	const handleClickOutside = (e) => {
		if (e.target.classList.contains('help-menu-container')) {
			onClose();
		}
	};

	return (
		<div className="help-menu-container" onClick={handleClickOutside}>
			<div className="help-menu">
				<h1>Help Menu</h1>
				<p>Here you can find help and support for using Tourganiser.</p>
			</div>
		</div>
	);
}
