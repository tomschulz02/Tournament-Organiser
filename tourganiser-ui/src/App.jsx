import './App.css';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from './AuthContext';
import { useMessage } from './MessageContext';
import { MessagePopup } from './MessageProvider';
import { useTheme } from './ThemeContext';
import { logoutUser } from './requests';
import LoadingScreen from './components/LoadingScreen';
import Icon from './components/Icons';

// Shared by the desktop nav's account control and the mobile Profile sheet —
// the one working account action (Friends and Saved Tournaments are still
// inert everywhere, per the comment that used to sit on MenuBar's version of
// this list).
function useLogout(setLoggedIn) {
	const { showMessage } = useMessage();
	const { setUsername } = useContext(AuthContext);
	const [loading, setLoading] = useState(false);

	const handleLogout = async () => {
		setLoading(true);
		try {
			await logoutUser();
			// Bumps the session version — and drops the cached tournament
			// payloads on the way, inside AuthProvider, which is where login and
			// signup reach the same clear. It is what makes pages holding
			// server-resolved data — the tournament view and its organiser
			// controls — refetch without a reload.
			setLoggedIn(false);
			setUsername('Guest');
			showMessage('Successfully logged out!', 'success');
		} catch (error) {
			showMessage(error.message, 'error');
		} finally {
			setLoading(false);
		}
	};

	return { loading, handleLogout };
}

// Home and Discover mean the same route whichever of two paths reached it
// (Home is also mounted at /home; Discover's own view page nests under
// /tournaments), and Create — a sibling route that happens to start with the
// same segment — must not read as Discover just because of that.
function isActivePath(pathname, target) {
	if (target === '/') return pathname === '/' || pathname === '/home';
	if (target === '/tournaments') return pathname === '/tournaments' || pathname.startsWith('/tournaments/view/');
	return pathname === target;
}

export default function App() {
	const { isLoggedIn, setIsLoggedIn } = useContext(AuthContext);
	const [showHelpMenu, setShowHelpMenu] = useState(false);

	useEffect(() => {
		// Resolved once, not on every scroll event. Effects run after the whole
		// tree is committed, so Header's element is already in the document.
		const header = document.querySelector('header');
		if (!header) return;

		const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 25);

		// Passive: the handler never calls preventDefault, and saying so lets the
		// browser scroll without waiting on it.
		window.addEventListener('scroll', onScroll, { passive: true });

		// This effect previously returned nothing, so every mount of App added a
		// listener that outlived it — and App does unmount, since /login is
		// outside its layout route.
		return () => window.removeEventListener('scroll', onScroll);
	}, []);

	return (
		<>
			<Header loggedIn={isLoggedIn} setLoggedIn={setIsLoggedIn} />
			<main id="app">
				<Outlet />
			</main>
			<Footer />
			{/* Two presentations of the same primary navigation, gated by the same
			    768px breakpoint used everywhere else in this file: a horizontal bar
			    in the header above it, a fixed bottom bar below it. Both render
			    unconditionally and the CSS at that breakpoint decides which one
			    takes up space — there is no third, hamburger-driven state left. */}
			<BottomNav loggedIn={isLoggedIn} setLoggedIn={setIsLoggedIn} />
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
	return (
		<header id="header">
			<Link to="/" className="website-title">
				Tourganiser
			</Link>
			<DesktopNav loggedIn={loggedIn} setLoggedIn={setLoggedIn} />
		</header>
	);
}

// Above 768px: Discover, Create, a theme toggle and an account menu, all
// reachable without opening anything — what MenuBar used to hide behind a
// hamburger at every width. Hidden by CSS at and below 768px, where BottomNav
// is the equivalent instead.
function DesktopNav({ loggedIn, setLoggedIn }) {
	const { theme, toggleTheme } = useTheme();

	return (
		<nav className="desktop-nav" aria-label="Primary">
			<Link to="/tournaments" className="desktop-nav-link">
				Discover
			</Link>
			<Link to="/tournaments/create" className="desktop-nav-link">
				Create
			</Link>
			<button
				type="button"
				className="desktop-nav-theme"
				onClick={toggleTheme}
				title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>
				<i className={theme === 'light' ? 'fas fa-sun' : 'fas fa-moon'} style={{ color: '#FFD700' }}></i>
			</button>
			<DesktopAccountMenu loggedIn={loggedIn} setLoggedIn={setLoggedIn} />
		</nav>
	);
}

