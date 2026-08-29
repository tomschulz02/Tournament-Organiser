import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMessage } from '../MessageContext';
import { getMyProfile, changePassword } from '../requests';
import { strongPasswordRegex } from '../utils/passwordPolicy';
import LoadingScreen from '../components/LoadingScreen';
import '../App.css';

export default function Settings() {
	const location = useLocation();
	const { showMessage } = useMessage();

	const [isLoading, setIsLoading] = useState(true);
	const [unauthorized, setUnauthorized] = useState(false);

	// Fetched unconditionally rather than gated on AuthContext.isLoggedIn — see
	// the same note in Profile.jsx. The session cookie travels with the request
	// regardless of whether the context's own async check has resolved yet.
	useEffect(() => {
		let active = true;

		const fetchProfile = async () => {
			try {
				await getMyProfile();
				if (!active) return;
				setIsLoading(false);
			} catch (error) {
				if (!active) return;
				if (error.status === 401) {
					setUnauthorized(true);
				} else {
					showMessage(error.message, 'error');
				}
				setIsLoading(false);
			}
		};

		fetchProfile();

		return () => {
			active = false;
		};
	}, [showMessage]);

	if (isLoading) {
		return <LoadingScreen />;
	}

	if (unauthorized) {
		return (
			<div className="signin-warning">
				<h2 className="signin-warning-heading">Sign In required</h2>
				<p className="signin-warning-info">You need to be signed in to see your settings.</p>
				<div className="signin-warning-button">
					<Link to="/login" state={{ from: location }} className="cta-button">
						Sign In
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="profile-page">
			<section className="profile-section">
				<h3>Change Password</h3>
				<PasswordChangeForm />
			</section>
		</div>
	);
}

function validatePasswordChange(currentPassword, newPassword, confirmNewPassword) {
	if (!currentPassword || !newPassword || !confirmNewPassword) {
		return { message: 'Please fill in all fields', success: false };
	}
	if (!strongPasswordRegex.test(newPassword)) {
		return {
			message:
				'Password must contain at least one of each of the following: lowercase and uppercase letter, number, symbol',
			success: false,
		};
	}
	if (newPassword !== confirmNewPassword) {
		return { message: 'Passwords do not match', success: false };
	}

	return { message: 'Input valid', success: true };
}

function PasswordChangeForm() {
	const { showMessage } = useMessage();
	const [fields, setFields] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
	const [busy, setBusy] = useState(false);

	const handleChange = (e) => {
		const { id, value } = e.target;
		setFields({ ...fields, [id]: value });
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		const { currentPassword, newPassword, confirmNewPassword } = fields;
		const validation = validatePasswordChange(currentPassword, newPassword, confirmNewPassword);
		if (!validation.success) {
			showMessage(validation.message, 'error');
			return;
		}

		setBusy(true);
		try {
			await changePassword(currentPassword, newPassword, confirmNewPassword);
			showMessage('Password updated.', 'success');
			setFields({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
		} catch (error) {
			showMessage(error.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			<div className="form-group">
				<label htmlFor="currentPassword">Current Password</label>
				<input
					type="password"
					id="currentPassword"
					className="form-input"
					autoComplete="current-password"
					value={fields.currentPassword}
					disabled={busy}
					onChange={handleChange}
					required
				/>
			</div>
			<div className="form-group">
				<label htmlFor="newPassword">New Password</label>
				<input
					type="password"
					id="newPassword"
					className="form-input"
					autoComplete="new-password"
					value={fields.newPassword}
					disabled={busy}
					onChange={handleChange}
					required
				/>
			</div>
			<div className="form-group">
				<label htmlFor="confirmNewPassword">Confirm New Password</label>
				<input
					type="password"
					id="confirmNewPassword"
					className="form-input"
					autoComplete="new-password"
					value={fields.confirmNewPassword}
					disabled={busy}
					onChange={handleChange}
					required
				/>
			</div>
			<button type="submit" className="tv-primary-action" disabled={busy}>
				{busy && <span className="btn-spinner" aria-hidden="true" />}
				<span>{busy ? 'Saving…' : 'Change Password'}</span>
			</button>
		</form>
	);
}
