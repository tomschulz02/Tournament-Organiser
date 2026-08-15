import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { useMessage } from '../MessageContext';
import { useConfirm } from '../components/ConfirmDialog';
import { createTournament } from '../requests';
import DivisionCard from '../components/create/DivisionCard';
import DivisionModal from '../components/create/DivisionModal';
import ReviewModal from '../components/create/ReviewModal';
import { createEmptyDivision, isConfigurableFormat, isDivisionValid } from '../components/create/divisionFormats';
import { clearDraft, describeDraftAge, hasDraftContent, readDraft, writeDraft } from '../utils/createDraft';
import '../styles/create-tournament.css';

// Long enough that a burst of typing is one write, short enough that a refresh
// a heartbeat after the last keystroke still has it.
const DRAFT_SAVE_DELAY = 400;

// The limits the server actually enforces, in api/src/services/tournaments.service.js.
//
// Note that `name` is 100, not 50. tournaments.name is a `text` column — see
// docs/database.md — and only `location` is varchar(50). The old form capped the
// name at 50 on the belief that both were bounded columns, which refused names
// the database and the API would both have accepted.
const NAME_MAX = 100;
const LOCATION_MAX = 50;
const DESCRIPTION_MAX = 2000;

// A counter that is always on screen is noise; one that appears as the limit
// comes into view is a warning. Shown for the last fifth of the allowance.
const COUNTER_VISIBLE_FROM = 0.8;

// The fields the tournament cannot be created without. Description is
// deliberately absent: it is optional, and the progress bar must reach 100%
// without it.
const REQUIRED_DETAIL_FIELDS = ['name', 'location', 'start_date', 'end_date'];

const EMPTY_DETAILS = {
	name: '',
	location: '',
	start_date: '',
	end_date: '',
	description: '',
};

// Plain language, no field names, no technical terms. Each one reads as a thing
// to do rather than a complaint about what was done.
function validateDetails(details) {
	const errors = {};

	const name = details.name.trim();
	if (name.length === 0) {
		errors.name = 'Your tournament needs a name.';
	} else if (details.name.length > NAME_MAX) {
		errors.name = `That name is a little long. Keep it to ${NAME_MAX} characters.`;
	}

	const location = details.location.trim();
	if (location.length === 0) {
		errors.location = 'Say where the tournament is being held.';
	} else if (details.location.length > LOCATION_MAX) {
		errors.location = `That location is a little long. Keep it to ${LOCATION_MAX} characters.`;
	}

	if (!details.start_date) {
		errors.start_date = 'Pick the day the tournament starts.';
	}

	if (!details.end_date) {
		errors.end_date = 'Pick the day the tournament ends.';
	} else if (details.start_date && details.end_date < details.start_date) {
		// Both are yyyy-mm-dd from a date input, so a string comparison is a date
		// comparison. Nothing on the server checks this, and a tournament that
		// ends before it begins is worth catching here.
		errors.end_date = 'The end date comes before the start date.';
	}

	// The description never blocks anything, so it has no empty case — only the
	// length the server would refuse.
	if (details.description.length > DESCRIPTION_MAX) {
		errors.description = `That description is very long. Keep it to ${DESCRIPTION_MAX} characters.`;
	}

	return errors;
}

// Half the bar is the tournament's own details, half is having at least one
// division. The details half moves a quarter at a time as the four required
// fields are filled, which is the "incrementally rather than in two jumps" the
// handover asks for. The divisions half cannot be subdivided: a division is
// added whole, already validated by its modal, so there is no half-entered one
// to represent.
function calculateProgress(details, divisions) {
	const filled = REQUIRED_DETAIL_FIELDS.filter((field) => String(details[field] ?? '').trim().length > 0).length;
	const detailsShare = (filled / REQUIRED_DETAIL_FIELDS.length) * 50;
	const divisionsShare = divisions.length > 0 ? 50 : 0;

	return Math.round(detailsShare + divisionsShare);
}

