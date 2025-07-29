import React, { useContext, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import Icon from './Icons';
import '../App.css';

export default function TournamentCreation() {
	const [selectedOption, setSelectedOption] = useState('select');
	const { isLoggedIn } = useContext(AuthContext);

	const handleOptionSelect = (type) => {
		setSelectedOption(type);
	};

	if (!isLoggedIn) {
		return (
			<div className="signin-warning">
				<h2 className="signin-warning-heading">Sign In required</h2>
				<p className="signin-warning-info">You need to be signed in to an account to be able to create a tournament.</p>
				<p className="signin-warning-info">
					Please log into your account, or if you are new here you can create an account - it's completely free.
				</p>
				<div className="signin-warning-button">
					<Link to="/login" className="cta-button">
						Sign In
					</Link>
				</div>
			</div>
		);
	}

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
	const [tournamentData, setTournamentData] = useState({
		template: '',
		details: {
			name: '',
			date: '',
			location: '',
			description: '',
			collection: '',
		},
		structure: {
			numTeams: 0,
			numGroups: 0,
			knockoutRound: 0,
		},
		teams: [],
	});
	const [showSummary, setShowSummary] = useState(false);
	const [expandedSections, setExpandedSections] = useState(new Set([]));
	const summaryRef = useRef(null);

	const toggleContent = (index) => {
		setExpandedSections((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(index)) {
				newSet.delete(index);
			} else {
				newSet.add(index);
			}
			return newSet;
		});
	};

	const toggleSummary = () => {
		const content = summaryRef.current;

		if (!content) return;

		if (showSummary) {
			content.style.maxHeight = content.scrollHeight + 'px';
			requestAnimationFrame(() => {
				content.style.maxHeight = '40px';
			});
		} else {
			content.style.maxHeight = content.scrollHeight + 'px';
		}

		setShowSummary(!showSummary);
	};

	const selectTemplate = (template) => {
		setTournamentData((prev) => {
			return { ...prev, template: template };
		});
	};

	return (
		<>
			<h2 className="create-form-heading">Create Tournament from Template</h2>
			<div className="create-form-container">
				<div className="create-form-inputs">
					<div className="create-form-input-section">
						{expandedSections.has(0) ? (
							<Icon name={'doubleArrowUp'} className="create-form-input-expand" onClick={() => toggleContent(0)} />
						) : (
							<Icon name={'doubleArrowDown'} className="create-form-input-expand" onClick={() => toggleContent(0)} />
						)}
						<div
							className={`input-section-expandable ${expandedSections.has(0) ? 'active' : ''}`}
							onClick={() => toggleContent(0)}>
							Choose Template
						</div>
						<div className={`input-section-expandable-content ${expandedSections.has(0) ? 'expand' : ''}`}>
							<div className="create-form-template-cards">
								<div
									className={`create-form-template-card ${
										tournamentData['template'] === 'Single Elimination' ? 'active' : ''
									}`}
									onClick={() => selectTemplate('Single Elimination')}>
									Single Elimination
								</div>
								<div
									className={`create-form-template-card ${tournamentData['template'] === 'League' ? 'active' : ''}`}
									onClick={() => selectTemplate('League')}>
									League
								</div>
								<div
									className={`create-form-template-card ${tournamentData['template'] === 'Classic' ? 'active' : ''}`}
									onClick={() => selectTemplate('Classic')}>
									Classic
								</div>
							</div>
						</div>
					</div>
					<div className="create-form-input-section">
						{expandedSections.has(1) ? (
							<Icon name={'doubleArrowUp'} className="create-form-input-expand" onClick={() => toggleContent(1)} />
						) : (
							<Icon name={'doubleArrowDown'} className="create-form-input-expand" onClick={() => toggleContent(1)} />
						)}
						<div
							className={`input-section-expandable ${expandedSections.has(1) ? 'active' : ''}`}
							onClick={() => toggleContent(1)}>
							Tournament Details
						</div>
						<div className={`input-section-expandable-content ${expandedSections.has(1) ? 'expand' : ''}`}></div>
					</div>
					<InputSection
						title={'Test'}
						fields={[{ type: 'template-card', name: 'template' }]}
						index={2}
						toggleContent={toggleContent}
						expandedSections={expandedSections}
						updateAction={() => {}}
						tournamentData={tournamentData}
					/>
				</div>
			</div>
			<div className="create-form-floating-actions-bar">
				<div className={`create-form-progress`} ref={summaryRef}>
					<div className="create-form-progress-expandable" onClick={toggleSummary}>
						<Icon name={showSummary ? 'doubleArrowDown' : 'doubleArrowUp'} className="create-form-progress-expand" />
						<h3>Summary</h3>
						<Icon name={showSummary ? 'doubleArrowDown' : 'doubleArrowUp'} className="create-form-progress-expand" />
					</div>
					<div className={`create-form-progress-summary`}>
						<SummaryPage fields={tournamentData} />
					</div>
				</div>
				<div className="create-form-floating-actions">
					<div className="create-form-floating-action secondary" onClick={goBack}>
						Back
					</div>
					<div className="create-form-floating-action-group">
						<div className="create-form-floating-action tertiary">Reset</div>
						<div className="create-form-floating-action">Submit</div>
					</div>
				</div>
			</div>
		</>
	);
}

