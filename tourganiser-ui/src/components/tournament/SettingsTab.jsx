import { useEffect, useState } from 'react';
import SectionState from './SectionState';
import LoadingScreen from '../LoadingScreen';
import { useConfirm } from '../ConfirmContext';
import { useMessage } from '../../MessageContext';
import { useHelpTopic } from '../../HelpContext';
import { DEFAULT_ROLE, ROLES, roleLabel } from './collaboratorRoles';
import {
	addTournamentEditor,
	deleteTournament,
	getTournamentEditors,
	removeTournamentEditor,
	searchEditorCandidates,
	updateDivisionSettings,
	updateTournamentEditorRole,
} from '../../requests';

// The organiser's settings for the tournament: who else may enter results, how
// each division ranks its teams and how far down its knockout plays, and the
// Danger Zone.
//
// Only ever rendered for a role that can manage setup — View.jsx shows Overview to
// anyone else who lands on ?tab=settings. Each band has its own capability. Every
// control here is presentation; the server's check on each endpoint is the real
// gate.
export default function SettingsTab({ tournament = {}, divisions = [], can = {}, onChanged, onDeleted }) {
	useHelpTopic('tournament-settings');

	return (
		<div className="tv-overview">
			{can.manageCollaborators && <EditorsBand tournamentId={tournament.id} />}
			{can.manageSetup && <DivisionSettingsBand divisions={divisions} onChanged={onChanged} />}
			{can.deleteTournament && <DangerZone tournament={tournament} onDeleted={onDeleted} />}
		</div>
	);
}

