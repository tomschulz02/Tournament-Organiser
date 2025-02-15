/* filepath: /js/tournaments.js */
let currentSlide = 0;
let slides = 0;

export function loadTournamentEvents() {
	const form = document.getElementById("tournament-form");
	slides = document.querySelectorAll(".form-slide");
	const nextBtn = document.getElementById("nextBtn");
	const prevBtn = document.getElementById("prevBtn");
	const submitBtn = document.getElementById("submitBtn");
	const steps = document.querySelectorAll(".step");

	nextBtn.addEventListener("click", () => {
		if (currentSlide === 0) {
			// if (!validateFirstSlide()) return; // Stop if validation fails
		}
		if (currentSlide === 1) {
			// if (!validateSecondSlide()) return;
			// automatically add appropriate number of teams to team slide after submitting second slide
			const teams = document.getElementById("teamCount").value;
			populateTeamlist(teams);
		}
		if (currentSlide === 2) {
			// if (!validateThirdSlide()) return;
		}

		if (currentSlide < slides.length - 1) {
			slides[currentSlide].classList.remove("active");
			slides[currentSlide + 1].classList.add("active");
			steps[currentSlide + 1].classList.add("active");
			currentSlide++;
			updateButtons();
		}
	});

	prevBtn.addEventListener("click", () => {
		if (currentSlide > 0) {
			slides[currentSlide].classList.remove("active");
			slides[currentSlide - 1].classList.add("active");
			steps[currentSlide].classList.remove("active");
			currentSlide--;
			updateButtons();
		}
	});

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		// Add form submission logic here
		console.log("Form submitted");
	});

	let format = document.getElementById("format");
	let options = Array.from(format.options).map((option) => option.value);
	// options will contain: ['single', 'double', 'round', 'combi']
	let selectedFormat = format.value;
	showMoreFormatOptions(selectedFormat);

	// hide all descriptions but the default selected one
	options.forEach((opt) => {
		document.getElementById(opt).style.display = "none";
	});
	document.getElementById(selectedFormat).style.display = "block";

	format.addEventListener("change", () => {
		selectedFormat = format.value;
		// console.log(selectedFormat === "combi");
		// hide all descriptions but the selected one
		options.forEach((opt) => {
			document.getElementById(opt).style.display = "none";
		});
		document.getElementById(selectedFormat).style.display = "block";

		// if the selected format is 'combi', show the combi options
		showMoreFormatOptions(selectedFormat);
	});

	// format.addEventListener("focus", () => {
	// 	showMoreFormatOptions(selectedFormat);
	// });

	// Tab switching logic
	const tabButtons = document.querySelectorAll(".tab-btn");
	const tabContents = document.querySelectorAll(".tab-content");

	tabButtons.forEach((button) => {
		button.addEventListener("click", () => {
			// Remove active class from all buttons and contents
			tabButtons.forEach((btn) => btn.classList.remove("active"));
			tabContents.forEach((content) => content.classList.remove("active"));

			// Add active class to clicked button and corresponding content
			button.classList.add("active");
			const tabId = button.getAttribute("data-tab");
			document.getElementById(`${tabId}-tab`).classList.add("active");
		});
	});

	// Search functionality
	const searchInput = document.getElementById("searchTournaments");
	const formatFilter = document.getElementById("filterFormat");

	searchInput.addEventListener("input", filterTournaments);
	formatFilter.addEventListener("change", filterTournaments);

	// Tab switching functionality
	document.querySelectorAll(".view-tab-btn").forEach((button) => {
		button.addEventListener("click", () => {
			// Remove active class from all buttons and panes
			document
				.querySelectorAll(".view-tab-btn")
				.forEach((btn) => btn.classList.remove("active"));
			document
				.querySelectorAll(".tab-pane")
				.forEach((pane) => pane.classList.remove("active"));

			// Add active class to clicked button and corresponding pane
			button.classList.add("active");
			const tabId = button.getAttribute("data-tab");
			document.getElementById(tabId).classList.add("active");
		});
	});

	document.querySelectorAll(".join-btn").forEach((button) => {
		button.addEventListener("click", () => {
			openPopup(button.name);
		});
	});

	document
		.getElementById("closeTournamentPopup")
		.addEventListener("click", () => {
			closePopup();
		});

	const teams = document.getElementById("teamCount");
	teams.addEventListener("focusout", () => {
		changeKnockoutOptions(teams.value);
	});

	document.getElementById("volleyballType").addEventListener("change", () => {
		updateSetOptions(
			document.querySelector('input[name="volleyballType"]:checked')?.value
		);
	});

	// add event to edit icons on team view slide to open name change popup
	const edits = document.getElementsByClassName("edit-team-name");
	for (let index = 1; index <= edits.length; index++) {
		const element = edits.item(index - 1);
		element.addEventListener("click", () => {
			openNameChangePopup(index);
		});
	}

	// name change submit function
	document.getElementById("nameChangeForm").addEventListener("submit", (e) => {
		e.preventDefault();

		const names = document.getElementsByClassName("team-name");
		const index = parseInt(
			document.getElementById("nameChangeTeamRank").innerHTML,
			10
		);
		names.item(index - 1).innerHTML =
			document.getElementById("newTeamName").value;

		closeNameChangePopup();
	});

	document
		.getElementById("closeNameChangePopup")
		.addEventListener("click", () => {
			closeNameChangePopup();
		});
}

