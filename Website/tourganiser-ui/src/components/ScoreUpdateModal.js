import React, { useState } from "react";
import "../styles/ScoreUpdateModal.css";

const ScoreUpdateModal = ({ fixture, onClose, onSave, onEndMatch }) => {
	const [sets, setSets] = useState([{ team1: 0, team2: 0 }]);

	const handleAddSet = () => {
		setSets([...sets, { team1: 0, team2: 0 }]);
	};

	const handleScoreChange = (setIndex, team, value) => {
		const newSets = [...sets];
		newSets[setIndex][team] = parseInt(value) || 0;
		setSets(newSets);
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(sets);
	};

	return (
		<div className="modal-overlay">
			<div className="score-modal">
				<h3>Update Score - Match #{fixture.match_no}</h3>
				<div className="teams-header">
					<span className="team-name">{fixture.team1}</span>
					<span className="vs">vs</span>
					<span className="team-name">{fixture.team2}</span>
				</div>
				<form onSubmit={handleSubmit}>
					<div className="sets-container">
						{sets.map((set, index) => (
							<div key={index} className="set-row">
								<span className="set-label">Set {index + 1}</span>
								<div className="score-inputs">
									<input
										type="number"
										min="0"
										value={set.team1}
										onChange={(e) => handleScoreChange(index, "team1", e.target.value)}
									/>
									<span className="score-separator">-</span>
									<input
										type="number"
										min="0"
										value={set.team2}
										onChange={(e) => handleScoreChange(index, "team2", e.target.value)}
									/>
								</div>
							</div>
						))}
					</div>
					<div className="modal-buttons">
						<button type="button" className="add-set-btn" onClick={handleAddSet}>
							+ Add Set
						</button>
						<div className="action-buttons">
							<button type="button" className="cancel-btn" onClick={onClose}>
								Cancel
							</button>
							<button type="submit" className="save-btn" onClick={() => onSave(sets)}>
								Save
							</button>
							<button type="button" className="end-match-btn" onClick={() => onEndMatch(sets)}>
								End Match
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
};

export default ScoreUpdateModal;