// Who else works on this tournament, and in which role. Adding is immediate —
// there is no invite for them to accept — and so are changing and removing.
function EditorsBand({ tournamentId }) {
	const confirm = useConfirm();
	const { showMessage } = useMessage();
	const [editors, setEditors] = useState(null);
	const [loadError, setLoadError] = useState(null);
	const [identifier, setIdentifier] = useState('');
	const [newRole, setNewRole] = useState(DEFAULT_ROLE);
	const [busy, setBusy] = useState(false);
	// Bumped to refetch the list, the same way View.jsx's retry works.
	const [version, setVersion] = useState(0);
	const load = () => setVersion((count) => count + 1);

	// Its own request rather than part of the tournament payload: the list is the
	// organiser's alone, and nobody else's view of the tournament should carry it.
	useEffect(() => {
		if (!tournamentId) return undefined;
		let active = true;

		(async () => {
			try {
				const response = await getTournamentEditors(tournamentId);
				if (active) {
					setEditors(response.data ?? []);
					setLoadError(null);
				}
			} catch (apiError) {
				if (active) setLoadError(apiError.message);
			}
		})();

		return () => {
			active = false;
		};
	}, [tournamentId, version]);

	// Suggestions as the organiser types. Asked for once typing pauses, and only
	// while the list is open. Anyone they have worked with is offered from the
	// first keystroke (and on focus, before anything is typed); everyone else
	// from three characters, which the server enforces. Nothing is suggested
	// once an @ appears: an email is never searched for, only typed in full.
	const [listOpen, setListOpen] = useState(false);
	const [results, setResults] = useState([]);
	const [activeIndex, setActiveIndex] = useState(-1);
	// The username just taken from the list. Searching for it would only offer the
	// same name again, straight after it was chosen.
	const [picked, setPicked] = useState(null);
	const query = identifier.trim();
	const searchable = listOpen && !query.includes('@') && query !== picked;

	useEffect(() => {
		if (!tournamentId || !searchable) return undefined;
		let active = true;

		const timer = setTimeout(async () => {
			try {
				const response = await searchEditorCandidates(tournamentId, query);
				if (active) setResults(response.data ?? []);
			} catch {
				// Suggestions are a convenience. A failure, a rate limit included,
				// leaves the field working exactly as it did without them.
				if (active) setResults([]);
			}
		}, SUGGEST_DELAY_MS);

		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [tournamentId, query, searchable, version]);

	// The last answer stays up while the next is on its way, so the list does not
	// blink on every keystroke. Matching is by prefix, as on the server, so a name
	// that no longer fits what is in the field is never offered.
	const prefix = query.toLowerCase();
	const matches = searchable ? results.filter((item) => item.username.toLowerCase().startsWith(prefix)) : [];
	// A list holding only what is already typed offers nothing, and on a phone it
	// sits over the role and Add controls.
	const suggestions = matches.length === 1 && matches[0].username.toLowerCase() === prefix ? [] : matches;

	const choose = (suggestion) => {
		setIdentifier(suggestion.username);
		setPicked(suggestion.username);
		setActiveIndex(-1);
	};

	const handleKeyDown = (event) => {
		if (event.key === 'ArrowDown' && suggestions.length > 0) {
			event.preventDefault();
			setActiveIndex((index) => (index + 1) % suggestions.length);
		} else if (event.key === 'ArrowUp' && suggestions.length > 0) {
			event.preventDefault();
			setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
		} else if (event.key === 'Enter') {
			if (suggestions[activeIndex]) choose(suggestions[activeIndex]);
			else handleAdd();
		} else if (event.key === 'Escape') {
			setListOpen(false);
		}
	};

	const handleAdd = async () => {
		const value = identifier.trim();
		if (!value || busy) return;
		if (newRole === 'CO_ORGANISER' && !(await confirmCoOrganiser(value))) return;

		setBusy(true);
		try {
			const response = await addTournamentEditor(tournamentId, value, newRole);
			showMessage(`${response.data?.username ?? value} added as ${roleLabel(newRole)}.`, 'success');
			setIdentifier('');
			setPicked(null);
			// Back to the least, so the next person is not given this one by accident.
			setNewRole(DEFAULT_ROLE);
			// Closed so the new row can be seen, and emptied because it may still
			// name the person just added.
			setListOpen(false);
			setResults([]);
			load();
		} catch (apiError) {
			// Display-ready by contract: not found, already an editor, or yourself.
			showMessage(apiError.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	// The one role that can reshape the tournament, so the one worth stopping for.
	const confirmCoOrganiser = (name) =>
		confirm(
			"They will be able to change teams and divisions, and start and end the tournament, without asking you. They can't delete it or manage collaborators.",
			{ title: `Make ${name} a Co-organiser?`, confirmLabel: 'Make Co-organiser', cancelLabel: 'Cancel' },
		);

	const handleRoleChange = async (editor, role) => {
		if (role === 'CO_ORGANISER' && !(await confirmCoOrganiser(editor.username))) return;

		const setRole = (next) =>
			setEditors((current) => current.map((entry) => (entry.id === editor.id ? { ...entry, role: next } : entry)));

		// Shown straight away, so the select does not snap back for the round trip.
		setRole(role);
		setBusy(true);
		try {
			await updateTournamentEditorRole(tournamentId, editor.id, role);
			showMessage(`${editor.username} is now ${roleLabel(role)}.`, 'success');
		} catch (apiError) {
			setRole(editor.role);
			showMessage(apiError.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	const handleRemove = async (editor) => {
		const confirmed = await confirm(
			'They will lose what their role allows on this tournament straight away. Results they have already entered stay as they are.',
			{ title: `Remove ${editor.username} as a collaborator?`, confirmLabel: 'Remove collaborator', cancelLabel: 'Keep', danger: true },
		);
		if (!confirmed) return;

		setBusy(true);
		try {
			await removeTournamentEditor(tournamentId, editor.id);
			showMessage(`${editor.username} is no longer a collaborator.`, 'success');
			load();
		} catch (apiError) {
			showMessage(apiError.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="tv-band">
			<h2 className="tv-band-heading">Collaborators</h2>

			<div className="tv-info-card tv-info-card--combobox">
				<ul className="tv-role-list">
					{ROLES.map((role) => (
						<li key={role.value}>
							<strong>{role.label}.</strong> {role.description}
						</li>
					))}
				</ul>

				<p className="tv-settings-note">Search for someone by username, or type their full email address.</p>

				<div className="tv-inline-form">
					<label className="tv-inline-form-field tv-editor-field">
						<span>Add a collaborator</span>
						{/* A browser's or password manager's own autofill list opens right
						    where the suggestions do. These turn it off, and the placeholder
						    avoids the word "email", which browsers read as a field to fill. */}
						<input
							type="text"
							value={identifier}
							readOnly={busy}
							maxLength={100}
							placeholder="Search by username"
							autoComplete="off"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
							data-1p-ignore
							data-lpignore="true"
							data-bwignore
							data-form-type="other"
							role="combobox"
							aria-autocomplete="list"
							aria-expanded={suggestions.length > 0}
							aria-controls="tv-editor-suggestions"
							aria-activedescendant={activeIndex >= 0 ? `tv-editor-suggestion-${activeIndex}` : undefined}
							onFocus={() => setListOpen(true)}
							onClick={() => setListOpen(true)}
							onBlur={() => setListOpen(false)}
							onChange={(event) => {
								setIdentifier(event.target.value);
								setActiveIndex(-1);
								setListOpen(true);
							}}
							onKeyDown={handleKeyDown}
						/>

						{/* Floats over the rows below, so opening it moves nothing. */}
						{suggestions.length > 0 && (
							<ul id="tv-editor-suggestions" className="tv-editor-suggestions" role="listbox">
								{suggestions.map((suggestion, index) => (
									<li
										key={suggestion.username}
										id={`tv-editor-suggestion-${index}`}
										role="option"
										aria-selected={index === activeIndex}
										className={`tv-editor-suggestion${index === activeIndex ? ' is-active' : ''}`}
										// mousedown, not click: a click lands after the input's blur
										// has already closed the list.
										onMouseDown={(event) => {
											event.preventDefault();
											choose(suggestion);
										}}>
										<span>{suggestion.username}</span>
										{suggestion.workedWith && <span className="tv-editor-suggestion-note">Worked with before</span>}
									</li>
								))}
							</ul>
						)}
					</label>

					<label className="tv-filter">
						<span>Role</span>
						<select value={newRole} disabled={busy} onChange={(event) => setNewRole(event.target.value)}>
							<RoleOptions />
						</select>
					</label>

					<div className="tv-inline-form-actions">
						<button type="button" className="tv-primary-action" disabled={busy || !identifier.trim()} onClick={handleAdd}>
							Add
						</button>
					</div>
				</div>

				{loadError && (
					<SectionState variant="error" title="Collaborators could not be loaded" message={loadError} onRetry={load} />
				)}

				{!loadError && editors === null && <SectionState variant="loading" />}

				{!loadError && editors?.length === 0 && <p className="tv-settings-empty">No collaborators yet.</p>}

				{!loadError && editors?.length > 0 && (
					<ul className="tv-settings-list">
						{editors.map((editor) => (
							<li key={editor.id} className="tv-settings-row tv-settings-row--collaborator">
								<span className="tv-settings-row-name">{editor.username}</span>
								<div className="tv-settings-row-actions">
									<div className="tv-filter">
										<select
											aria-label={`Role for ${editor.username}`}
											value={editor.role}
											disabled={busy}
											onChange={(event) => handleRoleChange(editor, event.target.value)}>
											<RoleOptions />
										</select>
									</div>
									<button
										type="button"
										className="tv-subtle-action tv-subtle-action--danger"
										disabled={busy}
										onClick={() => handleRemove(editor)}>
										Remove
									</button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}

function RoleOptions() {
	return ROLES.map((role) => (
		<option key={role.value} value={role.value}>
			{role.label}
		</option>
	));
}

// Long enough that a steady typist sends one search per word rather than one
// per keystroke, short enough that the list keeps up.
const SUGGEST_DELAY_MS = 250;

// The four primary criteria from docs/tournament-rules.md. Only the first link
// of the ranking chain changes; the tiebreakers behind it do not.
const RANKING_BASES = [
	{ value: 'MATCHES_WON', label: 'Matches won' },
	{ value: 'FIVB_POINTS', label: 'FIVB match points (3 / 2 / 1 / 0)' },
	{ value: 'SIMPLIFIED_POINTS', label: 'Match points (2 / 1 / 0)' },
	{ value: 'SETS_WON', label: 'Sets won' },
];

function DivisionSettingsBand({ divisions, onChanged }) {
	const { showMessage } = useMessage();
	// Placement depth regenerates knockout fixtures, which takes long enough to
	// look like nothing happened; the ranking basis does not.
	const [regenerating, setRegenerating] = useState(false);
	// What was chosen and not yet confirmed by a refetch, so a select does not
	// snap back to its old value for the round trip. Dropped on failure.
	const [pending, setPending] = useState({});

	const save = async (division, settings) => {
		setPending((current) => ({ ...current, [division.id]: { ...current[division.id], ...settings } }));
		if ('placementDepth' in settings) setRegenerating(true);

		try {
			await updateDivisionSettings(division.id, settings);
			showMessage(`${division.name} updated.`, 'success');
			onChanged?.();
		} catch (apiError) {
			setPending((current) => {
				const remaining = { ...current };
				delete remaining[division.id];
				return remaining;
			});
			showMessage(apiError.message, 'error');
		} finally {
			setRegenerating(false);
		}
	};

	return (
		<section className="tv-band">
			<h2 className="tv-band-heading">Divisions</h2>

			{divisions.length === 0 ? (
				<SectionState variant="empty" title="This tournament has no divisions" />
			) : (
				<ul className="tv-settings-list tv-settings-list--cards">
					{divisions.map((division) => (
						<DivisionSettingsRow
							key={division.id}
							division={division}
							pending={pending[division.id] ?? {}}
							disabled={regenerating}
							onSave={(settings) => save(division, settings)}
						/>
					))}
				</ul>
			)}

			{regenerating && <LoadingScreen context="divisionSave" />}
		</section>
	);
}

function DivisionSettingsRow({ division, pending, disabled, onSave }) {
	const rankingBasis = pending.rankingBasis ?? division.ranking_basis ?? 'MATCHES_WON';
	const placementDepth = 'placementDepth' in pending ? pending.placementDepth : division.placement_depth ?? null;
	const knockout = knockoutOf(division);

	return (
		<li className="tv-info-card tv-settings-division">
			<div className="tv-division-card-header">
				<h3>{division.name}</h3>
				{division.type && <span className="tv-info-format">{division.type}</span>}
			</div>

			<div className="tv-filters">
				<label className="tv-filter">
					<span>Rank teams by</span>
					<select
						value={rankingBasis}
						disabled={disabled}
						onChange={(event) => onSave({ rankingBasis: event.target.value })}>
						{RANKING_BASES.map((basis) => (
							<option key={basis.value} value={basis.value}>
								{basis.label}
							</option>
						))}
					</select>
				</label>

				{/* Only where there is a knockout with ranks below 4th to play for.
				    A League has no knockout stage at all. */}
				{knockout && knockout.teams >= 5 && (
					<label className="tv-filter">
						<span>Play for places down to</span>
						<select
							value={placementDepth ?? ''}
							disabled={disabled || knockout.started}
							onChange={(event) =>
								onSave({ placementDepth: event.target.value === '' ? null : Number(event.target.value) })
							}>
							<option value="">4th (final and 3rd place only)</option>
							{placementOptions(knockout.teams).map((depth) => (
								<option key={depth} value={depth}>
									{ordinal(depth)}
								</option>
							))}
						</select>
					</label>
				)}
			</div>

			{knockout?.started && knockout.teams >= 5 && (
				<p className="tv-settings-note">The knockout stage has started, so its placement matches are fixed.</p>
			)}
		</li>
	);
}

// The knockout stage's size and whether it has begun, read from state the way
// the server's readPlacementDepth reads it. Null for a division without one.
function knockoutOf(division) {
	if (division.type !== 'Classic') return null;

	const rounds = Array.isArray(division.state?.rounds) ? division.state.rounds : [];
	const first = rounds.findIndex((round) => round.type === 'knockout');
	if (first < 1) return null;

	const indices = (rounds[first].groups ?? []).flat().filter(Number.isInteger);

	return {
		teams: indices.length === 0 ? 0 : Math.max(...indices) + 1,
		started: (Number(division.state?.currentRound) || 0) >= first,
	};
}

// Odd places from 5th down to the knockout's size: each is the place a match
// decides, alongside the one below it.
function placementOptions(knockoutTeams) {
	const options = [];
	for (let depth = 5; depth <= knockoutTeams; depth += 2) options.push(depth);
	return options;
}

function ordinal(value) {
	const lastTwo = value % 100;
	if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;

	return `${value}${{ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th'}`;
}

// Delete Tournament, moved here from Overview's lifecycle actions unchanged: the
// same confirmation, the same request, the same exit from the page.
function DangerZone({ tournament, onDeleted }) {
	const confirm = useConfirm();
	const { showMessage } = useMessage();
	const [busy, setBusy] = useState(false);

	// Deletion is permitted at every status, including part-way through. The
	// cascade is named here because that is what makes it a decision rather than
	// a surprise — the divisions, fixtures and results all go with it.
	const handleDelete = async () => {
		const ongoing = (tournament.status || 'Not Started') === 'Ongoing' ? 'It is currently in progress. ' : '';
		const confirmed = await confirm(
			`${ongoing}Its divisions, fixtures and results are deleted too. This cannot be undone.`,
			{
				title: `Delete ${tournament.name || 'this tournament'}?`,
				confirmLabel: 'Delete tournament',
				cancelLabel: 'Keep it',
				danger: true,
				// The one action that removes everything at once, so it takes more
				// than a click.
				requireText: tournament.name || null,
			},
		);
		if (!confirmed) return;

		setBusy(true);
		try {
			await deleteTournament(tournament.id);
			showMessage('Tournament deleted.', 'success');
			onDeleted?.();
		} catch (apiError) {
			showMessage(apiError.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="tv-band">
			<h2 className="tv-band-heading">Danger Zone</h2>

			<div className="tv-info-card tv-settings-danger">
				<div className="tv-settings-row">
					<div>
						<p className="tv-settings-row-name">Delete this tournament</p>
						<p className="tv-settings-note">Removes every division, fixture and result. This cannot be undone.</p>
					</div>
					<button type="button" className="tv-danger-action" disabled={busy} onClick={handleDelete}>
						Delete Tournament
					</button>
				</div>
			</div>
		</section>
	);
}
