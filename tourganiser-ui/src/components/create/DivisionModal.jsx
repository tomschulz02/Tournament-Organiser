import { useMemo, useRef, useState } from 'react';
import CreateModal from './CreateModal';
import Icon from '../Icons';
import { useConfirm } from '../ConfirmDialog';
import {
	DIVISION_NAME_MAX,
	FORMATS,
	TEAM_NAME_MAX,
	getFormat,
	isConfigurableFormat,
	validateDivision,
} from './divisionFormats';

// One decision per screen. The middle one only exists for a format that has
// something to configure, which is why this is derived from the draft rather
// than being a fixed list — Round Robin genuinely has two steps, not three with
// one left blank.
function screensFor(type) {
	return isConfigurableFormat(type) ? ['basics', 'configuration', 'teams'] : ['basics', 'teams'];
}

// Which screen an error belongs to, so a failed Add Division can put the
// organiser in front of the problem instead of just naming it.
const SCREEN_FOR_ERROR = {
	name: 'basics',
	type: 'basics',
	num_groups: 'configuration',
	knockout_teams: 'configuration',
	teams: 'teams',
};

const SCREEN_TITLES = {
	basics: 'Basics',
	configuration: 'Configuration',
	teams: 'Teams',
};

// The same modal for adding and for editing. `division` is the one being edited,
// or a fresh empty one — this component never needs to know which, beyond the
// wording of its title and its confirming button.
export default function DivisionModal({ division, isEditing, onCancel, onSave }) {
	const [draft, setDraft] = useState(division);
	const [screen, setScreen] = useState('basics');
	const [errors, setErrors] = useState({});
	// Whether the pool settings have been deliberately changed. Only then is it
	// worth telling someone that a format change makes them irrelevant.
	const [configurationTouched, setConfigurationTouched] = useState(false);
	const [newTeamName, setNewTeamName] = useState('');
	const confirm = useConfirm();

	const screens = useMemo(() => screensFor(draft.type), [draft.type]);
	const screenIndex = Math.max(0, screens.indexOf(screen));
	const isLastScreen = screenIndex === screens.length - 1;

	const update = (changes) => setDraft((previous) => ({ ...previous, ...changes }));

	const handleFormatChange = (type) => {
		// The values are kept rather than reset, so switching back and forth does
		// not quietly destroy what was entered. What changes is whether they are
		// used, and the notice below says so.
		update({ type });
		setErrors((previous) => ({ ...previous, type: undefined }));
	};

	const handleConfigurationChange = (field, value) => {
		update({ [field]: value });
		setConfigurationTouched(true);
	};

	const goBack = () => {
		if (screenIndex === 0) return;
		setScreen(screens[screenIndex - 1]);
	};

	const goNext = () => {
		if (isLastScreen) return;

		// A format has to be chosen before there is a next screen to go to —
		// which screen that is depends on the answer.
		if (screen === 'basics' && !draft.type) {
			setErrors((previous) => ({ ...previous, type: 'Choose how this division will be played.' }));
			return;
		}

		setScreen(screens[screenIndex + 1]);
	};

	const addTeam = () => {
		const name = newTeamName.trim();
		if (name.length === 0) return;

		update({ teams: [...draft.teams, { name }] });
		setNewTeamName('');
		setErrors((previous) => ({ ...previous, teams: undefined }));
	};

	const updateTeam = (index, name) => {
		update({ teams: draft.teams.map((team, position) => (position === index ? { name } : team)) });
	};

	const removeTeam = (index) => {
		update({ teams: draft.teams.filter((_, position) => position !== index) });
	};

	// The hard check. Everything the server would refuse, refused here first and
	// on the screen that owns it.
	const handleSave = () => {
		const found = validateDivision(draft);
		setErrors(found);

		const firstProblem = Object.keys(found)[0];
		if (firstProblem) {
			setScreen(SCREEN_FOR_ERROR[firstProblem] || 'basics');
			return;
		}

		onSave({ ...draft, name: draft.name.trim(), teams: draft.teams.map((team) => ({ name: team.name.trim() })) });
	};

	const handleClose = async () => {
		// A division being edited is already safe on the page; a new one with
		// nothing in it is worth nothing. Everything in between is worth asking
		// about — a thirty-two team list is a long evening.
		const worthKeeping = draft.name.trim().length > 0 || draft.teams.length > 0;

		if (worthKeeping) {
			const confirmed = await confirm(
				isEditing ? 'Discard the changes to this division?' : 'Discard this division?'
			);
			if (!confirmed) return;
		}

		onCancel();
	};

	const footer = (
		<>
			<div className="ct-modal-footer-left">
				{screenIndex > 0 && (
					<button type="button" className="ct-button ct-button-quiet" onClick={goBack}>
						<Icon name="leftChevron" size={18} />
						<span>Back</span>
					</button>
				)}
			</div>
			<div className="ct-modal-footer-right">
				<button type="button" className="ct-button ct-button-quiet" onClick={handleClose}>
					Cancel
				</button>
				{isLastScreen ? (
					<button type="button" className="ct-button ct-button-primary" onClick={handleSave}>
						{isEditing ? 'Save Division' : 'Add Division'}
					</button>
				) : (
					<button type="button" className="ct-button ct-button-primary" onClick={goNext}>
						Next
					</button>
				)}
			</div>
		</>
	);

	return (
		<CreateModal
			titleId="ct-division-modal-title"
			title={isEditing ? 'Edit division' : 'Add a division'}
			subtitle={`${SCREEN_TITLES[screen]} — step ${screenIndex + 1} of ${screens.length}`}
			onClose={handleClose}
			footer={footer}>
			{screen === 'basics' && (
				<BasicsScreen
					draft={draft}
					errors={errors}
					configurationTouched={configurationTouched}
					onNameChange={(name) => {
						update({ name });
						setErrors((previous) => ({ ...previous, name: undefined }));
					}}
					onFormatChange={handleFormatChange}
				/>
			)}

			{screen === 'configuration' && (
				<ConfigurationScreen draft={draft} errors={errors} onChange={handleConfigurationChange} />
			)}

			{screen === 'teams' && (
				<TeamsScreen
					draft={draft}
					errors={errors}
					newTeamName={newTeamName}
					onNewTeamNameChange={setNewTeamName}
					onAddTeam={addTeam}
					onUpdateTeam={updateTeam}
					onRemoveTeam={removeTeam}
				/>
			)}
		</CreateModal>
	);
}

