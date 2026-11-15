import { Suspense, lazy, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import SectionState from './SectionState';
import LoadingScreen from '../LoadingScreen';
import Icon from '../Icons';
import IconTooltip from '../IconTooltip';
import HelpButton from '../HelpButton';
import { useConfirm } from '../ConfirmContext';
import { useMessage } from '../../MessageContext';
import { useHelpTopic } from '../../HelpContext';
import { DEFAULT_ROLE, ROLES, roleLabel } from './collaboratorRoles';
import { useTournamentLifecycle } from './useTournamentLifecycle';
import { SCORESHEET_FIELDS, SYSTEM_TEMPLATES } from '../../utils/scoresheetTemplates';
import { listTemplates } from '../../utils/scoresheetStorage';
import { divisionColorStyle } from '../../utils/divisionColors';
import { isNotStarted } from './tournamentStatus';
import { DEFAULT_POOL_DRAW, MATCHUP_DRAWS, POOL_DRAWS, matchupDrawOf, poolDrawOf } from '../create/divisionFormats';
import { poolMembership } from '../create/divisionPreview';
import {
	MAX_MATCH_POINTS,
	POINT_PRESETS,
	POINT_RESULTS,
	TIEBREAKERS,
	knockoutOf,
	moveTiebreaker,
	placementLadder,
	placementOptions,
	rulesOf,
	samePoints,
	withMethod,
} from '../../utils/rankingRules';
import {
	addTournamentEditor,
	deleteTournament,
	getTournamentEditors,
	removeTournamentEditor,
	searchEditorCandidates,
	updateDivisionSettings,
	updateTournamentEditorRole,
} from '../../requests';

// Split out of the main bundle: it pulls in pdfjs-dist for the marker-placement
// preview, which only an organiser opens, and only deliberately.
const ScoresheetTemplateModal = lazy(() => import('./ScoresheetTemplateModal'));

// The switch between the phone accordions and the desktop list of sections.
const WIDE_QUERY = '(min-width: 768px)';

function useWide() {
	return useSyncExternalStore(
		(onChange) => {
			const query = window.matchMedia?.(WIDE_QUERY);
			query?.addEventListener('change', onChange);
			return () => query?.removeEventListener('change', onChange);
		},
		() => window.matchMedia?.(WIDE_QUERY).matches ?? true,
		() => true,
	);
}

const STATUS_STEPS = [
	{ value: 'Not Started', label: 'Not started' },
	{ value: 'Ongoing', label: 'Ongoing' },
	{ value: 'Finished', label: 'Finished' },
];

// The organiser's settings for the tournament: who else works on it, how each
// division ranks its teams and plays out its knockout, what prints as a
// scoresheet, where the tournament is in its life, and deleting it.
//
// Only ever rendered for a role that can manage setup — View.jsx shows Overview to
// anyone else who lands on ?tab=settings. Each section has its own capability.
// Every control here is presentation; the server's check on each endpoint is the
// real gate.
//
// Sections stack. On a wide screen a list on the left jumps between them; on a
// phone each is an accordion whose closed row shows its current value. Bodies
// stay mounted while closed, so the collaborator list loads (and counts) before
// it is opened and an open form keeps what was typed.
export default function SettingsTab({ tournament = {}, divisions = [], can = {}, onChanged, onDeleted }) {
	useHelpTopic('tournament-settings');

	const wide = useWide();
	const lifecycle = useTournamentLifecycle(tournament.id, onChanged);
	const [collaboratorCount, setCollaboratorCount] = useState(null);
	const [openIds, setOpenIds] = useState(() => new Set());
	const [activeId, setActiveId] = useState(null);
	const baseId = useId();

	const status = tournament.status || 'Not Started';
	const templateKey = tournament.scoresheet_template ?? null;

	const sections = [
		can.manageCollaborators && {
			id: 'collaborators',
			title: 'Collaborators',
			help: 'collaborators',
			summary: collaboratorCount === null ? null : collaboratorCount === 0 ? 'None yet' : plural(collaboratorCount, 'person', 'people'),
			body: <EditorsBand tournamentId={tournament.id} onCount={setCollaboratorCount} />,
		},
		can.manageSetup && {
			id: 'divisions',
			title: 'Divisions',
			help: 'divisions',
			summary: plural(divisions.length, 'division', 'divisions'),
			body: <DivisionSettingsBand divisions={divisions} status={status} onChanged={onChanged} />,
		},
		can.manageSetup && {
			id: 'scoresheets',
			title: 'Scoresheets',
			help: 'scoresheets',
			summary: templateName(templateKey),
			body: <ScoresheetSection selectedKey={templateKey} busy={lifecycle.busy} onUse={lifecycle.setTemplate} />,
		},
		can.manageSetup && {
			id: 'status',
			title: 'Tournament status',
			help: 'status',
			summary: STATUS_STEPS.find((step) => step.value === status)?.label ?? status,
			body: <StatusSection status={status} lifecycle={lifecycle} />,
		},
		can.deleteTournament && {
			id: 'delete',
			title: 'Delete tournament',
			help: 'delete',
			summary: null,
			danger: true,
			body: <DangerZone tournament={tournament} onDeleted={onDeleted} />,
		},
	].filter(Boolean);

	const sectionId = (id) => `${baseId}-${id}`;

	// The list follows the reader down the page: the section nearest the top of
	// the viewport is the current one. Wide screens only, where the list exists.
	useEffect(() => {
		if (!wide || typeof IntersectionObserver === 'undefined') return undefined;

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((entry) => entry.isIntersecting);
				if (visible.length === 0) return;
				visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				setActiveId(visible[0].target.dataset.section);
			},
			{ rootMargin: '-110px 0px -55% 0px' },
		);

		document.querySelectorAll('.tv-settings-section[data-section]').forEach((element) => observer.observe(element));
		return () => observer.disconnect();
	}, [wide, sections.length]);

	const jumpTo = (id) => {
		setActiveId(id);
		const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		document.getElementById(sectionId(id))?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
	};

	const toggle = (id) =>
		setOpenIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const current = activeId ?? sections[0]?.id;

	return (
		<div className="tv-settings">
			{wide && sections.length > 1 && (
				<nav className="tv-settings-nav" aria-label="Settings sections">
					<ul>
						{sections.map((section) => (
							<li key={section.id}>
								<button
									type="button"
									className={`tv-settings-nav-item${section.danger ? ' tv-settings-nav-item--danger' : ''}`}
									aria-current={section.id === current ? 'true' : undefined}
									onClick={() => jumpTo(section.id)}>
									{section.title}
								</button>
							</li>
						))}
					</ul>
				</nav>
			)}

			<div className="tv-settings-sections">
				{sections.map((section) => {
					const open = wide || openIds.has(section.id);
					const bodyId = `${sectionId(section.id)}-body`;

					return (
						<section
							key={section.id}
							id={sectionId(section.id)}
							data-section={section.id}
							className={`tv-settings-section${section.danger ? ' tv-settings-section--danger' : ''}`}>
							{wide ? (
								<div className="tv-settings-section-head">
									<h2 className="tv-band-heading">{section.title}</h2>
									<HelpButton topic="tournament-settings" section={section.help} />
								</div>
							) : (
								<h2 className="tv-settings-acc-heading">
									<button
										type="button"
										className="tv-settings-acc"
										aria-expanded={open}
										aria-controls={bodyId}
										onClick={() => toggle(section.id)}>
										<span className="tv-settings-acc-title">{section.title}</span>
										{section.summary && <span className="tv-settings-acc-summary">{section.summary}</span>}
										<Icon
											name="leftChevron"
											size={16}
											fill="currentColor"
											className={`tv-settings-acc-chevron${open ? ' tv-settings-acc-chevron--open' : ''}`}
										/>
									</button>
								</h2>
							)}

							<div id={bodyId} className="tv-settings-section-body" hidden={!open}>
								{!wide && (
									<div className="tv-settings-section-help">
										<HelpButton topic="tournament-settings" section={section.help} />
									</div>
								)}
								{section.body}
							</div>
						</section>
					);
				})}
			</div>
		</div>
	);
}