function showMoreFormatOptions(type) {
	if (type === "combi") {
		document.getElementById("groupCount").classList.toggle("hidden");
		document.getElementById("knockout").classList.toggle("hidden");
		document.getElementById("numGroups").toggleAttribute("required");
		document.getElementById("knockoutRound").toggleAttribute("required");
	} else {
		document.getElementById("groupCount").classList.toggle("hidden");
		document.getElementById("knockout").classList.toggle("hidden");
		document.getElementById("numGroups").toggleAttribute("required");
		document.getElementById("knockoutRound").toggleAttribute("required");
	}
}

function populateTeamlist(count) {
	const list = document.getElementById("teamList");
	for (let index = 0; index < count; index++) {
		let team = document.createElement("div");
		team.innerHTML = "Team " + (index + 1);
		list.appendChild(team);
	}
}

function openPopup(tournamentId) {
	document.getElementById("tournamentPopup").style.display = "block";
	// Load tournament data based on tournamentId
	loadTournamentData(tournamentId);
}

function closePopup() {
	const popup = document.getElementById("tournamentPopup");
	popup.classList.add("closing");

	// Wait for animation to complete before hiding
	setTimeout(() => {
		popup.style.display = "none";
		popup.classList.remove("closing");
	}, 480); // Match animation duration
}

function loadTournamentData(tournamentId) {
	// TODO: load tournament data based on tournamentId
	// console.log(tournamentId);
}

// Tab switching functionality
document.querySelectorAll(".view-tab-btn").forEach((button) => {
	button.addEventListener("click", () => {
		// Remove active class from all buttons and panes
		document
			.querySelectorAll(".view-tab-btn")
			.forEach((btn) => btn.classList.remove("active"));
		document
			.querySelectorAll(".tab-pane")
			.forEach((pane) => pane.classList.remove("active"));

		// Add active class to clicked button and corresponding pane
		button.classList.add("active");
		const tabId = button.getAttribute("data-tab");
		document.getElementById(tabId).classList.add("active");
	});
});

// Close popup when clicking outside
window.addEventListener("click", (e) => {
	if (e.target === document.getElementById("tournamentPopup")) {
		closePopup();
	}
});

function validateFirstSlide() {
	const tournamentName = document.getElementById("tournamentName").value;
	const startDate = document.getElementById("startDate").value;
	const location = document.getElementById("location").value;

	// Check if required fields are filled
	if (!tournamentName || !startDate || !location) {
		// Add error class to empty required fields
		if (!tournamentName)
			document.getElementById("tournamentName").classList.add("error");
		if (!startDate) document.getElementById("startDate").classList.add("error");
		if (!location) document.getElementById("location").classList.add("error");
		return false;
	}

	return true;
}

function validateSecondSlide() {
	const format = document.getElementById("format").value;
	const teams = document.getElementById("teamCount").value;
	const groups = document.getElementById("numGroups").value;

	if (format === "combi") {
		if (!teams || !groups) {
			if (!teams) document.getElementById("teamCount").classList.add("error");
			if (!groups) document.getElementById("numGroups").classList.add("error");
			return false;
		}
	} else {
		if (!teams) {
			document.getElementById("teamCount").classList.add("error");
			return false;
		}
	}

	return true;
}

function validateThirdSlide() {
	const indoor = document.getElementById("indoor").checked;
	const beach = document.getElementById("beach").checked;

	console.log(indoor);
	console.log(beach);

	if (!beach && !indoor) {
		document.getElementById("volleyballType").classList.add("error");
		return false;
	}

	return true;
}

function updateButtons() {
	prevBtn.style.display = currentSlide === 0 ? "none" : "block";
	nextBtn.style.display = currentSlide === slides.length - 1 ? "none" : "block";
	submitBtn.style.display =
		currentSlide === slides.length - 1 ? "block" : "none";
}

function filterTournaments() {
	// Add tournament filtering logic here
}

function changeKnockoutOptions(amount) {
	const rounds = document.getElementById("knockoutRound").options;
	const numTeams = parseInt(amount, 10); // Convert amount to number
	let highest = 1;

	for (let round of rounds) {
		const roundValue = parseInt(round.value, 10); // Convert option value to number
		round.disabled = roundValue * 2 >= numTeams;

		if (!round.disabled && roundValue > highest) highest = roundValue;
	}

	document.getElementById("knockoutRound").value = highest.toString();
}

function updateSetOptions(volleyballType) {
	const select = document.getElementById("numSets");
	const options = select.options;

	for (let option of options) {
		// For example, disable 5-set games for beach volleyball
		if (volleyballType === "beach" && option.value === "5") {
			option.disabled = true;
			select.value = "3";
		} else {
			option.disabled = false;
		}
	}
}

function openNameChangePopup(rank) {
	// fetch element with current team name to display on popup and change on submit
	const teamName = document.getElementsByClassName("team-name").item(rank - 1);
	console.log(teamName);
	document.getElementById("currentTeamName").value = teamName.innerHTML;
	// update rank displayed on popup
	document.getElementById("nameChangeTeamRank").innerHTML = rank;
	document.getElementById("teamNameChangePopup").style.display = "flex";
}

function closeNameChangePopup() {
	document.getElementById("teamNameChangePopup").style.display = "none";
}