function BasicsScreen({ draft, errors, configurationTouched, onNameChange, onFormatChange }) {
	// Every option shows the same amount of information whether it is selected or
	// not, so choosing one changes a border and nothing else. A screen that grows
	// under the cursor as you pick is a screen you have to re-read.
	const chosen = getFormat(draft.type);
	const droppingConfiguration = configurationTouched && chosen && !chosen.configurable;

	return (
		<div className="ct-screen">
			<div className="ct-field">
				<label className="ct-field-label" htmlFor="ct-division-name">
					<span>Division name</span>
					<span className="ct-field-required">Required</span>
				</label>
				<input
					id="ct-division-name"
					className={`ct-input ${errors.name ? 'ct-input-invalid' : ''}`.trim()}
					type="text"
					value={draft.name}
					maxLength={DIVISION_NAME_MAX}
					placeholder="Men's Open, Under 19, Mixed B…"
					onChange={(event) => onNameChange(event.target.value)}
					aria-invalid={errors.name ? true : undefined}
					aria-describedby={errors.name ? 'ct-division-name-error' : undefined}
				/>
				<div className="ct-field-foot">
					{errors.name && (
						<p className="ct-field-error" id="ct-division-name-error">
							{errors.name}
						</p>
					)}
				</div>
			</div>

			<fieldset className="ct-fieldset">
				<legend className="ct-field-label">
					<span>How will it be played?</span>
					<span className="ct-field-required">Required</span>
				</legend>

				<div className="ct-format-options">
					{FORMATS.map((format) => (
						// Named by the format alone, described by the rest. Without
						// this the button's accessible name is all three lines read
						// as one, which is a paragraph where a label belongs.
						<button
							key={format.type}
							type="button"
							className={`ct-format-option ${draft.type === format.type ? 'ct-format-option-selected' : ''}`.trim()}
							aria-pressed={draft.type === format.type}
							aria-labelledby={`ct-format-name-${format.type}`}
							aria-describedby={`ct-format-summary-${format.type} ct-format-best-${format.type}`}
							onClick={() => onFormatChange(format.type)}>
							<span className="ct-format-name" id={`ct-format-name-${format.type}`}>
								{format.label}
							</span>
							<span className="ct-format-summary" id={`ct-format-summary-${format.type}`}>
								{format.summary}
							</span>
							<span className="ct-format-best" id={`ct-format-best-${format.type}`}>
								{format.best}
							</span>
						</button>
					))}
				</div>

				{errors.type && <p className="ct-field-error">{errors.type}</p>}
			</fieldset>

			{/* Said out loud rather than dropped in silence. The values are still
			    there if the format is changed back. */}
			{droppingConfiguration && (
				<p className="ct-notice" role="status">
					{chosen.label} has no pools or knockout stage, so the pool settings you entered will not be used. They are
					kept in case you switch back.
				</p>
			)}
		</div>
	);
}