function plural(count, one, many) {
	return `${count} ${count === 1 ? one : many}`;
}

function templateName(key) {
	if (!key) return 'None';
	if (key.startsWith('custom:')) return 'Uploaded template';
	return SYSTEM_TEMPLATES.find((template) => template.key === key)?.label ?? key;
}

// Who else works on this tournament, and in which role. Adding is immediate —
// there is no invite for them to accept — and so are changing and removing.
function EditorsBand({ tournamentId, onCount }) {
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
					onCount?.((response.data ?? []).length);
				}
			} catch (apiError) {
				if (active) setLoadError(apiError.message);
			}
		})();

		return () => {
			active = false;
		};
	}, [tournamentId, version, onCount]);

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
		<>
			<div className="tv-info-card tv-info-card--combobox">

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
									<IconTooltip label={`Remove ${editor.username}`}>
										<button
											type="button"
											className="tv-icon-button tv-icon-button--icon tv-icon-button--danger"
											aria-label={`Remove ${editor.username}`}
											disabled={busy}
											onClick={() => handleRemove(editor)}>
											<Icon name="delete" size={20} fill="currentColor" />
										</button>
									</IconTooltip>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</>
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

// The Divisions section: one division's rules at a time, in panels that stack
// at every width — Pool draw, Ranking, Tiebreak deciders, Placement matches.
// Every control saves as it is changed. See docs/tournament-rules.md.
function DivisionSettingsBand({ divisions, status, onChanged }) {
	const { showMessage } = useMessage();
	const confirm = useConfirm();
	const [selectedId, setSelectedId] = useState(null);
	// Placement depth regenerates knockout fixtures, and a pool or matchup draw
	// change, a redraw or a reshuffle regenerates all of them, which takes long
	// enough to look like nothing happened; the ranking rules do not.
	const [regenerating, setRegenerating] = useState(false);
	const [copying, setCopying] = useState(false);
	// What was chosen and not yet confirmed by a refetch, so a control does not
	// snap back to its old value for the round trip. Dropped on failure.
	const [pending, setPending] = useState({});
	// One request at a time per division. A change made while one is in flight
	// waits and is sent after it, merged with any made since, so a run of taps
	// on a stepper is a couple of requests and the last value always wins.
	const queue = useRef(new Map());

	const dropPending = (divisionId) =>
		setPending((current) => {
			const remaining = { ...current };
			delete remaining[divisionId];
			return remaining;
		});

	const save = async (division, settings) => {
		setPending((current) => ({ ...current, [division.id]: { ...current[division.id], ...settings } }));

		const entry = queue.current.get(division.id) ?? { sending: false, next: null };
		queue.current.set(division.id, entry);
		if (entry.sending) {
			entry.next = { ...entry.next, ...settings };
			return;
		}

		entry.sending = true;
		if (
			'placementDepth' in settings ||
			'poolDraw' in settings ||
			settings.redrawPools ||
			'matchupDraw' in settings ||
			settings.reshuffleMatchups
		) {
			setRegenerating(true);
		}

		try {
			let sending = settings;
			while (sending) {
				await updateDivisionSettings(division.id, sending);
				sending = entry.next;
				entry.next = null;
			}
			showMessage(`${division.name} updated.`, 'success');
			onChanged?.();
		} catch (apiError) {
			entry.next = null;
			dropPending(division.id);
			showMessage(apiError.message, 'error');
		} finally {
			entry.sending = false;
			setRegenerating(false);
		}
	};

	if (divisions.length === 0) {
		return <SectionState variant="empty" title="This tournament has no divisions" />;
	}

	const division = divisions.find((entry) => entry.id === selectedId) ?? divisions[0];
	const waiting = pending[division.id] ?? {};
	const rules = waiting.rankingRules ?? rulesOf(division);
	const placementDepth = 'placementDepth' in waiting ? waiting.placementDepth : division.placement_depth ?? null;
	const knockout = knockoutOf(division);
	const poolDraw = waiting.poolDraw ?? poolDrawOf(division.state?.poolDraw?.method);
	const matchupDraw = waiting.matchupDraw ?? matchupDrawOf(division.state?.matchupDraw?.method);
	const disabled = regenerating || copying;
	const others = divisions.filter((entry) => entry.id !== division.id);

	const saveRules = (next) => save(division, { rankingRules: next });

	// Ranking and deciders only. Placement depends on each division's own
	// knockout, and may already be locked in some of them.
	const copyToAll = async () => {
		const confirmed = await confirm(
			`The ranking and tiebreak deciders of ${division.name} replace those of ${
				others.length === 1 ? others[0].name : `the other ${others.length} divisions`
			}. Their tables re-sort straight away. Placement matches are not copied.`,
			{ title: 'Copy to all divisions?', confirmLabel: 'Copy rules', cancelLabel: 'Cancel' },
		);
		if (!confirmed) return;

		setCopying(true);
		try {
			for (const other of others) {
				await updateDivisionSettings(other.id, { rankingRules: rules });
			}
			setPending((current) => {
				const next = { ...current };
				others.forEach((other) => {
					next[other.id] = { ...next[other.id], rankingRules: rules };
				});
				return next;
			});
			showMessage(`Rules copied to ${others.length === 1 ? others[0].name : `${others.length} divisions`}.`, 'success');
		} catch (apiError) {
			showMessage(apiError.message, 'error');
		} finally {
			setCopying(false);
			onChanged?.();
		}
	};

	return (
		<div className="tv-rules">
			{divisions.length > 1 && (
				<div className="tv-rules-head">
					<div className="tv-division-chips" role="group" aria-label="Division">
						{divisions.map((entry) => (
							<button
								key={entry.id}
								type="button"
								className="tv-division-chip"
								style={divisionColorStyle(entry.id, divisions)}
								aria-pressed={entry.id === division.id}
								onClick={() => setSelectedId(entry.id)}>
								<span className="tv-division-chip-dot" aria-hidden="true" />
								{entry.name}
							</button>
						))}
					</div>

					<button type="button" className="tv-icon-button tv-rules-copy" disabled={disabled} onClick={copyToAll}>
						<Icon name="copy" size={18} fill="currentColor" />
						Copy to all divisions
					</button>
				</div>
			)}

			<p className="tv-rules-division">
				<strong>{division.name}</strong>
				{division.type ? ` · ${division.type}` : ''} · {division.num_teams ?? division.teams?.length ?? 0} teams
			</p>

			{/* A League has no pools to draw. */}
			{division.type === 'Classic' && (
				<PoolDrawPanel
					draw={poolDraw}
					poolCount={division.state?.rounds?.[0]?.groups?.length || 1}
					locked={!isNotStarted(status)}
					disabled={disabled}
					onChange={(next) => save(division, { poolDraw: next })}
					onRedraw={() => save(division, { redrawPools: true })}
				/>
			)}

			{/* Only a League with a limited number of games per team chooses its
			    opponents: in legs mode every team meets every other team. */}
			{isLimitedLeague(division) && (
				<MatchupPanel
					draw={matchupDraw}
					locked={!isNotStarted(status)}
					disabled={disabled}
					onChange={(next) => save(division, { matchupDraw: next })}
					onReshuffle={() => save(division, { reshuffleMatchups: true })}
				/>
			)}

			<RankingPanel rules={rules} disabled={disabled} onChange={saveRules} />
			<DecidersPanel rules={rules} disabled={disabled} onChange={saveRules} />

			{/* Only where there are semifinal losers to play, or not play, for 3rd.
			    A League has no knockout stage at all. */}
			{knockout?.hasSemifinals && (
				<PlacementPanel
					knockout={knockout}
					depth={placementDepth}
					divisionTeams={division.num_teams ?? division.teams?.length ?? 0}
					disabled={disabled}
					onChange={(depth) => save(division, { placementDepth: depth })}
				/>
			)}

			{regenerating && <LoadingScreen context="divisionSave" />}
		</div>
	);
}

