export async function loginUser(email, password) {
	try {
		const response = await fetch("http://localhost:5000/api/signin", {
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
		throw error;
	}
}

export async function registerUser(username, email, password, confirmPassword) {
	try {
		const response = await fetch("http://localhost:5000/api/signup", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ username, email, password, confirmPassword }),
			credentials: "include",
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.error || "Failed to create account");
		}

		return data;
	} catch (error) {
		throw error;
	}
}

export async function checkLoginStatus() {
	try {
		const response = await fetch("http://localhost:5000/api/check-login", {
			method: "GET",
			credentials: "include",
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to check login status");
		}

		return data;
	} catch (error) {
		throw error;
	}
}

export async function logoutUser() {
	try {
		const response = await fetch("http://localhost:5000/api/signout", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.error || "Failed to logout");
		}

		return data;
	} catch (error) {
		throw error;
	}
}
