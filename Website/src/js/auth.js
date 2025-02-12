import { navigateTo } from "../../app";

// scripts for authenticating user login and signup
export function loadAuthEvents() {
	document.getElementById("loginForm").addEventListener("submit", async (e) => {
		e.preventDefault();

		const submitButton = e.target.querySelector("button");
		try {
			const email = document.getElementById("email").value;
			const password = document.getElementById("password").value;

			// Show loading state
			submitButton.disabled = true;
			submitButton.textContent = "Logging in...";

			const result = await loginUser(email, password);

			console.log(result);

			if (result.success) {
				// Handle successful login
				console.log("Login successful");
				window.location = "/src/html/index.html";
				// change text from Login to Logout in profile window
			}
		} catch (error) {
			// Show error message to user
			alert(error.message);
		} finally {
			// Reset button state
			submitButton.disabled = false;
			submitButton.textContent = "Login";
		}
	});

	document
		.getElementById("signupForm")
		.addEventListener("submit", async (e) => {
			e.preventDefault();

			try {
				const email = document.getElementById("newEmail").value;
				const password = document.getElementById("newPassword").value;
				const username = document.getElementById("newUsername").value;

				// Show loading state
				const submitButton = e.target.querySelector("button");
				submitButton.disabled = true;
				submitButton.textContent = "Logging in...";

				const result = await signupUser(username, email, password);

				if (result.success) {
					// Handle successful login
					window.location = "/src/html/index.html";
				}
			} catch (error) {
				// Show error message to user
				alert(error.message);
			} finally {
				// Reset button state
				submitButton.disabled = false;
				submitButton.textContent = "Login";
			}
		});

	for (let c of document.getElementsByClassName("close-login")) {
		c.addEventListener("click", (event) => {
			navigateTo(event, "/");
		});
	}
}

async function loginUser(email, password) {
	try {
		const response = await fetch("http://localhost:3000/api/signin", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email, password }),
			credentials: "include", // needed for cookies
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.error || "Login failed");
		}

		return data;
	} catch (error) {
		console.error("Login error:", error);
		throw error;
	}
}

async function signupUser(username, email, password) {
	try {
		const response = await fetch("http://localhost:3000/api/signup", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ username, email, password }),
			credentials: "include",
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.error || "Failed to create account");
		}

		return data;
	} catch (error) {
		console.error("Signup error:", error);
		throw error;
	}
}

function toggleForms() {
	const loginPopup = document.getElementById("loginPopup");
	const signupPopup = document.getElementById("signupPopup");

	if (loginPopup.style.display === "flex") {
		loginPopup.style.display = "none";
		signupPopup.style.display = "flex";
	} else {
		loginPopup.style.display = "flex";
		signupPopup.style.display = "none";
	}
}

function closeLogin() {
	window.location = "/src/html/index.html";
}