function RulesPanel({ title, help, aside, children }) {
	return (
		<section className="tv-info-card tv-rules-panel">
			<div className="tv-rules-panel-head">
				<div className="tv-rules-panel-title">
					<h3>{title}</h3>
					<HelpButton topic="tournament-settings" section={help} />
				</div>
				{aside}
			</div>
			{children}
		</section>
	);
}

// How seeds are placed into pools — docs/tournament-rules.md, "Pool Draw".
// Changing it, or redrawing a pots draw, rebuilds the division's pools and
// fixtures the way a seed reorder does, so it locks when the tournament starts.
// The server holds the gate; this only stops offering what it would refuse.
function PoolDrawPanel({ draw, poolCount, locked, disabled, onChange, onRedraw }) {
	const off = disabled || locked;

	// Up to three pools of three seeds: enough to see the pattern, small enough
	// for a card. A pots draw is random below its first pot, so the rest of its
	// grid is left open rather than showing a draw that has not been made.
	const gridOf = (method) =>
		poolMembership(poolCount * 3, poolCount, method === 'POTS' ? DEFAULT_POOL_DRAW : method)
			.slice(0, 3)
			.map((members, pool) => (method === 'POTS' ? [pool + 1, '?', '?'] : members.map((position) => position + 1)));

	return (
		<RulesPanel
			title="Pool draw"
			help="pool-draw"
			aside={
				draw === 'POTS' && (
					<button type="button" className="tv-icon-button tv-draw-redraw" disabled={off} onClick={onRedraw}>
						<Icon name="shuffle" size={18} fill="currentColor" />
						Redraw
					</button>
				)
			}>
			<div className="tv-draw-options" role="group" aria-label="Pool draw">
				{POOL_DRAWS.map((option) => (
					<button
						key={option.value}
						type="button"
						className="tv-draw-option"
						aria-pressed={option.value === draw}
						disabled={off}
						onClick={() => option.value !== draw && onChange(option.value)}>
						<span className="tv-draw-option-head">
							<span className="tv-points-label">{option.label}</span>
							{option.value === DEFAULT_POOL_DRAW && (
								<span className="tv-ladder-badge tv-ladder-badge--default">Default</span>
							)}
						</span>
						<span className="tv-points-hint">{option.summary}</span>
						<span className="tv-draw-grid" aria-hidden="true">
							{gridOf(option.value).map((seeds, pool) => (
								<span key={pool} className="tv-draw-grid-row">
									<b>{String.fromCharCode(65 + pool)}</b>
									{seeds.map((seed, index) => (
										<span key={index}>{seed}</span>
									))}
								</span>
							))}
						</span>
					</button>
				))}
			</div>

		</RulesPanel>
	);
}

