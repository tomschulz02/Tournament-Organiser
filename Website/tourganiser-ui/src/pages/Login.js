import React, { useState, useContext, useEffect } from "react";
import { AuthContext } from "../AuthContext";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { loginUser, registerUser, checkLoginStatus } from "../requests"; // Assuming you have a requests.js file for API calls

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export default function Login() {
	const [currentForm, setCurrentForm] = useState("login");
	const { setIsLoggedIn } = useContext(AuthContext);
	const navigate = useNavigate();

	// TODO: Add logic to check if user is already logged in and redirect to home page
	useEffect(() => {
		const checkLogin = async () => {
			try {
				const response = await checkLoginStatus();
				if (response.loggedIn) {
					setIsLoggedIn(true);
					navigate("/home"); // Redirect to home page if already logged in
				}
			} catch (error) {
				console.error("Error checking login status:", error);
			}
		};
		checkLogin();
	});

	const toggleForm = (formName) => {
		setCurrentForm(formName);
	};

	const handleClose = () => {
		navigate(-1);
	};

	return (
		<div className="login-popup">
			{currentForm === "login" ? (
				<LoginForm onFormSwitch={() => toggleForm("register")} onClose={handleClose} setLoggedIn={setIsLoggedIn} />
			) : (
				<RegisterForm onFormSwitch={() => toggleForm("login")} onClose={handleClose} setLoggedIn={setIsLoggedIn} />
			)}
		</div>
	);
}

function LoginForm({ onFormSwitch, onClose, setLoggedIn }) {
	const [loginDetails, setLoginDetails] = useState({ email: "", password: "" });
	const [isLoading, setIsLoading] = useState(false);

	const handleChange = (e) => {
		const { id, value } = e.target;
		setLoginDetails({ ...loginDetails, [id]: value });
	};

	const handleLogin = async (e) => {
		e.preventDefault();
		// validate input fields
		const { email, password } = loginDetails;
		if (!validateLoginDetails(email, password)) {
			// show error message to user
			return;
		}
		setIsLoading(true);

		try {
			const response = await loginUser(email, password);
			if (response.success) {
				setLoggedIn(true);
				onClose();
			}
		} catch (error) {
			console.error("Login error:", error);
			alert(error.message); // Show error message to user
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
						"Login"
					)}
				</button>
			</form>
			<div className="login-form-link">
				Don't have an account yet? Create one{" "}
				<span className="toggle-form" onClick={onFormSwitch}>
					here
				</span>
			</div>
		</div>
	);
}

function RegisterForm({ onFormSwitch, onClose, setLoggedIn }) {
	const [registerDetails, setRegisterDetails] = useState({
		newUsername: "",
		newEmail: "",
		newPassword: "",
		confirmPassword: "",
	});
	const [isLoading, setIsLoading] = useState(false);

	const handleChange = (e) => {
		const { id, value } = e.target;
		setRegisterDetails({ ...registerDetails, [id]: value });
	};

	const handleRegister = async (e) => {
		e.preventDefault();

		const { newUsername, newEmail, newPassword, confirmPassword } = registerDetails;
		if (!validateRegisterDetails(newUsername, newEmail, newPassword, confirmPassword)) {
			return;
		}
		setIsLoading(true);

		try {
			const response = await registerUser(newUsername, newEmail, newPassword, confirmPassword);
			if (response.success) {
				setLoggedIn(true);
				onClose();
			}
		} catch (error) {
			console.error("Registration error:", error);
			alert(error.message); // Show error message to user
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="login-container">
			<button className="close-login" onClick={onClose}>
				&times;
			</button>
			<div className="login">
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
						"Create Account"
					)}
				</button>
			</form>
			<div className="login-form-link">
				Already have an account? Login{" "}
				<span className="toggle-form" onClick={onFormSwitch}>
					here
				</span>
			</div>
		</div>
	);
}

function validateLoginDetails(email, password) {
	if (!email || !password) {
		return false;
	}
	if (!emailRegex.test(email)) {
		return false;
	}
	if (password.length < 8) {
		return false;
	} else {
		return strongPasswordRegex.test(password);
	}
}

function validateRegisterDetails(newUsername, newEmail, newPassword, confirmPassword) {
	if (!newUsername || !newEmail || !newPassword || !confirmPassword) {
		return false;
	}
	if (!emailRegex.test(newEmail)) {
		return false;
	}
	if (newPassword.length < 8) {
		return false;
	} else {
		return strongPasswordRegex.test(newPassword) && newPassword === confirmPassword;
	}
}
