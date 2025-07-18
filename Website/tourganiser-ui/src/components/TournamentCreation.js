import React, { useState } from 'react';
import '../styles/TournamentCreation.css';

export default function TournamentCreation() {
	const [selectedOption, setSelectedOption] = useState('select');

	const handleOptionSelect = (type) => {
		setSelectedOption(type);
	};

	return (
		<>
			{selectedOption === 'select' && (
				<div className="creation-container">
					<h2>Create Tournament</h2>
					<div className="creation-options">
						<div className="creation-option" onClick={() => handleOptionSelect('template')}>
							<svg className="option-icon" viewBox="0 0 24 24">
								<path d="M19,3H5C3.89,3 3,3.89 3,5V19C3,20.11 3.89,21 5,21H19C20.11,21 21,20.11 21,19V5C21,3.89 20.11,3 19,3M19,19H5V5H19V19M17,17H7V7H17V17M15,15H9V9H15V15M13,13H11V11H13V13Z" />
							</svg>
							<h3>Use Template</h3>
							<p>Choose from pre-configured tournament formats for quick setup</p>
						</div>

						<div className="creation-option disabled" title="Coming Soon!">
							<div className="coming-soon-badge">Coming Soon</div>
							<svg className="option-icon" viewBox="0 0 24 24">
								<path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
							</svg>
							<h3>Custom Tournament</h3>
							<p>Create a tournament with your own custom settings and format</p>
						</div>
					</div>
				</div>
			)}
			{selectedOption === 'template' && <CreateFromTemplate goBack={() => setSelectedOption('select')} />}
		</>
	);
}

function CreateFromTemplate({ goBack }) {
	const [expandedSections, setExpandedSections] = useState({
		details: true,
		format: false,
		teams: false,
	});
	const [formData, setFormData] = useState({
		name: '',
		date: '',
		location: '',
		description: '',
		format: '',
		groupCount: 2,
		firstKnockoutRound: '16',
		teams: [],
	});

	const toggleSection = (section) => {
		setExpandedSections((prev) => ({
			...prev,
			[section]: !prev[section],
		}));
	};

	const handleInputChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	const handleAddTeam = () => {
		setFormData((prev) => ({
			...prev,
			teams: [...prev.teams, { name: '', seed: prev.teams.length + 1 }],
		}));
	};

	const handleTeamChange = (index, value) => {
		const updatedTeams = [...formData.teams];
		updatedTeams[index].name = value;
		setFormData((prev) => ({
			...prev,
			teams: updatedTeams,
		}));
	};

	const handleRemoveTeam = (index) => {
		setFormData((prev) => ({
			...prev,
			teams: prev.teams.filter((_, i) => i !== index),
		}));
	};

	return (
		<div className="template-form">
			<div className="form-section">
				<div
					className={`section-header ${expandedSections.details ? 'active' : ''}`}
					onClick={() => toggleSection('details')}>
					<h3>Tournament Details</h3>
					<span className="toggle-icon">▼</span>
				</div>
				<div className={`section-content ${expandedSections.details ? 'expanded' : ''}`}>
					<div className="form-group">
						<label htmlFor="name">Tournament Name *</label>
						<input type="text" id="name" name="name" value={formData.name} onChange={handleInputChange} required />
					</div>
					<div className="form-group">
						<label htmlFor="date">Date *</label>
						<input type="date" id="date" name="date" value={formData.date} onChange={handleInputChange} required />
					</div>
					<div className="form-group">
						<label htmlFor="location">Location *</label>
						<input
							type="text"
							id="location"
							name="location"
							value={formData.location}
							onChange={handleInputChange}
							required
						/>
					</div>
					<div className="form-group">
						<label htmlFor="description">Description</label>
						<textarea
							id="description"
							name="description"
							value={formData.description}
							onChange={handleInputChange}
							rows="4"
						/>
					</div>
				</div>
			</div>

			<div className="form-section">
				<div
					className={`section-header ${expandedSections.format ? 'active' : ''}`}
					onClick={() => toggleSection('format')}>
					<h3>Tournament Format</h3>
					<span className="toggle-icon">▼</span>
				</div>
				<div className={`section-content ${expandedSections.format ? 'expanded' : ''}`}>
					<div className="form-group">
						<label htmlFor="format">Format Template *</label>
						<select id="format" name="format" value={formData.format} onChange={handleInputChange} required>
							<option value="">Select a format</option>
							<option value="groups">Groups + Knockout</option>
							<option value="knockout">Single Elimination</option>
							<option value="swiss">Swiss System</option>
						</select>
					</div>
					<div className="form-group">
						<label htmlFor="groupCount">Number of Groups</label>
						<select id="groupCount" name="groupCount" value={formData.groupCount} onChange={handleInputChange}>
							{[2, 4, 8].map((num) => (
								<option key={num} value={num}>
									{num}
								</option>
							))}
						</select>
					</div>
					<div className="form-group">
						<label htmlFor="firstKnockoutRound">First Knockout Round</label>
						<select
							id="firstKnockoutRound"
							name="firstKnockoutRound"
							value={formData.firstKnockoutRound}
							onChange={handleInputChange}>
							<option value="16">Round of 16</option>
							<option value="8">Quarter Finals</option>
							<option value="4">Semi Finals</option>
						</select>
					</div>
				</div>
			</div>

			<div className="form-section">
				<div
					className={`section-header ${expandedSections.teams ? 'active' : ''}`}
					onClick={() => toggleSection('teams')}>
					<h3>Teams</h3>
					<span className="toggle-icon">▼</span>
				</div>
				<div className={`section-content ${expandedSections.teams ? 'expanded' : ''}`}>
					<div className="teams-list">
						{formData.teams.map((team, index) => (
							<div className="team-entry" key={index}>
								<span className="team-number">{index + 1}</span>
								<input
									type="text"
									value={team.name}
									onChange={(e) => handleTeamChange(index, e.target.value)}
									placeholder="Enter team name"
								/>
								<button
									type="button"
									className="remove-team-btn"
									onClick={() => handleRemoveTeam(index)}
									title="Remove team">
									x
								</button>
							</div>
						))}
					</div>
					<button type="button" className="add-team-btn" onClick={handleAddTeam}>
						Add Team
					</button>
				</div>
			</div>

			<div className="form-actions">
				<button type="button" className="back-btn" onClick={goBack}>
					Back
				</button>
				<button type="submit" className="create-btn">
					Create Tournament
				</button>
			</div>
		</div>
	);
}