// A League plays a limited number of games per team when its one round-robin
// round has fewer games than a full cycle — the way leagueConfigFromState in
// api/src/services/divisions.service.js reads it back.
function isLimitedLeague(division) {
	if (division.type !== 'League') return false;

	const rounds = (division.state?.rounds ?? []).filter((round) => round.type === 'roundRobin');
	const teams = division.state?.teams?.length ?? 0;
	const fullCycle = (teams * (teams - 1)) / 2;

	return rounds.length === 1 && rounds[0].totalGames > 0 && rounds[0].totalGames < fullCycle;
}

// Who plays whom in a limited League — docs/tournament-rules.md, "Matchups
// (limited round robin)". Like the pool draw, changing it or reshuffling
// rebuilds the division's fixtures, so it locks when the tournament starts.
function MatchupPanel({ draw, locked, disabled, onChange, onReshuffle }) {
	const off = disabled || locked;

	return (
		<RulesPanel
			title="Matchups"
			help="matchups"
			aside={
				<div className="tv-rules-panel-actions">
					{draw === 'RANDOM' && (
						<button type="button" className="tv-icon-button" disabled={off} onClick={onReshuffle}>
							<Icon name="shuffle" size={18} fill="currentColor" />
							Reshuffle
						</button>
					)}
					<div className="tv-seg" role="group" aria-label="Matchups">
						{MATCHUP_DRAWS.map((option) => (
							<button
								key={option.value}
								type="button"
								aria-pressed={option.value === draw}
								disabled={off}
								onClick={() => option.value !== draw && onChange(option.value)}>
								{option.label}
							</button>
						))}
					</div>
				</div>
			}
		/>
	);
}