function ConfigurationScreen({ draft, errors, onChange }) {
	// Teams are entered on the next screen, so at this point the team count is
	// usually zero. That is the deliberate order: the mismatch between a pool
	// count and a team count is caught on Add Division, once both are known.
	const teamCount = draft.teams.length;

	return (
		<div className="ct-screen">
			<p className="ct-screen-lede">
				Teams are split evenly across the pools. Once every pool has played, the best teams across the division go
				through to a knockout bracket.
			</p>

			<div className="ct-field">
				<label className="ct-field-label" htmlFor="ct-division-groups">
					<span>Number of pools</span>
					<span className="ct-field-required">Required</span>
				</label>
				<input
					id="ct-division-groups"
					className={`ct-input ct-input-number ${errors.num_groups ? 'ct-input-invalid' : ''}`.trim()}
					type="number"
					inputMode="numeric"
					min="1"
					value={draft.num_groups}
					onChange={(event) => onChange('num_groups', Number(event.target.value))}
					aria-invalid={errors.num_groups ? true : undefined}
				/>
				<div className="ct-field-foot">
					{errors.num_groups ? (
						<p className="ct-field-error">{errors.num_groups}</p>
					) : (
						<p className="ct-field-hint">Teams are shared out as evenly as the numbers allow.</p>
					)}
				</div>
			</div>

			<div className="ct-field">
				<label className="ct-field-label" htmlFor="ct-division-knockout">
					<span>Teams advancing to the knockout</span>
					<span className="ct-field-required">Required</span>
				</label>
				<input
					id="ct-division-knockout"
					className={`ct-input ct-input-number ${errors.knockout_teams ? 'ct-input-invalid' : ''}`.trim()}
					type="number"
					inputMode="numeric"
					min="2"
					value={draft.knockout_teams}
					onChange={(event) => onChange('knockout_teams', Number(event.target.value))}
					aria-invalid={errors.knockout_teams ? true : undefined}
				/>
				<div className="ct-field-foot">
					{errors.knockout_teams ? (
						<p className="ct-field-error">{errors.knockout_teams}</p>
					) : (
						// A2: the backend reads this as the full qualifier count, not
						// a per-pool one. Labelling it per pool would quietly create a
						// bracket several times the size the organiser expected.
						<p className="ct-field-hint">
							The total across the whole division, not the number from each pool.
							{teamCount > 0 && ` This division has ${teamCount} teams.`}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

function TeamsScreen({ draft, errors, newTeamName, onNewTeamNameChange, onAddTeam, onUpdateTeam, onRemoveTeam }) {
	const addInputRef = useRef(null);

	// Enter adds and leaves the cursor where it is, so a list of thirty-two can
	// be typed without touching the mouse.
	const handleKeyDown = (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		onAddTeam();
		addInputRef.current?.focus();
	};

	return (
		<div className="ct-screen">
			<div className="ct-field">
				<label className="ct-field-label" htmlFor="ct-team-name">
					<span>Add a team</span>
				</label>
				<div className="ct-team-add">
					<input
						id="ct-team-name"
						ref={addInputRef}
						className="ct-input"
						type="text"
						value={newTeamName}
						maxLength={TEAM_NAME_MAX}
						placeholder="Team name"
						onChange={(event) => onNewTeamNameChange(event.target.value)}
						onKeyDown={handleKeyDown}
					/>
					<button
						type="button"
						className="ct-button ct-button-primary"
						onClick={onAddTeam}
						disabled={newTeamName.trim().length === 0}>
						Add
					</button>
				</div>
				<div className="ct-field-foot">
					<p className="ct-field-hint">Press Enter to add and keep typing.</p>
				</div>
			</div>

			{errors.teams && <p className="ct-field-error ct-screen-error">{errors.teams}</p>}

			{draft.teams.length === 0 ? (
				<p className="ct-empty-note">No teams yet. Add at least two.</p>
			) : (
				<>
					<p className="ct-team-count">
						{draft.teams.length} {draft.teams.length === 1 ? 'team' : 'teams'}
					</p>
					{/* A row per team, not a card per team. Some divisions hold
					    thirty-two of these. */}
					<ul className="ct-team-list">
						{draft.teams.map((team, index) => (
							<li key={index} className="ct-team-row">
								<span className="ct-team-number" aria-hidden="true">
									{index + 1}
								</span>
								<input
									className="ct-input ct-team-input"
									type="text"
									value={team.name}
									maxLength={TEAM_NAME_MAX}
									aria-label={`Team ${index + 1} name`}
									onChange={(event) => onUpdateTeam(index, event.target.value)}
								/>
								<button
									type="button"
									className="ct-team-remove"
									onClick={() => onRemoveTeam(index)}
									aria-label={`Remove ${team.name || `team ${index + 1}`}`}>
									<Icon name="exit" size={16} />
								</button>
							</li>
						))}
					</ul>
				</>
			)}
		</div>
	);
}
