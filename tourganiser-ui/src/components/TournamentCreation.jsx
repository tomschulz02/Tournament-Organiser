import { useContext, useState} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { useMessage } from '../MessageContext';
import Icon from './Icons';
import LoadingScreen from './LoadingScreen';
import { createTournament } from '../requests';
import '../App.css';

export default function TournamentCreation() {
	const { isLoggedIn } = useContext(AuthContext);

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

	return <CreateTournamentForm />;
}

function CreateTournamentForm() {
	const [tournamentData, setTournamentData] = useState({
		details: {
			name: '',
			location: '',
			start_date: '',
			end_date: '',
			description: '',
		},
		divisions: [],
	});

	const [errors, setErrors] = useState({});
	const [expandedDivisions, setExpandedDivisions] = useState(new Set());
	const [loading, setLoading] = useState(false);
	const { showMessage } = useMessage();
	const navigate = useNavigate();
	const [showSummary, setShowSummary] = useState(false);

	const calculateMatchCount = (format, teamCount, numGroups = 0, knockoutTeams = 0) => {
		if (format === 'Round Robin') {
			return (teamCount * (teamCount - 1)) / 2;
		} else if (format === 'Single Elimination') {
			const firstRound = Math.pow(2, Math.floor(Math.log2(teamCount)));
			const qualifyingRound = 2 * (teamCount - firstRound);
			return (firstRound - 1) + (qualifyingRound / 2);
		} else if (format === 'Groups + Knockout') {
			const groups = getGroupDistribution(teamCount, numGroups);
			const firstRound = Math.pow(2, Math.floor(Math.log2(knockoutTeams)));
			const qualifyingRound = 2 * (knockoutTeams - firstRound);
			let matchCount = 0;

			for (let group of groups){
				matchCount += (group * (group - 1)) / 2;
			}
		
			if (knockoutTeams > 1){
				matchCount += (firstRound - 1) + (qualifyingRound / 2);
			}

			return matchCount;
		}
		return 0;
	};

	const getGroupDistribution = (numTeams, numGroups) => {
		const groupSizes = Array(numGroups).fill(0);

		for (let team = 0; team < numTeams; team++) {
			const row = Math.floor(team / numGroups);
			const position = team % numGroups;

			const groupIndex =
				row % 2 === 0
					? position
					: numGroups - 1 - position;

			groupSizes[groupIndex]++;
		}

		return groupSizes;
	};

	const getSingleElimRounds = (teamCount) => {
		const rounds = [];
		const pow = Math.floor(Math.log2(teamCount));
		const nearest = Math.pow(2, pow);
		const byes = 2 * nearest - teamCount;

		if (teamCount - byes > 0) {
			rounds.push({ name: `Qualification`, matches: (teamCount - byes) / 2 });
		}

		let stage = nearest;
		while (stage > 1) {
			stage = stage / 2;
			rounds.push({ name: stage === 1 ? 'Final' : stage === 2 ? 'Semifinals' : stage === 4 ? 'Quarterfinals' : `Round of ${stage * 2}`, matches: stage });
		}
		return rounds;
	};

	const calculateProgress = () => {
		let total = 4;
		let completed = 0;

		if (tournamentData.details.name) completed++;
		if (tournamentData.details.start_date) completed++;
		if (tournamentData.details.end_date) completed++;
		if (tournamentData.divisions.length > 0) completed++;

		if (tournamentData.divisions.length > 0) {
			const divisionsTotal = tournamentData.divisions.length * 3;
			total += divisionsTotal;

			tournamentData.divisions.forEach((d) => {
				if (d.name) completed++;
				if (d.format) completed++;
				if (d.teams && d.teams.length >= 2) completed++;
			});
		}

		return Math.round((completed / total) * 100);
	};

	const addDivision = () => {
		const newDivision = {
			id: Date.now(),
			name: '',
			format: 'Round Robin',
			teams: [],
			num_groups: 2,
			knockout_teams: 2,
		};
		setTournamentData((prev) => ({
			...prev,
			divisions: [...prev.divisions, newDivision],
		}));
		setExpandedDivisions((prev) => new Set([...prev, newDivision.id]));
	};

	const removeDivision = (id) => {
		setTournamentData((prev) => ({
			...prev,
			divisions: prev.divisions.filter((d) => d.id !== id),
		}));
		setExpandedDivisions((prev) => {
			const updated = new Set(prev);
			updated.delete(id);
			return updated;
		});
	};

	const updateDivision = (id, updates) => {
		setTournamentData((prev) => ({
			...prev,
			divisions: prev.divisions.map((d) => (d.id === id ? { ...d, ...updates } : d)),
		}));
	};

	const toggleDivisionExpanded = (id) => {
		setExpandedDivisions((prev) => {
			const updated = new Set(prev);
			if (updated.has(id)) {
				updated.delete(id);
			} else {
				updated.add(id);
			}
			return updated;
		});
	};

	const addTeam = (divisionId) => {
		const division = tournamentData.divisions.find((d) => d.id === divisionId);
		if (division) {
			const teamNumber = division.teams.length + 1;
			updateDivision(divisionId, {
				teams: [...division.teams, { name: `Team ${teamNumber}` }],
			});
		}
	};

	const removeTeam = (divisionId, teamIndex) => {
		const division = tournamentData.divisions.find((d) => d.id === divisionId);
		if (division) {
			updateDivision(divisionId, {
				teams: division.teams.filter((_, i) => i !== teamIndex),
			});
		}
	};

	const updateTeam = (divisionId, teamIndex, name) => {
		const division = tournamentData.divisions.find((d) => d.id === divisionId);
		if (division) {
			const updatedTeams = [...division.teams];
			updatedTeams[teamIndex] = { ...updatedTeams[teamIndex], name };
			updateDivision(divisionId, { teams: updatedTeams });
		}
	};

	const toggleSummary = () => {
		if (showSummary) {
			document.body.classList.remove('noscroll');
		} else {
			document.body.classList.add('noscroll');
		}
		setShowSummary(!showSummary);
	};

	const validateTournament = () => {
		const newErrors = {};

		if (!tournamentData.details.name || tournamentData.details.name.trim().length === 0) {
			newErrors.name = 'Tournament name is required';
		}
		if (tournamentData.details.name.length > 50) {
			newErrors.name = 'Input for tournament name is too long (50 Character Limit)';
		}
		if (!tournamentData.details.start_date) {
			newErrors.start_date = 'Start date is required';
		}
		if (!tournamentData.details.end_date) {
			newErrors.end_date = 'End date is required';
		}
		if (tournamentData.divisions.length === 0) {
			newErrors.divisions = 'At least one division is required';
		}
		if (!tournamentData.details.location || tournamentData.details.location.trim().length === 0){
			newErrors.location = 'Location is required';
		}
		// tournaments.location is varchar(50), so an oversized value is a 500 from
		// Postgres rather than a validation failure. The error belongs on the
		// location field; it used to be written to newErrors.name.
		if (tournamentData.details.location.length>50){
			newErrors.location = 'Input for location is too long (50 Character Limit)';
		}

		tournamentData.divisions.forEach((div, idx) => {
			if (!div.name || div.name.trim().length === 0) {
				newErrors[`division_${idx}_name`] = 'Division name is required';
			}
			if (!div.format) {
				newErrors[`division_${idx}_format`] = 'Format is required';
			}
			if (!div.teams || div.teams.length < 2) {
				newErrors[`division_${idx}_teams`] = 'At least 2 teams are required';
			}
			if (div.format === 'Groups + Knockout' && (!div.num_groups || div.num_groups < 1)) {
				newErrors[`division_${idx}_groups`] = 'Number of groups is required';
			}
		});

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const generatePayload = () => {
		return {
			details: {
				name: tournamentData.details.name,
				location: tournamentData.details.location,
				start_date: tournamentData.details.start_date,
				end_date: tournamentData.details.end_date,
				description: tournamentData.details.description,
			},
			divisions: tournamentData.divisions.map((div) => ({
				name: div.name,
				type: div.format === 'Round Robin' ? 'league' : div.format === 'Single Elimination' ? 'single_elim' : div.format === 'Groups + Knockout' ? 'classic' : 'undefined',
				num_teams: div.teams.length,
				num_groups: div.format === 'Groups + Knockout' ? div.num_groups : undefined,
				knockout_teams: div.format === 'Groups + Knockout' ? div.knockout_teams : undefined,
				teams: div.teams.map((team) => ({
					name: typeof team === 'string' ? team : team.name,
					...(team.id && { id: team.id }),
				})),
			})),
		};
	};

	const submitTournament = async () => {
		if (!validateTournament()) {
			showMessage('Please fix errors before submitting', 'error');
			return;
		}

		setLoading(true);
		try {
			const payload = generatePayload();
			// 201 with data: { id }. request throws on failure, so reaching this
			// line is the success case — there is no result.success to test.
			const { data } = await createTournament(payload);

			showMessage('Tournament created successfully', 'success');
			// Straight to the new tournament, the same route Browse uses. No
			// delay: the toast outlives the route change on its own, and landing
			// on the tournament is the confirmation. Replacing the entry keeps
			// the back button off the filled-in form.
			navigate(`/tournaments/view/${data.id}`, { replace: true });
		} catch (error) {
			showMessage(error.message, 'error');
		} finally {
			setLoading(false);
		}
	};

	const handleReset = () => {
		setTournamentData({
			details: {
				name: '',
				location: '',
				start_date: '',
				end_date: '',
				description: '',
			},
			divisions: [],
		});
		setErrors({});
		setExpandedDivisions(new Set());
	};

	return (
		<>
			{loading && <LoadingScreen />}
			<h2 className="create-form-heading">Create Tournament</h2>

			<div className="create-form-container">
				<div className="create-form-inputs">
					<TournamentDetailsSection tournamentData={tournamentData} setTournamentData={setTournamentData} errors={errors} />

					<DivisionsSection
						divisions={tournamentData.divisions}
						expandedDivisions={expandedDivisions}
						onToggleExpanded={toggleDivisionExpanded}
						onAddDivision={addDivision}
						onRemoveDivision={removeDivision}
						onUpdateDivision={updateDivision}
						onAddTeam={addTeam}
						onRemoveTeam={removeTeam}
						onUpdateTeam={updateTeam}
						calculateMatchCount={calculateMatchCount}
						getGroupDistribution={getGroupDistribution}
						getSingleElimRounds={getSingleElimRounds}
						errors={errors}
					/>

					<TournamentSummarySection
						divisions={tournamentData.divisions}
						calculateMatchCount={calculateMatchCount}
					/>
				</div>
			</div>

			<div className="create-form-floating-actions-bar">
				<div className="tournament-creation-progress-bar-floating">
					<div className="tournament-creation-progress-fill" style={{ width: `${calculateProgress()}%` }}></div>
					<span className="tournament-creation-progress-text">{calculateProgress()}%</span>
				</div>
				<div className="create-form-floating-actions">
					<div className="create-form-floating-action tertiary" onClick={handleReset}>
						Reset
					</div>
					<div className="create-form-floating-action" onClick={submitTournament}>
						Submit
					</div>
				</div>
			</div>

			<div
				className={`create-form-progress-summary-filter ${showSummary ? 'active' : ''}`}
				onClick={toggleSummary}></div>
		</>
	);
}

function TournamentDetailsSection({ tournamentData, setTournamentData, errors }) {
	const handleInputChange = (e) => {
		const { id, value } = e.target;
		setTournamentData((prev) => ({
			...prev,
			details: {
				...prev.details,
				[id]: value,
			},
		}));
	};

	const fields = [
		// maxLength stops the field exceeding what the column accepts as it is
		// typed. The validator still checks, since this only guards the input.
		{ id: 'name', label: 'Tournament Name *', type: 'text', required: true, maxLength: 50 },
		{ id: 'location', label: 'Location *', type: 'text', required: true, maxLength: 50 },
		{ id: 'start_date', label: 'Start Date *', type: 'date', required: true },
		{ id: 'end_date', label: 'End Date *', type: 'date', required: true },
		{ id: 'description', label: 'Description', type: 'textarea', required: false },
	];

	return (
		<div className="create-form-input-section">
			<div className="input-section-expandable active">Tournament Details</div>
			<div className="input-section-expandable-content expand">
				{fields.map((field) => (
					<div key={field.id} className={`create-form-input-element ${errors[field.id] ? 'error' : ''}`}>
						{field.type === 'textarea' ? (
							<textarea
								id={field.id}
								value={tournamentData.details[field.id]}
								onChange={handleInputChange}
								className="create-form-input-element-type text"
								placeholder=" "></textarea>
						) : (
							<input
								type={field.type}
								id={field.id}
								value={tournamentData.details[field.id]}
								onChange={handleInputChange}
								className="create-form-input-element-type"
								placeholder=" "
								required={field.required}
								maxLength={field.maxLength}
								min={field.type === 'date' ? new Date().toISOString().split('T')[0] : undefined}
							/>
						)}
						<label htmlFor={field.id}>{field.label}</label>
						{errors[field.id] && <div className="create-form-input-element-error">{errors[field.id]}</div>}
					</div>
				))}
			</div>
		</div>
	);
}

function DivisionsSection({
	divisions,
	expandedDivisions,
	onToggleExpanded,
	onAddDivision,
	onRemoveDivision,
	onUpdateDivision,
	onAddTeam,
	onRemoveTeam,
	onUpdateTeam,
	calculateMatchCount,
	getGroupDistribution,
	getSingleElimRounds,
	errors,
}) {
	return (
		<div className="create-form-input-section">
			<div className="input-section-expandable active">Divisions</div>
			<div className="input-section-expandable-content expand">
				{divisions.length === 0 ? (
					<div className="divisions-empty-state">
						<p>No divisions added yet. Create your first division to get started.</p>
					</div>
				) : (
					divisions.map((division) => (
						<DivisionCard
							key={division.id}
							division={division}
							isExpanded={expandedDivisions.has(division.id)}
							onToggleExpanded={() => onToggleExpanded(division.id)}
							onRemove={() => onRemoveDivision(division.id)}
							onUpdate={(updates) => onUpdateDivision(division.id, updates)}
							onAddTeam={() => onAddTeam(division.id)}
							onRemoveTeam={(idx) => onRemoveTeam(division.id, idx)}
							onUpdateTeam={(idx, name) => onUpdateTeam(division.id, idx, name)}
							calculateMatchCount={calculateMatchCount}
							getGroupDistribution={getGroupDistribution}
							getSingleElimRounds={getSingleElimRounds}
							errors={errors}
						/>
					))
				)}

				<button className="add-division-button" onClick={onAddDivision}>
					+ Add Division
				</button>
			</div>
		</div>
	);
}

function DivisionCard({
	division,
	isExpanded,
	onToggleExpanded,
	onRemove,
	onUpdate,
	onAddTeam,
	onRemoveTeam,
	onUpdateTeam,
	calculateMatchCount,
	getGroupDistribution,
	getSingleElimRounds,
	errors,
}) {
	const matchCount = calculateMatchCount(division.format, division.teams.length, division.num_groups);

	return (
		<div className="division-card">
			<div className="division-card-header" onClick={onToggleExpanded}>
				<div className="division-card-header-info">
					<h4>{division.name || 'Unnamed Division'}</h4>
					<span className="division-card-format">{division.format}</span>
					<span className="division-card-teams">{division.teams.length} teams</span>
					<span className="division-card-matches">{matchCount} matches</span>
				</div>
				<button className="division-card-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove division">×</button>
				<Icon name={isExpanded ? 'doubleArrowUp' : 'doubleArrowDown'} className="division-card-expand-icon" />
			</div>

			{isExpanded && (
				<div className="division-card-content">
					<DivisionFormSection division={division} onUpdate={onUpdate} errors={errors} />
					<DivisionTeamsSection
						division={division}
						onAddTeam={onAddTeam}
						onRemoveTeam={onRemoveTeam}
						onUpdateTeam={onUpdateTeam}
					/>
					<DivisionPreviewSection
						division={division}
						calculateMatchCount={calculateMatchCount}
						getGroupDistribution={getGroupDistribution}
						getSingleElimRounds={getSingleElimRounds}
					/>
				</div>
			)}
		</div>
	);
}

function DivisionFormSection({ division, onUpdate, errors }) {
	const handleChange = (e) => {
		const { name, value } = e.target;
		onUpdate({ [name]: name === 'num_groups' || name === 'knockout_teams' ? parseInt(value) || 0 : value });
	};

	const divisionIndex = errors.division_name ? -1 : 0;

	return (
		<div className="division-form-section">
			<div className="division-form-row">
				<div className={`form-group ${errors[`division_${divisionIndex}_name`] ? 'error' : ''}`}>
					<label htmlFor={`div-name-${division.id}`}>Division Name *</label>
					<input
						id={`div-name-${division.id}`}
						type="text"
						name="name"
						value={division.name}
						onChange={handleChange}
						placeholder="e.g., Men's Open"
						className="form-input"
					/>
					{errors[`division_${divisionIndex}_name`] && <span className="form-error">{errors[`division_${divisionIndex}_name`]}</span>}
				</div>

				<div className={`form-group ${errors[`division_${divisionIndex}_format`] ? 'error' : ''}`}>
					<label htmlFor={`div-format-${division.id}`}>Format *</label>
					<select id={`div-format-${division.id}`} name="format" value={division.format} onChange={handleChange} className="form-input">
						<option value="Round Robin">Round Robin</option>
						<option value="Groups + Knockout">Groups + Knockout</option>
						<option disabled value="Single Elimination">Single Elimination - Coming Soon</option>
					</select>
					{errors[`division_${divisionIndex}_format`] && <span className="form-error">{errors[`division_${divisionIndex}_format`]}</span>}
				</div>
			</div>

			{division.format === 'Groups + Knockout' && (
				<div className="division-form-row">
					<div className={`form-group ${errors[`division_${divisionIndex}_groups`] ? 'error' : ''}`}>
						<label htmlFor={`div-groups-${division.id}`}>Number of Groups *</label>
						<input
							id={`div-groups-${division.id}`}
							type="number"
							name="num_groups"
							value={division.num_groups}
							onChange={handleChange}
							min="2"
							className="form-input"
						/>
						{errors[`division_${divisionIndex}_groups`] && <span className="form-error">{errors[`division_${divisionIndex}_groups`]}</span>}
					</div>

					<div className={`form-group ${errors[`division_${divisionIndex}_knockout_teams`] ? 'error' : ''}`}>
						<label htmlFor={`div-knockout-${division.id}`}>Teams to Knockout *</label>
						<input
							id={`div-knockout-${division.id}`}
							type="number"
							name="knockout_teams"
							value={division.knockout_teams}
							onChange={handleChange}
							min="2"
							max={division.teams.length}
							className="form-input"
						/>
						{errors[`division_${divisionIndex}_knockout_teams`] && <span className="form-error">{errors[`division_${divisionIndex}_knockout_teams`]}</span>}
					</div>
				</div>
			)}
		</div>
	);
}

function DivisionTeamsSection({ division, onAddTeam, onRemoveTeam, onUpdateTeam }) {
	return (
		<div className="division-teams-section">
			<h5>Teams ({division.teams.length})</h5>
			<div className="teams-list">
				{division.teams.map((team, idx) => (
					<div key={idx} className="team-item">
						<input
							type="text"
							value={typeof team === 'string' ? team : team.name}
							onChange={(e) => onUpdateTeam(idx, e.target.value)}
							className="team-input"
							placeholder={`Team ${idx + 1}`}
						/>
						<button className="team-remove-btn" onClick={() => onRemoveTeam(idx)} title="Remove team">×</button>
					</div>
				))}
			</div>
			<button className="add-team-button" onClick={onAddTeam}>
				+ Add Team
			</button>
		</div>
	);
}

function DivisionPreviewSection({ division, calculateMatchCount, getGroupDistribution, getSingleElimRounds }) {
	const matchCount = calculateMatchCount(division.format, division.teams.length, division.num_groups, division.knockout_teams);
	const warnings = [];

	// if (division.format === 'Groups + Knockout') {
	// 	const distribution = getGroupDistribution(division.teams.length, division.num_groups);
	// 	const isEven = distribution.every((count) => count === distribution[0]);
	// 	if (!isEven) {
	// 		warnings.push('Teams cannot be evenly distributed across groups');
	// 	}
	// } else if (division.format === 'Single Elimination') {
	// 	const pow = Math.ceil(Math.log2(division.teams.length));
	// 	const nearest = Math.pow(2, pow);
	// 	if (nearest !== division.teams.length) {
	// 		warnings.push(`Single elimination requires ${nearest - division.teams.length} byes`);
	// 	}
	// }

	if (division.teams.length < 2) {
		warnings.push('At least 2 teams are required');
	}

	return (
		<div className="division-preview-section">
			<h5>Preview</h5>

			{division.format === 'Round Robin' && (
				<div className="preview-content">
					<div className="preview-stat">
						<span>Teams:</span>
						<strong>{division.teams.length}</strong>
					</div>
					<div className="preview-stat">
						<span>Matches per team:</span>
						<strong>{division.teams.length > 1 ? division.teams.length - 1 : 0}</strong>
					</div>
					<div className="preview-stat">
						<span>Total matches:</span>
						<strong>{matchCount}</strong>
					</div>
				</div>
			)}

			{division.format === 'Single Elimination' && (
				<div className="preview-content">
					<div className="preview-stat">
						<span>Teams:</span>
						<strong>{division.teams.length}</strong>
					</div>
					<div className="preview-rounds">
						{getSingleElimRounds(division.teams.length).map((round, idx) => (
							<div key={idx} className="preview-round">
								<span>{round.name}:</span>
								<strong>{round.matches} match{round.matches !== 1 ? 'es' : ''}</strong>
							</div>
						))}
					</div>
					<div className="preview-stat">
						<span>Total matches:</span>
						<strong>{matchCount}</strong>
					</div>
				</div>
			)}

			{division.format === 'Groups + Knockout' && (
				<div className="preview-content">
					<div className="preview-groups">
						<span>Groups:</span>
						{getGroupDistribution(division.teams.length, division.num_groups).map((count, idx) => (
							<div key={idx} className="preview-group">
								<span>Group {String.fromCharCode(65 + idx)}:</span>
								<strong>{count} teams</strong>
								<span className="group-matches">({(count * (count - 1)) / 2} matches)</span>
							</div>
						))}
					</div>
					<div className="preview-stat">
						<span>Total matches:</span>
						<strong>{matchCount}</strong>
					</div>
				</div>
			)}

			{warnings.length > 0 && (
				<div className="preview-warnings">
					{warnings.map((warning, idx) => (
						<div key={idx} className="preview-warning">
							⚠️ {warning}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function TournamentSummarySection({ divisions, calculateMatchCount }) {
	const totalTeams = divisions.reduce((sum, d) => sum + d.teams.length, 0);
	const totalMatches = divisions.reduce((sum, d) => sum + calculateMatchCount(d.format, d.teams.length, d.num_groups, d.knockout_teams), 0);

	return (
		<div className="create-form-input-section">
			<div className="input-section-expandable active">Tournament Summary</div>
			<div className="input-section-expandable-content expand">
				<div className="tournament-summary-grid">
					<div className="summary-stat">
						<h5>Divisions</h5>
						<p className="stat-value">{divisions.length}</p>
					</div>
					<div className="summary-stat">
						<h5>Total Teams</h5>
						<p className="stat-value">{totalTeams}</p>
					</div>
					<div className="summary-stat">
						<h5>Total Matches</h5>
						<p className="stat-value">{totalMatches}</p>
					</div>
				</div>

				{divisions.length > 0 && (
					<div className="summary-divisions">
						<h5>Matches by Division</h5>
						{divisions.map((division, idx) => {
							const matches = calculateMatchCount(division.format, division.teams.length, division.num_groups, division.knockout_teams);
							return (
								<div key={idx} className="summary-division-row">
									<span>{division.name || `Division ${idx + 1}`}</span>
									<strong>{matches} matches</strong>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
