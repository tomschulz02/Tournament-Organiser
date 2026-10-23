import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../Icons';
import TournamentPattern from '../TournamentPattern';
import { useMessage } from '../../MessageContext';
import { AuthContext } from '../../AuthContext';
import { getMySavedTournaments, saveTournament, unsaveTournament } from '../../requests';
import { tournamentAccentStyle } from '../../utils/tournamentIdentity';
import { SETTINGS_TAB, TOURNAMENT_TABS, useTournamentTab } from './tournamentTabs';
import '../../styles/tournament-view.css';

// Subheader and navigation. Both render on mount, before any data arrives — only
// the content area waits. See the handover, decision A1: one request feeds the
// page, so loading is section-level but error isolation cannot be.
export default function TournamentShell({ tournamentId, name, creator, children }) {
	const { activeTab, selectTab } = useTournamentTab();
	const navigate = useNavigate();
	const location = useLocation();

	const handleBack = () => {
		if (location.state?.from) {
			navigate(location.state.from, { replace: true });
			return;
		}

		navigate('/tournaments', { replace: true });
	};

	return (
		<div className="tv-shell">
			<div className="tv-header-band" style={tournamentAccentStyle(tournamentId)}>
				<div className="tv-header-band-identity" aria-hidden="true">
					<TournamentPattern tournamentId={tournamentId} />
				</div>

				<div className="tv-subheader">
					<button type="button" className="tv-icon-button tv-back" onClick={handleBack}>
						<Icon name="leftChevron" label="Back" size={22} />
						<span className="tv-back-label">Browse</span>
					</button>

					<h1 className="tv-title">{name || <span className="tv-skeleton tv-skeleton-title" aria-label="Loading" />}</h1>

					{/* An organiser's own tournament is already on their profile as a
					    created tournament — saving it too would double it up there. */}
					{!creator && <FollowButton tournamentId={tournamentId} />}
				</div>

				<TournamentNav activeTab={activeTab} onSelect={selectTab} creator={creator} />
			</div>

			<div className="tv-content">{children}</div>
		</div>
	);
}

// One row, always. It scrolls sideways rather than wrapping to a second row,
// because a wrapping tab bar changes the page's height as the window narrows and
// pushes the content below it around.
function TournamentNav({ activeTab, onSelect, creator = false }) {
	// Settings is the organiser's alone, so nobody else is shown the tab.
	const tabs = creator ? [...TOURNAMENT_TABS, SETTINGS_TAB] : TOURNAMENT_TABS;

	const listRef = useRef(null);

	// Keep the active tab visible when it is off-screen — on a narrow viewport the
	// last tab sits outside the scroll port, and a reload landing on it would
	// otherwise show no selection at all.
	//
	// Done by hand rather than with scrollIntoView, which also scrolls the nearest
	// scrollable ancestor and would jump the page vertically.
	useEffect(() => {
		const list = listRef.current;
		const active = list?.querySelector('.tv-nav-item.active');
		if (!list || !active) return;

		// Instant, not smooth. This mostly fires on load and on a change of ?tab=,
		// where an animation is wrong anyway — and a smooth scroll is silently
		// dropped by browsers and environments that suppress scroll animation,
		// which leaves the active tab off-screen with no indication why.
		const revealActiveTab = () => {
			const itemLeft = active.offsetLeft;
			const itemRight = itemLeft + active.offsetWidth;
			const viewLeft = list.scrollLeft;
			const viewRight = viewLeft + list.clientWidth;
			const margin = 12;

			if (itemLeft < viewLeft) {
				list.scrollLeft = Math.max(itemLeft - margin, 0);
			} else if (itemRight > viewRight) {
				list.scrollLeft = itemRight - list.clientWidth + margin;
			}
		};

		revealActiveTab();

		// Re-check when the row or the tab changes size, so the active tab does not
		// end up stranded off-screen after a resize or a late relayout.
		const observer = new ResizeObserver(revealActiveTab);
		observer.observe(list);
		observer.observe(active);

		return () => observer.disconnect();
	}, [activeTab]);

	return (
		<nav className="tv-nav" aria-label="Tournament sections">
			<div className="tv-nav-list" ref={listRef}>
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						className={`tv-nav-item ${activeTab === tab.id ? 'active' : ''}`}
						aria-current={activeTab === tab.id ? 'page' : undefined}
						onClick={() => onSelect(tab.id)}>
						{tab.label}
					</button>
				))}
			</div>
		</nav>
	);
}

// Saves the tournament to the viewer's Profile. The starting state comes from the
// same saved list Profile reads, refetched when the session changes, so a
// tournament saved earlier shows as Saved and can be unsaved from here.
//
// Saving needs an account. A signed-out click goes to sign-in and comes back
// here, rather than showing an error for something the reader could not know.
function FollowButton({ tournamentId }) {
	const { showMessage } = useMessage();
	const { isLoggedIn, sessionVersion } = useContext(AuthContext);
	const navigate = useNavigate();
	const location = useLocation();
	const [saved, setSaved] = useState(false);
	const [pending, setPending] = useState(false);

	// Nothing to show while signed out, whatever was last fetched.
	const following = isLoggedIn && saved;

	useEffect(() => {
		if (!isLoggedIn || !tournamentId) return;
		let active = true;

		// A failure leaves the button unsaved, which is what it showed before
		// this was read at all; clicking it still works.
		getMySavedTournaments()
			.then(({ data }) => {
				if (active) setSaved((data ?? []).some((tournament) => tournament.id === tournamentId));
			})
			.catch(() => {});

		return () => {
			active = false;
		};
	}, [isLoggedIn, sessionVersion, tournamentId]);

	const handleClick = async () => {
		if (!tournamentId) return;

		if (!isLoggedIn) {
			navigate('/login', { state: { from: location } });
			return;
		}

		setPending(true);
		try {
			if (following) {
				await unsaveTournament(tournamentId);
				setSaved(false);
				showMessage('Tournament removed from your saved list.', 'success');
			} else {
				await saveTournament(tournamentId);
				setSaved(true);
				showMessage('Tournament saved.', 'success');
			}
		} catch (error) {
			// An ApiError message is display-ready by contract, so it goes straight in.
			showMessage(error.message, 'error');
		} finally {
			setPending(false);
		}
	};

	const label = following ? 'Unfollow tournament' : 'Follow tournament';

	return (
		<button
			type="button"
			className={`tv-icon-button tv-follow ${following ? 'active' : ''}`}
			onClick={handleClick}
			disabled={pending || !tournamentId}
			title={label}>
			<Icon name={following ? 'bookmarkFilled' : 'bookmark'} label={label} size={22} />
			<span className="tv-follow-label">{following ? 'Saved' : 'Save'}</span>
		</button>
	);
}