function RankingPanel({ rules, disabled, onChange }) {
	const name = useId();
	const setPoints = (points) => onChange({ ...rules, points });

	return (
		<RulesPanel
			title="Ranking"
			help="ranking"
			aside={
				<div className="tv-seg" role="group" aria-label="Ranking method">
					{[
						['points', 'Points'],
						['wins', 'Wins'],
					].map(([method, label]) => (
						<button
							key={method}
							type="button"
							aria-pressed={rules.method === method}
							disabled={disabled}
							onClick={() => onChange(withMethod(rules, method))}>
							{label}
						</button>
					))}
				</div>
			}>
			{rules.method === 'points' ? (
				<>
					<div className="tv-presets" role="group" aria-label="Point presets">
						{POINT_PRESETS.map((preset) => (
							<button
								key={preset.label}
								type="button"
								className="tv-preset"
								aria-pressed={samePoints(preset.points, rules.points)}
								disabled={disabled}
								onClick={() => setPoints({ ...preset.points })}>
								{preset.label}
							</button>
						))}
					</div>

					<ul className="tv-points">
						{POINT_RESULTS.map(({ key, label }) => {
							const value = rules.points[key];
							const step = (by) => setPoints({ ...rules.points, [key]: value + by });

							return (
								<li key={key} className="tv-points-row">
									<span className="tv-points-label">{label}</span>
									<span className="tv-stepper" role="group" aria-label={`Points for a ${label.toLowerCase()}`}>
										<button type="button" aria-label="One point fewer" disabled={disabled || value <= 0} onClick={() => step(-1)}>
											−
										</button>
										<output aria-live="polite">{value}</output>
										<button
											type="button"
											aria-label="One point more"
											disabled={disabled || value >= MAX_MATCH_POINTS}
											onClick={() => step(1)}>
											+
										</button>
									</span>
								</li>
							);
						})}
					</ul>
				</>
			) : (
				<div className="tv-rules-radios" role="radiogroup" aria-label="Wins counted">
					{[
						['matches', 'Match wins'],
						['sets', 'Set wins'],
					].map(([wins, label]) => (
						<label key={wins} className="tv-rules-radio">
							<input
								type="radio"
								name={name}
								checked={rules.wins === wins}
								disabled={disabled}
								onChange={() => onChange({ ...rules, wins })}
							/>
							<span className="tv-points-label">{label}</span>
						</label>
					))}
				</div>
			)}
		</RulesPanel>
	);
}

