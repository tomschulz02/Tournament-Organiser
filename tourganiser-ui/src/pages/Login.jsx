import { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../AuthContext';
import '../App.css';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser, checkLoginStatus } from '../requests';
import { useMessage } from '../MessageContext';
import { MessagePopup } from '../MessageProvider';
import { useTheme } from '../ThemeContext';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export default function Login() {
	const [currentForm, setCurrentForm] = useState('login');
	const { setIsLoggedIn, setUsername } = useContext(AuthContext);
	const navigate = useNavigate();
	const { showMessage } = useMessage();
	const { theme, toggleTheme } = useTheme();

	// TODO: Add logic to check if user is already logged in and redirect to home page
	useEffect(() => {
		const checkLogin = async () => {
			try {
				const { data } = await checkLoginStatus();
				if (data.loggedIn) {
					setIsLoggedIn(true);
					showMessage('Successfully logged in!', 'success');
					setUsername(data.username);
					navigate('/home'); // Redirect to home page if already logged in
				}
			} catch {
				// do nothing
			}
		};
		checkLogin();
	}, [navigate, setIsLoggedIn, setUsername, showMessage]);

	const toggleForm = (formName) => {
		setCurrentForm(formName);
	};

	const handleClose = () => {
		navigate(-1);
	};

	return (
		<>
			<MessagePopup />
			<div className="login-popup">
				{currentForm === 'login' ? (
					<LoginForm onFormSwitch={() => toggleForm('register')} onClose={handleClose} setLoggedIn={setIsLoggedIn} />
				) : (
					<RegisterForm onFormSwitch={() => toggleForm('login')} onClose={handleClose} setLoggedIn={setIsLoggedIn} />
				)}
			</div>
			<div className="theme-toggle-login">
				{theme === 'light' ? (
					<i className="fas fa-sun" onClick={toggleTheme} title="Switch to Dark Mode" style={{ color: '#FFD700' }}></i>
				) : (
					<i
						className="fas fa-moon"
						onClick={toggleTheme}
						title="Switch to Light Mode"
						style={{ color: '#FFD700' }}></i>
				)}
			</div>
		</>
	);
}