// The profile icon's dropdown: one working action (Logout) plus two stopgap
// links, matching what the mobile Profile sheet offers via a different shape.
// Closes on an outside click, same pattern as the menus this file already had
// before MenuBar was retired.
function DesktopAccountMenu({ loggedIn, setLoggedIn }) {
	const location = useLocation();
	const { loading, handleLogout } = useLogout(setLoggedIn);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef(null);

	useEffect(() => {
		if (!menuOpen) return;

		const handleClickOutside = (e) => {
			if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [menuOpen]);

	const closeMenu = () => setMenuOpen(false);

	const handleLogoutAndClose = async () => {
		await handleLogout();
		closeMenu();
	};

	return (
		<div className="desktop-nav-profile" ref={menuRef}>
			{loading && <LoadingScreen />}
			<button
				type="button"
				className="desktop-nav-profile-button"
				onClick={() => setMenuOpen((open) => !open)}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				aria-label="Account">
				<Icon name="person" size={20} />
			</button>
			{menuOpen && (
				<div className="desktop-nav-menu" role="menu">
					{loggedIn ? (
						<>
							<Link to="/profile" className="desktop-nav-menu-item" role="menuitem" onClick={closeMenu}>
								Profile
							</Link>
							<Link to="/settings" className="desktop-nav-menu-item" role="menuitem" onClick={closeMenu}>
								Settings
							</Link>
							<button type="button" className="desktop-nav-menu-item" role="menuitem" onClick={handleLogoutAndClose}>
								Logout
							</button>
						</>
					) : (
						<Link
							to="/login"
							state={{ from: location }}
							className="desktop-nav-menu-item"
							role="menuitem"
							onClick={closeMenu}>
							Login
						</Link>
					)}
				</div>
			)}
		</div>
	);
}

// At and below 768px: five items, Create raised as the primary action.
// Profile opens an account sheet rather than linking anywhere — there is no
// /profile route yet, and the sheet is what MenuBar's Account section
// becomes on mobile (Sign In/Sign Up or Logout, plus the theme toggle).
function BottomNav({ loggedIn, setLoggedIn }) {
	const location = useLocation();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [hidden, setHidden] = useState(false);

	// Hides on a deliberate downward scroll, reappears on any upward one — the
	// standard mobile pattern for giving a fixed bottom bar back the screen
	// space while reading, without losing it permanently. A 10px threshold
	// keeps momentum-scroll jitter and the address bar's own collapse from
	// flickering it, and it never hides near the top, where "scrolling down"
	// barely means anything on a short page.
	useEffect(() => {
		let lastY = window.scrollY;

		const onScroll = () => {
			const currentY = window.scrollY;
			const delta = currentY - lastY;

			if (Math.abs(delta) > 10) {
				setHidden(delta > 0 && currentY > 120);
				lastY = currentY;
			}
		};

		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	}, []);

	const itemClass = (target) => `bottom-nav-item${isActivePath(location.pathname, target) ? ' active' : ''}`;

	return (
		<>
			<nav className={`bottom-nav${hidden ? ' bottom-nav-hidden' : ''}`} aria-label="Primary">
				<Link to="/" className={itemClass('/')}>
					<Icon name="home" size={22} />
					<span>Home</span>
				</Link>
				<Link to="/tournaments" className={itemClass('/tournaments')}>
					<Icon name="explore" size={22} />
					<span>Discover</span>
				</Link>
				<Link to="/tournaments/create" className="bottom-nav-item bottom-nav-create" aria-label="Create tournament">
					<span className="bottom-nav-create-icon">
						<Icon name="add" size={28} />
					</span>
					<span>Create</span>
				</Link>
				<button
					type="button"
					className={`bottom-nav-item${sheetOpen ? ' active' : ''}`}
					onClick={() => setSheetOpen(true)}>
					<Icon name="person" size={22} />
					<span>Profile</span>
				</button>
				<Link to="/about" className={itemClass('/about')}>
					<Icon name="info" size={22} />
					<span>Info</span>
				</Link>
			</nav>
			{sheetOpen && <AccountSheet loggedIn={loggedIn} setLoggedIn={setLoggedIn} onClose={() => setSheetOpen(false)} />}
		</>
	);
}

// A stopgap, not a destination: it holds what DesktopAccountMenu holds for
// account purposes — same items, different shape — plus the theme toggle,
// which mobile has nowhere else to reach now that MenuBar is gone. Not a
// route, so closing it is just clearing local state.
function AccountSheet({ loggedIn, setLoggedIn, onClose }) {
	const location = useLocation();
	const { theme, toggleTheme } = useTheme();
	const { loading, handleLogout } = useLogout(setLoggedIn);

	const handleClickOutside = (e) => {
		if (e.target.classList.contains('account-sheet-backdrop')) onClose();
	};

	const handleLogoutAndClose = async () => {
		await handleLogout();
		onClose();
	};

	return (
		<div className="account-sheet-backdrop" onClick={handleClickOutside}>
			{loading && <LoadingScreen />}
			<div className="account-sheet">
				<button type="button" className="account-sheet-close" onClick={onClose} aria-label="Close">
					&times;
				</button>
				{loggedIn ? (
					<>
						<Link to="/profile" className="account-sheet-item" onClick={onClose}>
							Profile
						</Link>
						<Link to="/settings" className="account-sheet-item" onClick={onClose}>
							Settings
						</Link>
						<button type="button" className="account-sheet-item" onClick={handleLogoutAndClose}>
							Logout
						</button>
					</>
				) : (
					<Link to="/login" state={{ from: location }} className="account-sheet-item" onClick={onClose}>
						Login
					</Link>
				)}
				<button type="button" className="account-sheet-item" onClick={toggleTheme}>
					{theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
				</button>
			</div>
		</div>
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
				<Link to="/terms">&copy; 2025 Tourganiser. All rights reserved.</Link>
				<div className="legal-links">
					<Link to="/terms">Privacy Policy</Link>
					<Link to="/terms">Terms of Service</Link>
				</div>
			</div>
		</footer>
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
