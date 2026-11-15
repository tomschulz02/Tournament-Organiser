import { useId, useLayoutEffect, useRef, useState } from 'react';
import CreateModal from './create/CreateModal';
import Icon from './Icons';
import { HelpMedia, HelpStepper } from './HelpSteps';
import { useHelp } from '../HelpContext';
import { HELP_TOPICS } from '../helpContent';
import { HELP_TABLES } from './helpTables';
import '../styles/create-tournament.css';

// Every topic but the fallback, in the order helpContent.js lists them.
const TOPIC_IDS = Object.keys(HELP_TOPICS).filter((id) => id !== 'fallback');

const topicOf = (id) => (id && HELP_TOPICS[id] ? id : 'fallback');

// The help, as a centred modal: the topic list down the left (a picker at the
// top on a phone) and the topic on the right. Opened through useHelp().openHelp
// — by the floating button, or by a "?" button at a topic and section. See
// docs/handover-help-and-less-text.md.
//
// `extraEntries` are list items that are not topics: [{ id, label, onSelect }].
// Choosing one closes help and calls onSelect.
export default function HelpModal({ extraEntries = [] }) {
	const { helpRequest } = useHelp();
	if (!helpRequest) return null;

	// Keyed by the request, so a second "?" pressed while help is open (from
	// inside it, say) starts again at its own topic and section.
	return <HelpModalContent key={`${helpRequest.topicId}:${helpRequest.sectionId}`} extraEntries={extraEntries} />;
}

function HelpModalContent({ extraEntries }) {
	const { helpRequest, activeTopic, closeHelp } = useHelp();
	const titleId = useId();
	const pickerId = useId();
	const contentRef = useRef(null);
	const [topicId, setTopicId] = useState(() => topicOf(helpRequest.topicId ?? activeTopic));
	// The section to scroll to, once. Cleared when another topic is chosen.
	const [sectionId, setSectionId] = useState(helpRequest.sectionId);

	const topic = HELP_TOPICS[topicId];
	const { title, icon = 'info', sections } = topic;

	useLayoutEffect(() => {
		const content = contentRef.current;
		if (!content) return;

		const target = sectionId ? content.querySelector(`[data-help-section="${CSS.escape(sectionId)}"]`) : null;
		if (!target) {
			content.scrollTop = 0;
			return;
		}

		const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		content.scrollTo({ top: target.offsetTop, behavior: reduce ? 'auto' : 'smooth' });
	}, [topicId, sectionId]);

	const choose = (id) => {
		const extra = extraEntries.find((entry) => entry.id === id);
		if (extra) {
			closeHelp();
			extra.onSelect();
			return;
		}

		setTopicId(id);
		setSectionId(null);
	};

	return (
		<CreateModal
			titleId={titleId}
			title={
				<span className="help-title">
					<Icon name={icon} size={24} fill="currentColor" />
					{title}
				</span>
			}
			onClose={closeHelp}
			size="help"
			backdropClassName="help-modal-backdrop">
			<div className="help-layout">
				<nav className="help-topics" aria-label="Help topics">
					<ul>
						{TOPIC_IDS.map((id) => (
							<li key={id}>
								<button
									type="button"
									className="help-topic"
									aria-current={id === topicId ? 'true' : undefined}
									onClick={() => choose(id)}>
									{HELP_TOPICS[id].title}
								</button>
							</li>
						))}
						{extraEntries.map((entry) => (
							<li key={entry.id}>
								<button type="button" className="help-topic help-topic--extra" onClick={() => choose(entry.id)}>
									{entry.label}
								</button>
							</li>
						))}
					</ul>
				</nav>

				<div className="help-picker">
					<label htmlFor={pickerId}>Topic</label>
					<select id={pickerId} value={topicId} onChange={(event) => choose(event.target.value)}>
						{topicId === 'fallback' && <option value="fallback">{HELP_TOPICS.fallback.title}</option>}
						{TOPIC_IDS.map((id) => (
							<option key={id} value={id}>
								{HELP_TOPICS[id].title}
							</option>
						))}
						{extraEntries.map((entry) => (
							<option key={entry.id} value={entry.id}>
								{entry.label}
							</option>
						))}
					</select>
				</div>

				<div className="help-content" ref={contentRef}>
					{sections.map((section) => (
						<HelpSection key={`${topicId}:${section.id}`} section={section} />
					))}
				</div>
			</div>
		</CreateModal>
	);
}

function HelpSection({ section }) {
	const Table = section.table ? HELP_TABLES[section.table] : null;

	return (
		<section className="help-section" data-help-section={section.id}>
			{section.heading && <h3 className="help-section-heading">{section.heading}</h3>}
			{(section.paragraphs ?? []).map((paragraph, index) => (
				<p key={index}>{paragraph}</p>
			))}
			{Table && <Table />}
			<HelpMedia media={section.media} />
			{section.steps?.length > 0 && <HelpStepper steps={section.steps} label={section.heading ?? 'Steps'} />}
		</section>
	);
}
