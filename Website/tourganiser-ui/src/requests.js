const API_URL = process.env.REACT_APP_API_BASE;

const MAX_RETRIES = 2;
const RETRY_DELAY = 500;

export async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
	try {
		const response = await fetch(API_URL + url, options);
		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.error || `HTTP error! status: ${response.status}`);
		}

		return data;
	} catch (error) {
		if (retries > 0 && (error.message.includes("reset") || error.message.includes("network"))) {
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			return fetchWithRetry(url, options, retries - 1);
		}

		throw {
			error: error.message || "Network error occurred",
			isConnectionError: true,
		};
	}
}
export async function loginUser(email, password) {
	try {
		return await fetchWithRetry("signin", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email, password }),
			credentials: "include", // needed for cookies
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function registerUser(username, email, password, confirmPassword) {
	try {
		return await fetchWithRetry("signup", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ username, email, password, confirmPassword }),
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function checkLoginStatus() {
	try {
		return await fetchWithRetry("check-login", {
			method: "GET",
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function logoutUser() {
	try {
		return await fetchWithRetry("signout", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function getTournaments() {
	try {
		return await fetchWithRetry("tournaments", {
			method: "GET",
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function fetchTournamentData(tournamentId) {
	try {
		return await fetchWithRetry(`tournament/${tournamentId}`, {
			method: "GET",
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function createCollection(name) {
	try {
		return await fetchWithRetry("collection/create", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name }),
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function fetchUserCollections() {
	try {
		return await fetchWithRetry("collections", {
			method: "GET",
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function createTournament(tournamentData) {
	try {
		return await fetchWithRetry("tournament/create", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(tournamentData),
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function joinTournament(tournamentId) {
	try {
		return await fetchWithRetry(`tournaments/${tournamentId}/join`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function leaveTournament(tournamentId) {
	try {
		return await fetchWithRetry(`tournaments/${tournamentId}/leave`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function updateScore(fixtureId, scores, status, hashId, rounds) {
	try {
		return await fetchWithRetry(`tournament/${fixtureId}/results`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
			body: JSON.stringify({ scores, status, hashId, rounds }),
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function startTournament(tournamentId) {
	try {
		return await fetchWithRetry(`tournament/${tournamentId}/start`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function deleteTournament(id, cacheId) {
	try {
		return await fetchWithRetry(`tournament/${id}`, {
			method: "DELETE",
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ cacheId }),
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		return { error: "Failed to delete tournament" };
	}
}

export async function updateTeams(tournamentId, teams) {
	try {
		return await fetchWithRetry(`tournament/${tournamentId}/updateTeams`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
			body: JSON.stringify({ teams }),
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function updateRounds(tournamentId, rounds, qualifiedTeams, standings, fixtures, currentRound) {
	try {
		return await fetchWithRetry(`tournament/${tournamentId}/updateRounds`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
			body: JSON.stringify({ rounds, qualifiedTeams, standings, fixtures, currentRound }),
		});
	} catch (error) {
		if (error.isConnectionError) {
			// showMessage("Unable to connect to server. Please try again later.", "error");
			return { error: error.message };
		}
		throw error;
	}
}

export async function endTournament(tournamentId) {
	try {
		return await fetchWithRetry(`tournament/${tournamentId}/end`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		});
	} catch (error) {
		return { error: error.message };
	}
}
