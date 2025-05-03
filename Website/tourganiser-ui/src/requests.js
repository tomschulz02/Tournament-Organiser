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
		if (response.status === 401) {
			return { loggedIn: false };
		}
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

export async function getTournaments() {
	try {
		const response = await fetch("http://localhost:5000/api/tournaments", {
			method: "GET",
			credentials: "include",
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to fetch tournaments");
		}
		return data;
	} catch (error) {
		throw error;
	}
}

export async function fetchTournamentData(tournamentId) {
	try {
		const response = await fetch(`http://localhost:5000/api/tournament/${tournamentId}`, {
			method: "GET",
			credentials: "include",
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to fetch tournament data");
		}
		return data;
	} catch (error) {
		throw error;
	}
}

export async function createCollection(name) {
	try {
		const response = await fetch("http://localhost:5000/api/collection/create", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name }),
			credentials: "include",
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to create collection");
		}
		return data;
	} catch (error) {
		throw error;
	}
}

export async function fetchUserCollections() {
	try {
		const response = await fetch("http://localhost:5000/api/collections", {
			method: "GET",
			credentials: "include",
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to fetch collections");
		}
		return data;
	} catch (error) {
		throw error;
	}
}

export async function createTournament(tournamentData) {
	try {
		const response = await fetch("http://localhost:5000/api/tournament/create", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(tournamentData),
			credentials: "include",
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to create tournament");
		}
		return data;
	} catch (error) {
		throw error;
	}
}

export async function joinTournament(tournamentId) {
	try {
		const response = await fetch(`http://localhost:5000/api/tournaments/${tournamentId}/join`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to join tournament");
		}
		return data;
	} catch (error) {
		throw error;
	}
}

export async function leaveTournament(tournamentId) {
	try {
		const response = await fetch(`http://localhost:5000/api/tournaments/${tournamentId}/leave`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to leave tournament");
		}
		return data;
	} catch (error) {
		throw error;
	}
}

export async function updateScore(fixtureId, scores, status, hashId) {
	try {
		const response = await fetch(`http://localhost:5000/api/tournament/${fixtureId}/results`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
			body: JSON.stringify({ scores, status, hashId }),
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to update score");
		}
		return data;
	} catch (error) {
		throw error;
	}
}

export async function startTournament(tournamentId) {
	try {
		const response = await fetch(`http://localhost:5000/api/tournament/${tournamentId}/start`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to start tournament");
		}
		return data;
	} catch (error) {
		throw error;
	}
}