// What still stands between the organiser and a tournament, in the order they
// would deal with it. Used instead of a disabled button that explains nothing.
function findMissing(details, detailErrors, divisions) {
	const missing = [];

	// One line for the details rather than one per field: the fields themselves
	// are on screen a few centimetres above, already saying what is wrong.
	const brokenDetailFields = REQUIRED_DETAIL_FIELDS.filter((field) => detailErrors[field]);
	if (brokenDetailFields.length > 0) {
		missing.push(
			brokenDetailFields.length === 1
				? 'One of the tournament details still needs your attention.'
				: 'Some of the tournament details still need your attention.'
		);
	}

	if (detailErrors.description) {
		missing.push('The description is longer than we can store.');
	}

	if (divisions.length === 0) {
		missing.push('Add at least one division.');
	} else {
		// A division can only be added once it validates, but editing the page
		// around it — or a draft restored from an older version — can leave one
		// that no longer does.
		const broken = divisions.filter((division) => !isDivisionValid(division));
		for (const division of broken) {
			missing.push(`${division.name || 'One of the divisions'} is not ready yet. Open it to see why.`);
		}
	}

	return missing;
}

// Only the fields the endpoint reads, in the shape it reads them.
//
// num_groups and knockout_teams are omitted entirely for a format that has
// neither, and no team id is sent: teams belong to divisions and are always
// created fresh, so createDivision generates their ids itself.
function buildPayload(details, divisions) {
	return {
		details: {
			name: details.name.trim(),
			location: details.location.trim(),
			start_date: details.start_date,
			end_date: details.end_date,
			description: details.description.trim(),
		},
		divisions: divisions.map((division) => ({
			name: division.name,
			type: division.type,
			num_teams: division.teams.length,
			...(isConfigurableFormat(division.type) && {
				num_groups: Number(division.num_groups),
				knockout_teams: Number(division.knockout_teams),
			}),
			teams: division.teams.map((team) => ({ name: team.name })),
		})),
	};
}

