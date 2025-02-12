import { loadTournamentEvents } from "./src/js/tournaments.js";
import { loadAuthEvents } from "./src/js/auth.js";

const routes = {
	"/": "/src/html/home.html",
	"/about": "/src/html/about.html",
	"/login": "/src/html/login.html",
	"/tournaments": "/src/html/tournaments.html",
};

const baseURL = "http://locahost:5000";

// load initial page
// alert(location.pathname);
loadPage(location.pathname);

export function navigateTo(event, path) {
	event.preventDefault();
	history.pushState({}, "", path);
	loadPage(path);
}

function loadPage(path) {
	const page = routes[path] || routes["/"];

	fetch(page)
		.then((response) => {
			if (!response.ok) {
				throw new Error("Page not found");
			}
			return response.text();
		})
		.then((html) => {
			document.getElementById("app").innerHTML = html;
			// hide everything on page for login
			document.getElementById("header").style.display =
				path === "/login" ? "none" : "flex";
			document.getElementById("profileTab").style.display = "none";
			document.getElementById("footer").style.display =
				path === "/login" ? "none" : "block";

			runPageScripts(path);
		})
		.catch((e) => {
			console.error(e);
			document.getElementById("app").innerHTML = "<h2>Page not found</h2>";
		});
}

function runPageScripts(path) {
	if (path === "/") {
		// do nothing for now
		// add home page functions if needed
		return;
	}
	if (path === "/about") {
		// add about functions when needed
		return;
	}
	if (path === "/login") {
		// run login page scripts
		loadAuthEvents();
		return;
	}
	if (path === "/tournaments") {
		// run tournaments page scripts
		loadTournamentEvents();
		return;
	}
}

window.onpopstate = () => {
	loadPage(location.pathname);
};
