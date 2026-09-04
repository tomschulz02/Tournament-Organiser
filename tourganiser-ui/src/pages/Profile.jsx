import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMessage } from '../MessageContext';
import { useHelpTopic } from '../HelpContext';
import { getMyProfile, getMyTournaments, getMySavedTournaments, unsaveTournament } from '../requests';
import LoadingScreen from '../components/LoadingScreen';
import { TournamentCard } from './Browse';
import '../App.css';

// Frontend-only for now: the whole list already arrives in one response, so
// slicing it client-side is the smallest correct thing. Pagination is a
// {page, totalPages, onChange} control either way, so switching a section to
// backend pagination later — a page param and a total from the server instead
// of a full array — changes only what feeds this component, not its shape.
const PAGE_SIZE = 10;

function paginate(items, page) {
	const start = (page - 1) * PAGE_SIZE;
	return items.slice(start, start + PAGE_SIZE);
}

function Pagination({ page, totalPages, onChange }) {
	if (totalPages <= 1) return null;

	return (
		<div className="profile-pagination">
			<button
				type="button"
				className="profile-pagination-button"
				onClick={() => onChange(page - 1)}
				disabled={page <= 1}>
				Previous
			</button>
			<span className="profile-pagination-status">
				Page {page} of {totalPages}
			</span>
			<button
				type="button"
				className="profile-pagination-button"
				onClick={() => onChange(page + 1)}
				disabled={page >= totalPages}>
				Next
			</button>
		</div>
	);
}

export default function Profile() {
	const location = useLocation();
	const navigate = useNavigate();
	const { showMessage } = useMessage();
	useHelpTopic('profile');

	const [isLoading, setIsLoading] = useState(true);
	const [unauthorized, setUnauthorized] = useState(false);
	const [profile, setProfile] = useState(null);
	const [createdTournaments, setCreatedTournaments] = useState([]);
	const [savedTournaments, setSavedTournaments] = useState([]);
	const [createdPage, setCreatedPage] = useState(1);
	const [savedPage, setSavedPage] = useState(1);

	// Fetched unconditionally rather than gated on AuthContext.isLoggedIn: the
	// session cookie travels with the request regardless of whether the
	// context's own async check has resolved yet, and AuthContext exposes no
	// "check finished" flag to gate on without risking a false sign-in prompt
	// during that window. A logged-out viewer's request 401s the same as any
	// other — the page never navigates away on its own, only ever falls back to
	// an inline sign-in prompt.
	useEffect(() => {
		let active = true;

		const fetchProfile = async () => {
			const results = await Promise.allSettled([getMyProfile(), getMyTournaments(), getMySavedTournaments()]);
			if (!active) return;

			const [profileResult, createdResult, savedResult] = results;

			// A failure in one fetch must not blank what the other two returned.
			if (profileResult.status === 'fulfilled') setProfile(profileResult.value.data);
			if (createdResult.status === 'fulfilled') setCreatedTournaments(createdResult.value.data);
			if (savedResult.status === 'fulfilled') setSavedTournaments(savedResult.value.data);

			const failures = results.filter((result) => result.status === 'rejected');
			if (failures.some((failure) => failure.reason?.status === 401)) {
				setUnauthorized(true);
			} else if (failures.length > 0) {
				showMessage(failures[0].reason.message, 'error');
			}

			setIsLoading(false);
		};

		fetchProfile();

		return () => {
			active = false;
		};
	}, [showMessage]);

	// Optimistic: the card disappears immediately, and a failed unsave restores
	// it rather than waiting on a refetch.
	const handleRemoveSaved = async (tournamentId) => {
		const previous = savedTournaments;
		setSavedTournaments((current) => current.filter((tournament) => tournament.id !== tournamentId));

		try {
			await unsaveTournament(tournamentId);
		} catch (error) {
			setSavedTournaments(previous);
			showMessage(error.message, 'error');
		}
	};

	// So the tournament view's Back control returns here instead of defaulting
	// to Browse — see TournamentShell.jsx's handleBack, which already reads
	// location.state.from and only needed a caller to set it.
	const openTournament = (tournamentId) => {
		navigate(`/tournaments/view/${tournamentId}`, { state: { from: '/profile' } });
	};

	if (isLoading) {
		return <LoadingScreen context="pageLoad" />;
	}

	if (unauthorized) {
		return (
			<div className="signin-warning">
				<h2 className="signin-warning-heading">Sign In required</h2>
				<p className="signin-warning-info">You need to be signed in to see your profile.</p>
				<div className="signin-warning-button">
					<Link to="/login" state={{ from: location }} className="cta-button">
						Sign In
					</Link>
				</div>
			</div>
		);
	}

	// Clamped rather than reset via an effect: a list that shrinks (removing the
	// last saved tournament on a page, or a refetch returning fewer rows) simply
	// falls back to its new last page on the next render.
	const createdTotalPages = Math.max(1, Math.ceil(createdTournaments.length / PAGE_SIZE));
	const visibleCreatedPage = Math.min(createdPage, createdTotalPages);
	const savedTotalPages = Math.max(1, Math.ceil(savedTournaments.length / PAGE_SIZE));
	const visibleSavedPage = Math.min(savedPage, savedTotalPages);

	return (
		<div className="profile-page">
			<section className="profile-account">
				<div className="profile-account-heading">
					<h2>{profile.username}</h2>
					{profile.admin && <span className="profile-admin-badge">Admin</span>}
				</div>
				<p className="profile-account-email">{profile.email}</p>
			</section>

			<section className="profile-section">
				<h3>Created Tournaments</h3>
				{createdTournaments.length > 0 ? (
					<>
						<div className="tournaments-grid">
							{paginate(createdTournaments, visibleCreatedPage).map((tournament) => (
								<TournamentCard key={tournament.id} details={tournament} action={() => openTournament(tournament.id)} />
							))}
						</div>
						<Pagination page={visibleCreatedPage} totalPages={createdTotalPages} onChange={setCreatedPage} />
					</>
				) : (
					<p className="profile-empty-message">You haven't created any tournaments yet.</p>
				)}
			</section>

			<section className="profile-section">
				<h3>Saved Tournaments</h3>
				{savedTournaments.length > 0 ? (
					<>
						<div className="tournaments-grid">
							{paginate(savedTournaments, visibleSavedPage).map((tournament) => (
								<TournamentCard
									key={tournament.id}
									details={tournament}
									action={() => openTournament(tournament.id)}
									onRemove={() => handleRemoveSaved(tournament.id)}
								/>
							))}
						</div>
						<Pagination page={visibleSavedPage} totalPages={savedTotalPages} onChange={setSavedPage} />
					</>
				) : (
					<p className="profile-empty-message">You haven't saved any tournaments yet.</p>
				)}
			</section>
		</div>
	);
}