const DECIDER_DRAG = 'tv-decider:';

function DecidersPanel({ rules, disabled, onChange }) {
	const [draggingIndex, setDraggingIndex] = useState(null);
	const [overIndex, setOverIndex] = useState(null);
	const used = rules.tiebreakers;
	const unused = TIEBREAKERS.filter((entry) => !used.includes(entry.key));

	const setOrder = (tiebreakers) => {
		if (tiebreakers !== used) onChange({ ...rules, tiebreakers });
	};
	const move = (from, to) => setOrder(moveTiebreaker(used, from, to));
	const endDrag = () => {
		setDraggingIndex(null);
		setOverIndex(null);
	};

	const handleDrop = (event, index) => {
		event.preventDefault();
		const payload = event.dataTransfer.getData('text/plain') || '';
		endDrag();
		if (!payload.startsWith(DECIDER_DRAG)) return;

		const from = Number(payload.slice(DECIDER_DRAG.length));
		if (Number.isInteger(from)) move(from, index);
	};

	const handleGripKeyDown = (event, index) => {
		const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (step === 0) return;

		event.preventDefault();
		move(index, index + step);
	};

	return (
		<RulesPanel title="Tiebreak deciders" help="deciders">
			<ol className="tv-deciders">
				{used.map((key, index) => {
					const entry = TIEBREAKERS.find((candidate) => candidate.key === key);
					const label = entry?.label ?? key;

					return (
						<li
							key={key}
							className={`tv-decider${draggingIndex === index ? ' tv-decider--dragging' : ''}${
								overIndex === index && draggingIndex !== index ? ' tv-decider--over' : ''
							}`}
							onDragOver={(event) => {
								// Only a row from this list is a valid drop.
								if (draggingIndex === null) return;
								event.preventDefault();
								event.dataTransfer.dropEffect = 'move';
								setOverIndex(index);
							}}
							onDrop={(event) => handleDrop(event, index)}>
							<button
								type="button"
								className="tv-team-grip tv-decider-grip"
								draggable
								disabled={disabled}
								onDragStart={(event) => {
									event.dataTransfer.effectAllowed = 'move';
									event.dataTransfer.setData('text/plain', `${DECIDER_DRAG}${index}`);
									setDraggingIndex(index);
								}}
								onDragEnd={endDrag}
								onKeyDown={(event) => handleGripKeyDown(event, index)}
								aria-label={`Move ${label} from position ${index + 1}. Drag, or use the up and down arrow keys.`}>
								<Icon name="grip" size={16} fill="currentColor" />
							</button>
							<span className="tv-decider-number">{index + 1}</span>
							<span className="tv-decider-text">
								<span className="tv-points-label">{label}</span>
							</span>
							<span className="tv-decider-actions">
								<button
									type="button"
									className="tv-decider-button"
									aria-label={`Move ${label} up`}
									disabled={disabled || index === 0}
									onClick={() => move(index, index - 1)}>
									<StrokeIcon path="m6 15 6-6 6 6" />
								</button>
								<button
									type="button"
									className="tv-decider-button"
									aria-label={`Move ${label} down`}
									disabled={disabled || index === used.length - 1}
									onClick={() => move(index, index + 1)}>
									<StrokeIcon path="m6 9 6 6 6-6" />
								</button>
								<button
									type="button"
									className="tv-decider-button"
									aria-label={`Stop using ${label}`}
									disabled={disabled}
									onClick={() => setOrder(used.filter((candidate) => candidate !== key))}>
									<StrokeIcon path="M6 6l12 12M18 6 6 18" />
								</button>
							</span>
						</li>
					);
				})}

				<li className="tv-decider tv-decider--pinned">
					<span className="tv-decider-lock" aria-hidden="true">
						<StrokeIcon path="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" />
					</span>
					<span className="tv-decider-number">{used.length + 1}</span>
					<span className="tv-decider-text">
						<span className="tv-points-label">Seeding</span>
					</span>
				</li>
			</ol>

			{unused.length > 0 && (
				<div className="tv-presets" role="group" aria-label="Add a decider">
					<span className="tv-points-hint">Add a decider:</span>
					{unused.map((entry) => (
						<button
							key={entry.key}
							type="button"
							className="tv-preset"
							disabled={disabled}
							onClick={() => setOrder([...used, entry.key])}>
							+ {entry.label}
						</button>
					))}
				</div>
			)}
		</RulesPanel>
	);
}

