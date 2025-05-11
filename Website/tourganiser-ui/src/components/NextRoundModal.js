import React, { useState, useEffect } from "react";
import "../styles/NextRoundModal.css";

function NextRoundModal({ standings, fixtures, onConfirm, onCancel }) {
	const [qualifiedSpots, setQualifiedSpots] = useState([]);
	const [availableTeams, setAvailableTeams] = useState([]);

	useEffect(() => {
		// Initialize qualified spots with calculated teams
		const initialQualified = getQualifiedTeams(standings);
		const allTeams = Array.isArray(standings[0]) ? standings.flat() : standings;

		setAvailableTeams(allTeams);
		setQualifiedSpots(initialQualified.map((team) => team.name));
	}, [standings]);

	function getQualifiedTeams(standings) {
		if (Array.isArray(standings[0])) {
			return standings.flatMap((pool) => pool.slice(0, 2));
		}
		return standings.slice(0, standings.length / 2);
	}

	function generateFixtures(teams) {
		const fixtures = [];
		for (let i = 0; i < teams.length; i += 2) {
			if (i + 1 < teams.length) {
				fixtures.push({
					team1: teams[i],
					team2: teams[i + 1],
				});
			}
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
		const fixtures = generateFixtures(qualifiedSpots);
		onConfirm(qualifiedSpots, fixtures);
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
