import React, { useState, useEffect } from "react";
import "../styles/ScoreUpdateModal.css";

const ScoreUpdateModal = ({ fixture, onClose, onSave, onEndMatch }) => {
	const [sets, setSets] = useState([{ team1: 0, team2: 0 }]);

	useEffect(() => {
		if (fixture.result) {
			const result = fixture.result.map((set) => ({
				team1: set[0] || 0,
				team2: set[1] || 0,
			}));
			setSets(result);
		}
	}, []);

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
				<sub>Any match ending with a score of 0-0 (1st set only) will be considered cancelled</sub>
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
							<button type="submit" className="save-btn">
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