function PlacementPanel({ knockout, depth, divisionTeams, disabled, onChange }) {
	const locked = disabled || knockout.started;

	return (
		<RulesPanel title="Placement matches" help="placement">
			<div className="tv-placement-pick">
				<span className="tv-points-label">Play for places down to</span>
				<div className="tv-seg tv-seg--wrap" role="group" aria-label="Play for places down to">
					{placementOptions(knockout).map((option) => (
						<button
							key={option.label}
							type="button"
							aria-pressed={option.depth === depth}
							disabled={locked}
							onClick={() => option.depth !== depth && onChange(option.depth)}>
							{option.label}
						</button>
					))}
				</div>
			</div>

			<ul className="tv-ladder">
				{placementLadder(knockout, depth, divisionTeams).map((row) => (
					<li key={row.place} className={`tv-ladder-row tv-ladder-row--${row.state}`}>
						<b>{row.place}</b>
						<span>{row.label}</span>
						{row.badge && <span className={`tv-ladder-badge${row.isDefault ? ' tv-ladder-badge--default' : ''}`}>{row.badge}</span>}
					</li>
				))}
			</ul>

		</RulesPanel>
	);
}

function StrokeIcon({ path }) {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d={path} />
		</svg>
	);
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
		<div className="tv-info-card tv-settings-danger">
			<div className="tv-settings-row">
				<div>
					<p className="tv-settings-row-name">Delete this tournament</p>
				</div>
				<button type="button" className="tv-danger-action" disabled={busy} onClick={handleDelete}>
					Delete Tournament
				</button>
			</div>
		</div>
	);
}

