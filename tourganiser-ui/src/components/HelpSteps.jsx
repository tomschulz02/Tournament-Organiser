import { useState } from 'react';
import Icon from './Icons';

// The pieces a walkthrough is built from, shared by the help modal and the
// What's new popup (components/WhatsNewModal.jsx).
//
// media: { type: 'image' | 'animation', src, alt, still?, phoneSrc?, phoneStill? }.
// An animation is an animated WebP and must carry a still, shown instead under
// prefers-reduced-motion: an <img> cannot pause what it plays. phoneSrc (and,
// for an animation, phoneStill) are the phone-width captures, chosen at 768px
// and below. A media item without a src (not captured yet) renders nothing.
const PHONE = '(max-width: 768px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

export function HelpMedia({ media }) {
	if (!media?.src) return null;

	const animated = media.type === 'animation';
	// Most specific first: the browser takes the first <source> that matches.
	const sources = [
		animated && media.phoneStill && { srcSet: media.phoneStill, media: `${PHONE} and ${REDUCED}` },
		animated && media.still && { srcSet: media.still, media: REDUCED },
		media.phoneSrc && { srcSet: media.phoneSrc, media: PHONE },
	].filter(Boolean);

	const image = <img className="help-media" src={media.src} alt={media.alt ?? ''} loading="lazy" decoding="async" />;
	if (sources.length === 0) return image;

	return (
		<picture>
			{sources.map((source) => (
				<source key={source.media} srcSet={source.srcSet} media={source.media} />
			))}
			{image}
		</picture>
	);
}

// One step at a time, with Back and Next. The step count is announced politely
// as it changes, so a screen reader hears where it is without losing focus.
//
// steps: [{ title?, text: [string], media? }]. The What's new popup gives each
// step a title and follows the index through onIndexChange (its Done button
// shows on the last step).
export function HelpStepper({ steps, label, onIndexChange }) {
	const [index, setIndex] = useState(0);
	const step = steps[index];
	const last = steps.length - 1;

	const go = (next) => {
		const clamped = Math.min(last, Math.max(0, next));
		setIndex(clamped);
		onIndexChange?.(clamped);
	};

	return (
		<div className="help-stepper" role="group" aria-label={label}>
			<div className="help-stepper-step">
				{step.title && <h3 className="help-stepper-title">{step.title}</h3>}
				{step.text.map((paragraph, paragraphIndex) => (
					<p key={paragraphIndex}>{paragraph}</p>
				))}
				<HelpMedia media={step.media} />
			</div>

			<div className="help-stepper-controls">
				<button
					type="button"
					className="help-stepper-button"
					disabled={index === 0}
					onClick={() => go(index - 1)}>
					<Icon name="leftChevron" size={18} fill="currentColor" />
					Back
				</button>
				<span className="help-stepper-count" aria-live="polite">
					Step {index + 1} of {steps.length}
				</span>
				<button
					type="button"
					className="help-stepper-button"
					disabled={index === last}
					onClick={() => go(index + 1)}>
					Next
					<Icon name="leftChevron" size={18} fill="currentColor" className="help-stepper-next-icon" />
				</button>
			</div>
		</div>
	);
}