function LoginForm({ onFormSwitch, onClose, setLoggedIn }) {
	const [loginDetails, setLoginDetails] = useState({ email: '', password: '' });
	const [isLoading, setIsLoading] = useState(false);
	const { showMessage } = useMessage();
	const { setUsername } = useContext(AuthContext);

	const handleChange = (e) => {
		const { id, value } = e.target;
		setLoginDetails({ ...loginDetails, [id]: value });
	};

	const handleLogin = async (e) => {
		e.preventDefault();
		// validate input fields
		const { email, password } = loginDetails;
		const validation = validateLoginDetails(email, password);
		if (!validation.success) {
			// show error message to user
			showMessage(validation.message, 'error');
			return;
		}
		setIsLoading(true);

		try {
			const { data } = await loginUser(email, password);
			setLoggedIn(true);
			showMessage(`Welcome, ${data.username}`, 'success');
			setUsername(data.username);
			onClose();
		} catch (error) {
			// The server's message is display-ready, so it goes straight to the user.
			showMessage(error.message, 'error');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="login-container">
			<button className="close-login" onClick={onClose}>
				&times;
			</button>
			<div className="login-header">
				<h2>Login</h2>
			</div>
			<form className="login-form" id="loginForm" onSubmit={handleLogin}>
				<div className="form-group">
					<label htmlFor="email">Email</label>
					<input
						type="email"
						autoComplete="email"
						id="email"
						value={loginDetails.email}
						onChange={handleChange}
						required
					/>
				</div>
				<div className="form-group">
					<label htmlFor="password">Password</label>
					<input
						type="password"
						id="password"
						autoComplete="password"
						value={loginDetails.password}
						onChange={handleChange}
						required
					/>
				</div>
				<button type="submit" disabled={isLoading}>
					{isLoading ? (
						<div className="loading-spinner">
							<div className="spinner"></div>
						</div>
					) : (
						'Login'
					)}
				</button>
			</form>
			<div className="login-form-link">
				Don't have an account yet? Create one{' '}
				<span className="toggle-form" onClick={onFormSwitch}>
					here
				</span>
			</div>
		</div>
	);
}

function RegisterForm({ onFormSwitch, onClose, setLoggedIn }) {
	const [registerDetails, setRegisterDetails] = useState({
		newUsername: '',
		newEmail: '',
		newPassword: '',
		confirmPassword: '',
	});
	const [isLoading, setIsLoading] = useState(false);
	const { showMessage } = useMessage();
	const { setUsername } = useContext(AuthContext);

	const handleChange = (e) => {
		const { id, value } = e.target;
		setRegisterDetails({ ...registerDetails, [id]: value });
	};

	const handleRegister = async (e) => {
		e.preventDefault();

		const { newUsername, newEmail, newPassword, confirmPassword } = registerDetails;
		const validation = validateRegisterDetails(newUsername, newEmail, newPassword, confirmPassword);
		if (!validation.success) {
			showMessage(validation.message, 'error');
			return;
		}
		setIsLoading(true);

		try {
			const { data } = await registerUser(newUsername, newEmail, newPassword, confirmPassword);
			setLoggedIn(true);
			showMessage('Account created successfully!', 'success');
			setUsername(data.username);
			onClose();
		} catch (error) {
			showMessage(error.message, 'error');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="login-container">
			<button className="close-login" onClick={onClose}>
				&times;
			</button>
			<div className="login-header">
				<h2>Create Account</h2>
			</div>
			<form className="login-form" id="signupForm" onSubmit={handleRegister}>
				<div className="form-group">
					<label htmlFor="newUsername">Username</label>
					<input
						type="text"
						autoComplete="username"
						id="newUsername"
						value={registerDetails.newUsername}
						onChange={handleChange}
						required
					/>
				</div>
				<div className="form-group">
					<label htmlFor="newEmail">Email</label>
					<input
						type="email"
						autoComplete="email"
						id="newEmail"
						value={registerDetails.newEmail}
						onChange={handleChange}
						required
					/>
				</div>
				<div className="form-group">
					<label htmlFor="newPassword">Password</label>
					<input
						type="password"
						autoComplete="new-password"
						id="newPassword"
						value={registerDetails.newPassword}
						onChange={handleChange}
						required
					/>
				</div>
				<div className="form-group">
					<label htmlFor="confirmPassword">Confirm Password</label>
					<input
						type="password"
						autoComplete="new-password"
						id="confirmPassword"
						value={registerDetails.confirmPassword}
						onChange={handleChange}
						required
					/>
				</div>
				<button type="submit" disabled={isLoading}>
					{isLoading ? (
						<div className="loading-spinner">
							<div className="spinner"></div>
						</div>
					) : (
						'Create Account'
					)}
				</button>
			</form>
			<div className="login-form-link">
				Already have an account? Login{' '}
				<span className="toggle-form" onClick={onFormSwitch}>
					here
				</span>
			</div>
		</div>
	);
}

function validateLoginDetails(email, password) {
	if (!email || !password) {
		return { message: 'Please fill in all fields', success: false };
	}

	return { message: 'Input valid', success: true };
}

function validateRegisterDetails(newUsername, newEmail, newPassword, confirmPassword) {
	if (!newUsername || !newEmail || !newPassword || !confirmPassword) {
		return { message: 'Please fill in all fields', success: false };
	}
	if (!emailRegex.test(newEmail)) {
		return { message: 'Please enter a valid email', success: false };
	}
	if (newPassword.length < 8) {
		return { message: 'Password must be at least 8 characters long', success: false };
	}
	if (!strongPasswordRegex.test(newPassword)) {
		return {
			message:
				'Password must contain at least one of each of the following: lowercase and uppercase letter, number, symbol',
			success: false,
		};
	}
	if (newPassword !== confirmPassword) {
		return { message: 'Passwords do not match', success: false };
	}
	return { message: 'Input valid', success: true };
}
