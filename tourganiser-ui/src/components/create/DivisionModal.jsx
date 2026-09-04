import { useEffect, useMemo, useRef, useState } from 'react';
import CreateModal from './CreateModal';
import Icon from '../Icons';
import { useConfirm } from '../ConfirmDialog';
import { useHelpTopic } from '../../HelpContext';
import {
	DIVISION_NAME_MAX,
	FORMATS,
	MAX_ROUND_ROBIN_LEGS,
	TEAM_NAME_MAX,
	createTeamKey,
	gamesPerTeamError,
	getFormat,
	isConfigurableFormat,
	parseBulkTeamNames,
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
	roundRobinLegs: 'configuration',
	gamesPerTeam: 'configuration',
	teams: 'teams',
};

const SCREEN_TITLES = {
	basics: 'Basics',
	configuration: 'Configuration',
	teams: 'Teams',
};

// The drag payload is prefixed for the same reason the schedule maker's is: a
// bare index could have come from anywhere on the page.
const TEAM_DRAG = 'team:';

// The same modal for adding and for editing. `division` is the one being edited,
// or a fresh empty one — this component never needs to know which, beyond the
// wording of its title and its confirming button.
export default function DivisionModal({ division, isEditing, onCancel, onSave }) {
	useHelpTopic('division-modal');

	// A stable id per row, handed out when the row enters the draft.
	//
	// The list used to be keyed by array index, which is only safe while nothing
	// moves: React reuses an element positionally, so a reorder would leave one
	// team's input holding another team's text. The key never leaves this
	// component — handleSave sends { name } and nothing else.
	const [draft, setDraft] = useState(() => ({
		...division,
		teams: division.teams.map((team) => ({ ...team, key: createTeamKey() })),
	}));
	const [screen, setScreen] = useState('basics');
	const [errors, setErrors] = useState({});
	// Whether the pool settings have been deliberately changed. Only then is it
	// worth telling someone that a format change makes them irrelevant.
	const [configurationTouched, setConfigurationTouched] = useState(false);
	const [newTeamName, setNewTeamName] = useState('');
	const [bulkTeamText, setBulkTeamText] = useState('');
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

		update({ teams: [...draft.teams, { key: createTeamKey(), name }] });
		setNewTeamName('');
		setErrors((previous) => ({ ...previous, teams: undefined }));
	};

	const addBulkTeams = () => {
		const names = parseBulkTeamNames(
			bulkTeamText,
			draft.teams.map((team) => team.name)
		);
		if (names.length === 0) return;

		update({ teams: [...draft.teams, ...names.map((name) => ({ key: createTeamKey(), name }))] });
		setBulkTeamText('');
		setErrors((previous) => ({ ...previous, teams: undefined }));
	};

	const updateTeam = (index, name) => {
		// Spread, not a fresh object: replacing the entry would drop its key and
		// put the list back where it was before reordering was possible.
		update({ teams: draft.teams.map((team, position) => (position === index ? { ...team, name } : team)) });
	};

	const removeTeam = (index) => {
		update({ teams: draft.teams.filter((_, position) => position !== index) });
	};

	// The seeding. Array position is the seed, and the server draws its pools
	// from that order — see divisionPreview.js — so this is the one place the
	// organiser can set it before the division exists. Pure client state: the
	// list is already sent in order.
	const moveTeam = (from, to) => {
		if (from === to || to < 0 || to >= draft.teams.length) return;

		const teams = [...draft.teams];
		const [moved] = teams.splice(from, 1);
		teams.splice(to, 0, moved);

		update({ teams });
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
					bulkTeamText={bulkTeamText}
					onBulkTeamTextChange={setBulkTeamText}
					onAddBulkTeams={addBulkTeams}
					onUpdateTeam={updateTeam}
					onRemoveTeam={removeTeam}
					onMoveTeam={moveTeam}
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
	if (draft.type === 'league') {
		return <LeagueConfigurationScreen draft={draft} errors={errors} onChange={onChange} />;
	}

	return <ClassicConfigurationScreen draft={draft} errors={errors} onChange={onChange} />;
}

