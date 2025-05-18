import React, { useState, useEffect } from "react";
import "../styles/NextRoundModal.css";

function NextRoundModal({ standings, fixtures, onConfirm, onCancel }) {
	const [qualifiedSpots, setQualifiedSpots] = useState([]);
	const [availableTeams, setAvailableTeams] = useState([]);
	const nextRound = fixtures.rounds[fixtures.currentRound + 1];
	const currentRoundStandings = standings[fixtures.currentRound].groups;

	useEffect(() => {
		// Initialize qualified spots with calculated teams
		const initialQualified = getQualifiedTeams(currentRoundStandings);
		const allTeams = Array.isArray(currentRoundStandings[0]) ? currentRoundStandings.flat() : currentRoundStandings;

		setAvailableTeams(allTeams);
		setQualifiedSpots(initialQualified.map((team) => team.name));
	}, [currentRoundStandings]);

	function getQualifiedTeams(standings) {
		let qualifiedTeams = [];
		let currentStandings = [...standings];
		for (let i = 0; i < Math.floor(nextRound.qualifyingTeams / currentStandings.length); i++) {
			currentStandings.forEach((group) => {
				qualifiedTeams.push(group[i]);
			});
		}
		currentStandings = currentStandings.slice(
			Math.floor(nextRound.qualifyingTeams / currentStandings.length) * currentStandings.length
		);

		currentStandings.flat().sort((a, b) => b.won - a.won || b.setsRatio - a.setsRatio || b.pointsRatio - a.pointsRatio);
		qualifiedTeams.push(...currentStandings.slice(0, nextRound.qualifyingTeams - qualifiedTeams.length));

		return qualifiedTeams;
	}

	function generateFixtures(teams) {
		const fixtures = [];
		const gap = nextRound.qualifyingTeams - nextRound.matches * 2;
		for (let i = gap; i < teams.length - nextRound.matches; i++) {
			const team1 = teams[i];
			const team2 = teams[teams.length - (i - gap) - 1];
			if (team1 && team2) {
				fixtures.push({ team1: team1, team2: team2 });
			}
		}
		for (let i = 0; i < gap; i++) {
			fixtures.push({ team1: teams[i], team2: "TBD" });
		}

		return fixtures;
	}

	const handleTeamSelect = (index, teamName) => {
		setQualifiedSpots((current) => {
			const updated = [...current];
			updated[index] = teamName;
			return updated;
		});
	};

	const handleConfirm = () => {
		onConfirm(qualifiedSpots);
	};

	return (
		<div className="modal-backdrop">
			<div className="next-round-modal">
				<h2>Next Round Setup</h2>
				<div className="modal-content">
					<div className="qualified-teams">
						<h3>Qualified Teams</h3>
						<div className="teams-list">
							{qualifiedSpots.map((selectedTeam, index) => {
								const teamData = availableTeams.find((t) => t.name === selectedTeam);
								return (
									<div key={index} className="team-selection">
										<label>{index + 1}.</label>
										<select
											value={selectedTeam}
											onChange={(e) => handleTeamSelect(index, e.target.value)}
											className="team-dropdown">
											{availableTeams.map((team) => (
												<option
													key={team.name}
													value={team.name}
													disabled={qualifiedSpots.includes(team.name) && team.name !== selectedTeam}>
													{team.name}
												</option>
											))}
										</select>
										{teamData && (
											<div className="team-stats">
												<span>W: {teamData.won}</span>
												<span>L: {teamData.lost}</span>
												<span>Ratio: {teamData.pointsRatio ? teamData.pointsRatio.toFixed(3) : "MAX"}</span>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
					<div className="fixture-preview">
						<h3>Next Round Fixtures</h3>
						<div className="fixtures-list">
							{generateFixtures(qualifiedSpots).map((fixture, index) => (
								<div key={index} className="preview-fixture">
									<span>{fixture.team1}</span>
									<span>vs</span>
									<span>{fixture.team2}</span>
								</div>
							))}
						</div>
					</div>
				</div>
				<div className="modal-actions">
					<button className="cancel-btn" onClick={onCancel}>
						Cancel
					</button>
					<button
						className="confirm-btn"
						onClick={handleConfirm}
						disabled={qualifiedSpots.length % 2 !== 0 || new Set(qualifiedSpots).size !== qualifiedSpots.length}>
						Start Next Round
					</button>
				</div>
			</div>
		</div>
	);
}

export default NextRoundModal;