// The scoresheet templates as cards: the two built in, any uploaded on this
// device, and an upload card. Choosing a card, or Clear selection, saves
// straight away through the same endpoint the template modal saves with; the
// border marks the one in use. "Edit fields" and "Upload a PDF" open that
// modal, unchanged, where both flows live.
//
// The choosing control is the card's body, and "Edit fields" sits beside it
// rather than inside it: a button cannot hold another button.
function ScoresheetSection({ selectedKey, busy, onUse }) {
	const [custom, setCustom] = useState(null);
	const [version, setVersion] = useState(0);
	const [modalOpen, setModalOpen] = useState(false);

	// Uploaded templates live in this device's IndexedDB, not on the server.
	// Re-read whenever the modal closes, since it may have added or edited one.
	useEffect(() => {
		let active = true;
		listTemplates()
			.then((templates) => {
				if (active) setCustom(templates);
			})
			.catch(() => {
				if (active) setCustom([]);
			});
		return () => {
			active = false;
		};
	}, [version]);

	const closeModal = () => {
		setModalOpen(false);
		setVersion((count) => count + 1);
	};

	const cards = [
		...SYSTEM_TEMPLATES.map((template) => ({
			key: template.key,
			name: template.label,
			meta: 'Built in',
			warning: template.fields.length === 0 ? 'Not set up yet: no fields are placed.' : null,
		})),
		...(custom ?? []).map((template) => {
			// Distinct fields, not marker count — a field placed twice still counts once.
			const placed = new Set(template.fields.map((marker) => marker.field)).size;
			return {
				key: `custom:${template.id}`,
				name: template.name,
				meta: `Uploaded on this device · ${placed} of ${SCORESHEET_FIELDS.length} fields placed`,
				warning: placed < SCORESHEET_FIELDS.length ? 'Some fields will never print on this template.' : null,
				custom: true,
			};
		}),
	];

	// Chosen on another device: it can only be printed there, but it is still the
	// one in use, so it is shown rather than leaving nothing marked.
	if (custom && selectedKey?.startsWith('custom:') && !cards.some((card) => card.key === selectedKey)) {
		cards.push({
			key: selectedKey,
			name: 'Uploaded template',
			meta: 'Uploaded on another device, so it can only be printed there.',
			warning: null,
			// Shown as the one in use, but not a choice that can be made here.
			elsewhere: true,
		});
	}

	return (
		<>
			<ul className="tv-template-cards">
				{cards.map((card) => {
					const inUse = card.key === selectedKey;
					const text = (
						<>
							<span className="tv-template-card-name">{card.name}</span>
							<span className="tv-template-card-meta">{card.meta}</span>
							{card.warning && <span className="tv-template-card-warning">{card.warning}</span>}
						</>
					);

					return (
						<li key={card.key} className={`tv-template-card${inUse ? ' tv-template-card--in-use' : ''}`}>
							{card.elsewhere ? (
								<div className="tv-template-card-body">{text}</div>
							) : (
								<button
									type="button"
									className="tv-template-card-body tv-template-card-choose"
									aria-pressed={inUse}
									disabled={busy}
									onClick={() => !inUse && onUse(card.key)}>
									{text}
								</button>
							)}
							{(inUse || card.custom) && (
								<div className="tv-template-card-actions">
									{inUse && <span className="tv-template-card-badge">In use</span>}
									{card.custom && (
										<button type="button" className="tv-icon-button" disabled={busy} onClick={() => setModalOpen(true)}>
											<Icon name="edit" size={18} fill="currentColor" />
											Edit fields
										</button>
									)}
								</div>
							)}
						</li>
					);
				})}

				{custom === null && (
					<li className="tv-template-card tv-template-card--loading">
						<LoadingScreen variant="inline" /> Loading uploaded templates…
					</li>
				)}

				<li className="tv-template-card tv-template-card--upload">
					<div className="tv-template-card-body">
						<span className="tv-template-card-name">Your own scoresheet</span>
						<span className="tv-template-card-meta">
							Upload a PDF and mark where each field prints. It stays on the device it was uploaded from.
						</span>
					</div>
					<div className="tv-template-card-actions">
						<button type="button" className="tv-icon-button" disabled={busy} onClick={() => setModalOpen(true)}>
							<Icon name="upload" size={18} fill="currentColor" />
							Upload a PDF
						</button>
					</div>
				</li>
			</ul>

			{selectedKey ? (
				<button type="button" className="tv-icon-button" disabled={busy} onClick={() => onUse(null)}>
					<Icon name="exit" size={18} fill="currentColor" />
					Clear selection
				</button>
			) : (
				<p className="tv-settings-note">No template in use</p>
			)}

			{modalOpen && (
				<Suspense fallback={<LoadingScreen />}>
					<ScoresheetTemplateModal
						initialTemplateKey={selectedKey}
						onCancel={closeModal}
						onSave={(key) => {
							closeModal();
							onUse(key);
						}}
					/>
				</Suspense>
			)}
		</>
	);
}

// The three stages of a tournament, with the one step it can take next. Start
// and End ask the same questions as the Overview's buttons (useTournamentLifecycle).
function StatusSection({ status, lifecycle }) {
	const currentIndex = Math.max(
		0,
		STATUS_STEPS.findIndex((step) => step.value === status),
	);

	return (
		<div className="tv-info-card">
			<ol className="tv-status-steps">
				{STATUS_STEPS.map((step, index) => {
					const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
					return (
						<li key={step.value} className={`tv-status-step tv-status-step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
							<span className="tv-status-step-marker" aria-hidden="true">
								{index + 1}
							</span>
							<span className="tv-status-step-text">
								<span className="tv-status-step-label">{step.label}</span>
							</span>
						</li>
					);
				})}
			</ol>

			{status === 'Not Started' && (
				<button type="button" className="tv-primary-action" disabled={lifecycle.busy} onClick={lifecycle.start}>
					Start tournament
				</button>
			)}
			{status === 'Ongoing' && (
				<button type="button" className="tv-primary-action" disabled={lifecycle.busy} onClick={lifecycle.end}>
					End tournament
				</button>
			)}
		</div>
	);
}