function ClassicConfigurationScreen({ draft, errors, onChange }) {
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

// Two mutually exclusive modes, per docs/decisions.md — a leg count (every leg
// a full cycle) or an exact games-per-team target (a g-regular graph, not a
// rounded-up cycle count). A division picks one or the other, never both.
//
// Teams are entered on the next screen for a brand-new division, so teamCount
// is usually 0 here and the parity/range constraint can only be shown as a
// hint, not enforced live — it's still checked in full at Add Division
// (validateDivision) and again server-side. Editing an existing division does
// know its team count already, and gets the live check.
function LeagueConfigurationScreen({ draft, errors, onChange }) {
	const teamCount = draft.teams.length;
	const liveError = teamCount >= 2 && draft.gamesPerTeam !== '' ? gamesPerTeamError(draft.gamesPerTeam, teamCount) : null;

	return (
		<div className="ct-screen">
			<p className="ct-screen-lede">Choose how many games each team plays. Every game counts toward one shared table.</p>

			<fieldset className="ct-fieldset">
				<legend className="ct-field-label">
					<span>Format</span>
				</legend>
				<div className="ct-format-options">
					<button
						type="button"
						className={`ct-format-option ${draft.roundRobinMode !== 'limited' ? 'ct-format-option-selected' : ''}`.trim()}
						aria-pressed={draft.roundRobinMode !== 'limited'}
						onClick={() => onChange('roundRobinMode', 'legs')}>
						<span className="ct-format-name">Play every team the same number of times</span>
						<span className="ct-format-summary">
							One or more full round robins — every team plays every other team once per leg.
						</span>
					</button>
					<button
						type="button"
						className={`ct-format-option ${draft.roundRobinMode === 'limited' ? 'ct-format-option-selected' : ''}`.trim()}
						aria-pressed={draft.roundRobinMode === 'limited'}
						onClick={() => onChange('roundRobinMode', 'limited')}>
						<span className="ct-format-name">Limit games per team</span>
						<span className="ct-format-summary">
							Each team plays an exact number of games against different opponents, fewer than a full round robin.
						</span>
					</button>
				</div>
			</fieldset>

			{draft.roundRobinMode === 'limited' ? (
				<div className="ct-field">
					<label className="ct-field-label" htmlFor="ct-division-games-per-team">
						<span>Games per team</span>
						<span className="ct-field-required">Required</span>
					</label>
					<input
						id="ct-division-games-per-team"
						className={`ct-input ct-input-number ${errors.gamesPerTeam || liveError ? 'ct-input-invalid' : ''}`.trim()}
						type="number"
						inputMode="numeric"
						min="1"
						value={draft.gamesPerTeam}
						onChange={(event) => onChange('gamesPerTeam', event.target.value === '' ? '' : Number(event.target.value))}
						aria-invalid={errors.gamesPerTeam || liveError ? true : undefined}
					/>
					<div className="ct-field-foot">
						{errors.gamesPerTeam || liveError ? (
							<p className="ct-field-error">{errors.gamesPerTeam || liveError}</p>
						) : (
							<p className="ct-field-hint">
								Has to be less than a full round robin, and — with an odd number of teams — an even number.
								{teamCount > 0 && ` This division has ${teamCount} teams.`}
							</p>
						)}
					</div>
				</div>
			) : (
				<div className="ct-field">
					<label className="ct-field-label" htmlFor="ct-division-legs">
						<span>Legs</span>
						<span className="ct-field-required">Required</span>
					</label>
					<input
						id="ct-division-legs"
						className={`ct-input ct-input-number ${errors.roundRobinLegs ? 'ct-input-invalid' : ''}`.trim()}
						type="number"
						inputMode="numeric"
						min="1"
						max={MAX_ROUND_ROBIN_LEGS}
						value={draft.roundRobinLegs}
						onChange={(event) => onChange('roundRobinLegs', Number(event.target.value))}
						aria-invalid={errors.roundRobinLegs ? true : undefined}
					/>
					<div className="ct-field-foot">
						{errors.roundRobinLegs ? (
							<p className="ct-field-error">{errors.roundRobinLegs}</p>
						) : (
							<p className="ct-field-hint">
								1 leg is a single round robin. Each additional leg repeats it, so every team meets every other team
								again.
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function TeamsScreen({
	draft,
	errors,
	newTeamName,
	onNewTeamNameChange,
	onAddTeam,
	bulkTeamText,
	onBulkTeamTextChange,
	onAddBulkTeams,
	onUpdateTeam,
	onRemoveTeam,
	onMoveTeam,
}) {
	const addInputRef = useRef(null);
	const bulkInputRef = useRef(null);
	const listRef = useRef(null);
	const teamCount = draft.teams.length;

	// Hidden until asked for, so the common one-at-a-time case isn't sharing the
	// screen with a control most people won't use.
	const [showBulkInput, setShowBulkInput] = useState(false);

	// The row being carried, and the row it is currently over. Both are indices
	// rather than keys, because the move is expressed as a pair of positions.
	const [draggingIndex, setDraggingIndex] = useState(null);
	const [overIndex, setOverIndex] = useState(null);

	// Enter adds and leaves the cursor where it is, so a list of thirty-two can
	// be typed without touching the mouse.
	const handleKeyDown = (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		onAddTeam();
		addInputRef.current?.focus();
	};

	// The list has a fixed height, so a newly added team lands below the fold
	// once it overflows. Only on growth: a removal should leave the view where
	// the organiser left it.
	const previousCount = useRef(teamCount);

	useEffect(() => {
		const grew = teamCount > previousCount.current;
		previousCount.current = teamCount;

		// An instant assignment, not scrollTo({ behavior: 'smooth' }) — the
		// development browser drops smooth scrolling silently, so it would look
		// like nothing happened. See docs/known-limitations.md.
		if (grew && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
	}, [teamCount]);

	const endDrag = () => {
		setDraggingIndex(null);
		setOverIndex(null);
	};

	const handleDragStart = (event, index) => {
		event.dataTransfer.setData('text/plain', `${TEAM_DRAG}${index}`);
		event.dataTransfer.effectAllowed = 'move';
		setDraggingIndex(index);
	};

	const handleDragOver = (event, index) => {
		// Only a row from this list is a valid drop. Without the guard the whole
		// list would accept dragged text from anywhere on the page.
		if (draggingIndex === null) return;

		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		setOverIndex(index);
	};

	const handleDrop = (event, index) => {
		event.preventDefault();

		const payload = event.dataTransfer.getData('text/plain') || '';
		endDrag();

		if (!payload.startsWith(TEAM_DRAG)) return;

		const from = Number(payload.slice(TEAM_DRAG.length));
		if (Number.isInteger(from)) onMoveTeam(from, index);
	};

	// The grip is a real button rather than a decorated span, so the order is
	// not a pointer-only fact. React moves the keyed row rather than rebuilding
	// it, so focus travels with the team it was on.
	const handleGripKeyDown = (event, index) => {
		const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (step === 0) return;

		event.preventDefault();
		onMoveTeam(index, index + step);
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

			{showBulkInput ? (
				<div className="ct-field">
					<label className="ct-field-label" htmlFor="ct-team-bulk">
						<span>Add multiple teams</span>
					</label>
					<textarea
						id="ct-team-bulk"
						ref={bulkInputRef}
						className="ct-input"
						value={bulkTeamText}
						placeholder={'One team per line, e.g.\nAces\nEagles\nFalcons'}
						onChange={(event) => onBulkTeamTextChange(event.target.value)}
					/>
					<div className="ct-field-foot">
						<p className="ct-field-hint">One name per line, or separated by commas.</p>
					</div>
					<button
						type="button"
						className="ct-button ct-button-primary"
						onClick={() => {
							onAddBulkTeams();
							setShowBulkInput(false);
						}}
						disabled={bulkTeamText.trim().length === 0}>
						Add teams
					</button>
					<button
						type="button"
						className="ct-button ct-button-quiet"
						onClick={() => setShowBulkInput(false)}>
						Cancel
					</button>
				</div>
			) : (
				<button
					type="button"
					className="ct-button ct-button-quiet ct-team-bulk-toggle"
					onClick={() => {
						setShowBulkInput(true);
						// Focus doesn't land until the textarea exists, which is the
						// render after this click.
						requestAnimationFrame(() => bulkInputRef.current?.focus());
					}}>
					Add multiple teams
				</button>
			)}

			{errors.teams && <p className="ct-field-error ct-screen-error">{errors.teams}</p>}

			{teamCount === 0 ? (
				<p className="ct-empty-note">No teams yet. Add at least two.</p>
			) : (
				<>
					<p className="ct-team-count">
						{teamCount} {teamCount === 1 ? 'team' : 'teams'}
					</p>
					{/* Said once, above the list. The order is the seeding, and
					    nothing else on this screen says so. */}
					<p className="ct-field-hint ct-team-order-hint">
						This order is the seeding — drag a team by its number to move it.
					</p>
					{/* A row per team, not a card per team. Some divisions hold
					    thirty-two of these, and the list scrolls rather than
					    growing the modal past them. */}
					<ul className="ct-team-list" ref={listRef}>
						{draft.teams.map((team, index) => (
							<li
								key={team.key}
								className={`ct-team-row${draggingIndex === index ? ' ct-team-row--dragging' : ''}${
									overIndex === index && draggingIndex !== index ? ' ct-team-row--over' : ''
								}`}
								onDragOver={(event) => handleDragOver(event, index)}
								onDrop={(event) => handleDrop(event, index)}>
								<button
									type="button"
									className="ct-team-number ct-team-grip"
									draggable
									onDragStart={(event) => handleDragStart(event, index)}
									onDragEnd={endDrag}
									onKeyDown={(event) => handleGripKeyDown(event, index)}
									aria-label={`Seed ${index + 1}, ${
										team.name || `team ${index + 1}`
									}. Drag, or use the up and down arrow keys, to reorder.`}>
									{index + 1}
								</button>
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