function InputSection({ title, fields, index, toggleContent, expandedSections, updateAction, tournamentData }) {
	const generateFields = () => {
		return fields.map((field, i) => {
			if (field.type == 'template-card') {
				return (
					<div
						key={`${index}${i}`}
						className={`input-section-expandable-content ${expandedSections.has(index) ? 'expand' : ''}`}>
						{generateTemplateCards()}
					</div>
				);
			}
		});
	};

	const generateTemplateCards = () => {
		return (
			<div className="create-form-template-cards">
				<div
					className={`create-form-template-card ${tournamentData['template'] === 'Single Elimination' ? 'active' : ''}`}
					onClick={() => updateAction('Single Elimination')}>
					Single Elimination
				</div>
				<div
					className={`create-form-template-card ${tournamentData['template'] === 'League' ? 'active' : ''}`}
					onClick={() => updateAction('League')}>
					League
				</div>
				<div
					className={`create-form-template-card ${tournamentData['template'] === 'Classic' ? 'active' : ''}`}
					onClick={() => updateAction('Classic')}>
					Classic
				</div>
			</div>
		);
	};

	const generateTextInput = (field) => {};

	const generateNumericInput = (field) => {};

	const generateSelectionInput = (field) => {};

	const generateDateInput = (field) => {};

	// console.log(generateFields());

	return (
		<div className="create-form-input-section">
			{expandedSections.has(index) ? (
				<Icon name={'doubleArrowUp'} className="create-form-input-expand" onClick={() => toggleContent(index)} />
			) : (
				<Icon name={'doubleArrowDown'} className="create-form-input-expand" onClick={() => toggleContent(index)} />
			)}
			<div
				className={`input-section-expandable ${expandedSections.has(index) ? 'active' : ''}`}
				onClick={() => toggleContent(index)}>
				{title}
			</div>
			{generateFields()}
		</div>
	);
}

function SummaryPage({ fields }) {
	return (
		<div className="new-tournament-summary">
			{fields['template'] && (
				<div className="new-tournament-summary-section">
					<h3>Chosen Template</h3>
					<p>{fields['template']}</p>
				</div>
			)}
			{fields['details'] && (
				<div className="new-tournament-summary-section">
					<h3>Tournament Details</h3>
					<p>Name: {fields['details']['name']}</p>
					<p>Date: {fields['details']['date']}</p>
					<p>Location: {fields['details']['location']}</p>
					{fields['details']['description'] && <p>Description: {fields['details']['description']}</p>}
					<p>Collection: {fields['details']['collection'] || 'None'}</p>
				</div>
			)}
			{fields['structure'] && (
				<div className="new-tournament-summary-section">
					<h3>Tournament Structure</h3>
					<p>Number of teams: {fields['structure']['numTeams']}</p>
					{fields['structure']['numGroups'] > 0 && <p>Number of groups: {fields['structure']['numGroups']}</p>}
					{fields['structure']['knockoutRound'] > 0 && (
						<p>First knockout round: {fields['structure']['knockoutRound']}</p>
					)}
				</div>
			)}
		</div>
	);
}