export default function CreateTournament() {
	const { isLoggedIn } = useContext(AuthContext);

	// Creation is the only authenticated write path in the application, and the
	// old page turned logged-out visitors away rather than letting them fill in
	// thirty-two team names before finding out. Same behaviour, new route.
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
	const [details, setDetails] = useState(EMPTY_DETAILS);
	const [divisions, setDivisions] = useState([]);
	// Which fields the organiser has actually engaged with. A field they have
	// not reached yet never reports itself, however empty it is.
	const [touchedDetails, setTouchedDetails] = useState({});
	// The division currently open in the modal, and whether it is one that is
	// already on the page. One modal serves both, so this is the whole of it.
	const [editing, setEditing] = useState(null);
	const [showReview, setShowReview] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	// The guard against a second submission, held in a ref rather than in
	// isCreating. State does not change until the next render, so two clicks
	// landing in the same tick both read the old value and both send a request —
	// which is exactly what a double-click is. A ref changes on the spot.
	const creatingRef = useRef(false);

	// A draft found in storage, waiting on a decision.
	//
	// Read in a lazy initialiser rather than an effect: it runs once, during the
	// first render, and needs no setState in an effect body — which the lint
	// config forbids outright. readDraft never throws.
	const [pendingDraft, setPendingDraft] = useState(() => readDraft());
	const [draftSaved, setDraftSaved] = useState(false);
	// A field the server rejected, as { field, message }. Held separately from
	// the client's own validation because the two disagree by definition: the
	// client already thought this value was fine.
	const [serverError, setServerError] = useState(null);

	// Put the organiser in front of the field the server named. Without this the
	// review closes and the message is a toast about a field they cannot see.
	useEffect(() => {
		if (!serverError) return;

		const element = document.getElementById(`ct-${serverError.field}`);
		element?.focus();
		element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}, [serverError]);

	// Autosave. Suspended entirely while a draft is waiting on a decision: the
	// form is empty at that point, and saving it would overwrite the very draft
	// being offered before the organiser has answered.
	useEffect(() => {
		if (pendingDraft) return;

		if (!hasDraftContent(details, divisions)) {
			// Nothing worth keeping — and if there was something a moment ago,
			// the organiser has since cleared it.
			//
			// The "Draft saved" line is not reset here. Resetting it would be a
			// synchronous setState in an effect body, which the lint config
			// forbids, and it is unnecessary: the line's own render condition
			// asks whether there is content, so it disappears on its own.
			clearDraft();
			return;
		}

		const timer = setTimeout(() => {
			// setState in a timeout, not in the effect body. The rule is about
			// synchronous cascading renders; this is neither.
			setDraftSaved(writeDraft(details, divisions));
		}, DRAFT_SAVE_DELAY);

		// A tab closed inside the debounce window would otherwise lose the last
		// thing typed, which is the one thing autosave exists to prevent.
		const flush = () => writeDraft(details, divisions);
		window.addEventListener('pagehide', flush);

		return () => {
			clearTimeout(timer);
			window.removeEventListener('pagehide', flush);
		};
	}, [details, divisions, pendingDraft]);

	const continueDraft = () => {
		setDetails(pendingDraft.details);
		setDivisions(pendingDraft.divisions);
		setPendingDraft(null);
	};

	const discardDraft = () => {
		clearDraft();
		setPendingDraft(null);
	};

	const confirm = useConfirm();
	const { showMessage } = useMessage();
	const navigate = useNavigate();

	const progress = calculateProgress(details, divisions);
	const detailErrors = validateDetails(details);
	const missing = findMissing(details, detailErrors, divisions);
	const isReady = missing.length === 0;

	const handleDetailChange = (field, value) => {
		setDetails((previous) => ({ ...previous, [field]: value }));
		// Touched on first edit as well as on blur, so a field that is filled and
		// then cleared says so straight away rather than waiting to lose focus.
		setTouchedDetails((previous) => (previous[field] ? previous : { ...previous, [field]: true }));
		// The server's complaint was about the old value. Editing the field
		// answers it, whether or not the new value is any better.
		setServerError((previous) => (previous?.field === field ? null : previous));
	};

	const handleDetailBlur = (field) => {
		setTouchedDetails((previous) => (previous[field] ? previous : { ...previous, [field]: true }));
	};

	const handleSaveDivision = (division) => {
		setDivisions((previous) => {
			const existing = previous.some((candidate) => candidate.id === division.id);

			return existing
				? previous.map((candidate) => (candidate.id === division.id ? division : candidate))
				: [...previous, division];
		});
		setEditing(null);
	};

	const handleRemoveDivision = async (division) => {
		const confirmed = await confirm(
			`Remove ${division.name || 'this division'} and its ${division.teams.length} teams?`
		);
		if (!confirmed) return;

		setDivisions((previous) => previous.filter((candidate) => candidate.id !== division.id));
	};

	const handleReview = () => {
		if (isReady) {
			setShowReview(true);
			return;
		}

		// The hard check, run on the way to the review. Every required field is
		// marked touched so the inline messages appear alongside the summary
		// under the button, rather than the organiser being told something is
		// wrong with no indication of where.
		setTouchedDetails((previous) => {
			const next = { ...previous };
			for (const field of REQUIRED_DETAIL_FIELDS) next[field] = true;
			return next;
		});
	};

	const handleCreate = async () => {
		if (creatingRef.current || !isReady) return;

		creatingRef.current = true;
		setIsCreating(true);
		try {
			// 201 with data: { id }. The request throws on failure, so reaching
			// the next line is the success case.
			const { data } = await createTournament(buildPayload(details, divisions));

			// Cleared here and nowhere else. Not on opening the review, not on
			// closing it, and not on a failed attempt — the draft is the only
			// copy of an evening's work until this line runs.
			clearDraft();

			showMessage('Tournament created successfully', 'success');
			// Replacing the entry keeps the back button off the filled-in form.
			navigate(`/tournaments/view/${data.id}`, { replace: true });
		} catch (error) {
			// Everything entered stays exactly where it is, the draft included,
			// and the action becomes available again so it can be retried.
			showMessage(error.message, 'error');

			// assertText puts the offending field in the error's `details`, which
			// arrives as `data`. When it names one of ours, close the review and
			// say so on the field itself rather than only in a toast.
			const field = error?.data?.field;
			if (field && field in EMPTY_DETAILS) {
				setTouchedDetails((previous) => ({ ...previous, [field]: true }));
				setServerError({ field, message: error.message });
				setShowReview(false);
			}

			creatingRef.current = false;
			setIsCreating(false);
		}
		// The guard is not reset on success: the page navigates away, and
		// releasing it first would leave a live Create button on a form that has
		// already been submitted.
	};

	return (
		<div className="ct-page">
			<div className="ct-intro">
				<h1 className="ct-title">Create a tournament</h1>
				<p className="ct-lede">
					Start with the tournament itself — what it is called, where and when it runs. Then add a division for each
					competition within it. Nothing is created until you review and confirm.
				</p>
			</div>

			{/* Offered, never restored behind the organiser's back — and nothing
			    is written over it until they have answered. */}
			{pendingDraft && (
				<div className="ct-draft-banner" role="status">
					<div className="ct-draft-banner-text">
						<p className="ct-draft-banner-title">You have an unfinished tournament</p>
						<p className="ct-draft-banner-detail">
							Saved {describeDraftAge(pendingDraft.savedAt) || 'earlier'}
							{pendingDraft.details.name.trim() && ` — ${pendingDraft.details.name.trim()}`}
						</p>
					</div>
					<div className="ct-draft-banner-actions">
						<button type="button" className="ct-button ct-button-quiet" onClick={discardDraft}>
							Start fresh
						</button>
						<button type="button" className="ct-button ct-button-primary" onClick={continueDraft}>
							Continue
						</button>
					</div>
				</div>
			)}

			<div className="ct-progress">
				<div
					className="ct-progress-track"
					role="progressbar"
					aria-valuenow={progress}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Setup progress">
					<div className="ct-progress-fill" style={{ width: `${progress}%` }} />
				</div>
				<span className="ct-progress-label">{progress}% ready</span>
			</div>

			{/* Quiet, and only once there is something saved to speak of. */}
			{draftSaved && !pendingDraft && hasDraftContent(details, divisions) && (
				<p className="ct-draft-saved">Draft saved</p>
			)}

			<div className="ct-sections">
				<section className="ct-section" aria-labelledby="ct-details-heading">
					<h2 className="ct-section-heading" id="ct-details-heading">
						Tournament details
					</h2>
					<p className="ct-section-hint">The name, place and dates everyone will see.</p>

					<TournamentDetailsFields
						details={details}
						errors={detailErrors}
						touched={touchedDetails}
						serverError={serverError}
						onChange={handleDetailChange}
						onBlur={handleDetailBlur}
					/>
				</section>

				<section className="ct-section" aria-labelledby="ct-divisions-heading">
					<h2 className="ct-section-heading" id="ct-divisions-heading">
						Divisions
					</h2>
					<p className="ct-section-hint">Each division is its own competition, with its own teams and format.</p>

					{divisions.length === 0 ? (
						// Guidance, not an error. Someone creating their first
						// tournament has no reason to know what a division is.
						<div className="ct-divisions-empty">
							<p className="ct-divisions-empty-lead">
								A division is one competition inside your tournament — Men&apos;s Open, Under 19, Mixed B. Each has its
								own teams, its own format and its own winner.
							</p>
							<p className="ct-divisions-empty-note">
								If your tournament is a single competition, one division is all you need.
							</p>
						</div>
					) : (
						<div className="ct-division-list">
							{divisions.map((division) => (
								<DivisionCard
									key={division.id}
									division={division}
									onEdit={() => setEditing({ division, isEditing: true })}
									onRemove={() => handleRemoveDivision(division)}
								/>
							))}
						</div>
					)}

					<button
						type="button"
						className="ct-add-division"
						onClick={() => setEditing({ division: createEmptyDivision(), isEditing: false })}>
						+ Add Division
					</button>
				</section>
			</div>

			<div className="ct-actions">
				{/* Live whether or not the setup is complete. A disabled button
				    with nothing to say is the thing this replaces — clicking it
				    while something is missing surfaces the inline messages and
				    the list below. */}
				<button
					type="button"
					className={`ct-review-button ${isReady ? '' : 'ct-review-button-incomplete'}`.trim()}
					aria-disabled={!isReady}
					onClick={handleReview}>
					Review Tournament
				</button>

				{isReady ? (
					<p className="ct-actions-note">Nothing is created until you confirm it on the next screen.</p>
				) : (
					<div className="ct-actions-missing">
						<p className="ct-actions-note">Before you can review this tournament:</p>
						<ul className="ct-missing-list">
							{missing.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
				)}
			</div>

			{editing && (
				<DivisionModal
					// Keyed on the division, so opening a different one starts the
					// modal on Basics with that division's values rather than
					// reusing the previous one's screen and draft.
					key={editing.division.id}
					division={editing.division}
					isEditing={editing.isEditing}
					onCancel={() => setEditing(null)}
					onSave={handleSaveDivision}
				/>
			)}

			{showReview && (
				<ReviewModal
					details={details}
					divisions={divisions}
					isCreating={isCreating}
					// The form stays mounted behind this. Closing returns to it
					// exactly as it was.
					onClose={() => setShowReview(false)}
					onCreate={handleCreate}
				/>
			)}
		</div>
	);
}

function TournamentDetailsFields({ details, errors, touched, serverError, onChange, onBlur }) {
	const fieldProps = (field) => ({
		field,
		value: details[field],
		// The server's word beats ours. It rejected a value the client thought
		// acceptable, so repeating the client's opinion would be noise.
		error: serverError?.field === field ? serverError.message : touched[field] ? errors[field] : undefined,
		onChange,
		onBlur,
	});

	return (
		<div className="ct-fields">
			<DetailField {...fieldProps('name')} label="Tournament name" required maxLength={NAME_MAX} />
			<DetailField {...fieldProps('location')} label="Location" required maxLength={LOCATION_MAX} />

			{/* Side by side once there is room for it, stacked below 768. */}
			<div className="ct-field-pair">
				<DetailField {...fieldProps('start_date')} label="Start date" type="date" required />
				<DetailField {...fieldProps('end_date')} label="End date" type="date" required />
			</div>

			<DetailField
				{...fieldProps('description')}
				label="Description"
				type="textarea"
				maxLength={DESCRIPTION_MAX}
				hint="Optional. Anything a visitor should know — the venue, the format, who to contact."
			/>
		</div>
	);
}

function DetailField({ field, label, value, error, onChange, onBlur, type = 'text', required = false, maxLength, hint }) {
	const inputId = `ct-${field}`;
	const errorId = `${inputId}-error`;
	const hintId = `${inputId}-hint`;

	// Counted against the same allowance the validator uses, so the number the
	// organiser sees and the rule they are being held to cannot drift apart.
	const showCounter = maxLength !== undefined && value.length >= maxLength * COUNTER_VISIBLE_FROM;

	const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

	const shared = {
		id: inputId,
		value,
		maxLength,
		onChange: (event) => onChange(field, event.target.value),
		onBlur: () => onBlur(field),
		'aria-invalid': error ? true : undefined,
		'aria-describedby': describedBy || undefined,
		className: `ct-input ${error ? 'ct-input-invalid' : ''}`.trim(),
	};

	return (
		<div className="ct-field">
			<label className="ct-field-label" htmlFor={inputId}>
				<span>{label}</span>
				{required && <span className="ct-field-required">Required</span>}
			</label>

			{type === 'textarea' ? (
				<textarea {...shared} rows={4} />
			) : (
				<input
					{...shared}
					type={type}
					// A tournament that has already started is not something this
					// page creates. Kept from the old form.
					min={type === 'date' ? new Date().toISOString().split('T')[0] : undefined}
				/>
			)}

			<div className="ct-field-foot">
				{error ? (
					<p className="ct-field-error" id={errorId}>
						{error}
					</p>
				) : (
					hint && (
						<p className="ct-field-hint" id={hintId}>
							{hint}
						</p>
					)
				)}
				{showCounter && (
					<span className="ct-field-counter">
						{value.length}/{maxLength}
					</span>
				)}
			</div>
		</div>
	);
}
