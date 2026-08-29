const LegalPage = () => {
	return (
		<main className="legal-page">
			<h1 className="legal-page-heading">Legal Information</h1>

			<nav className="legal-page-nav">
				<div className="legal-page-nav-links">
					<a href="#terms" className="legal-page-nav-link">
						Terms of Use
					</a>
					<a href="#privacy" className="legal-page-nav-link">
						Privacy Policy
					</a>
					<a href="#copyright" className="legal-page-nav-link">
						Copyright & Reuse Policy
					</a>
				</div>
			</nav>

			<div className="legal-page-banner-image"></div>

			{/* Terms of Use */}
			<section id="terms" className="legal-page-section">
				<h1 className="legal-page-section-heading">Terms of Use</h1>
				<p>
					<strong>1. Ownership & Content Use:</strong> All original content is the intellectual property of Tourganiser
					unless otherwise stated. You may reuse content non-commercially if you credit Tourganiser and link back to the
					original source.
				</p>
				<p>
					<strong>2. User-Generated Content:</strong> By submitting tournaments or other data, you confirm you have the
					rights to post that content and grant Tourganiser a royalty-free license to store, display, and promote it. We
					reserve the right to remove or moderate content that violates these terms.
				</p>
				<p>
					<strong>3. Acceptable Use:</strong> You agree not to upload illegal or harmful content, spam, or abuse
					platform features.
				</p>
				<p>
					<strong>4. Third-Party Links:</strong> We are not responsible for content on external websites linked from
					Tourganiser.
				</p>
				<p>
					<strong>5. Limitation of Liability:</strong> Tourganiser is provided "as is." We are not liable for damages
					from outages, errors, or data loss.
				</p>
				<p>
					<strong>6. Changes:</strong> We may update these terms at any time. Continued use implies acceptance of
					changes.
				</p>
			</section>

			{/* Privacy Policy */}
			<section id="privacy" className="legal-page-section">
				<h1 className="legal-page-section-heading">Privacy Policy</h1>
				<p>
					<strong>Effective Date:</strong> 1 August 2025
				</p>
				<p>
					Tourganiser respects your privacy. We only collect and store data necessary to deliver core website features
					such as login, preferences, and saved content. We do not share, sell, or use your data for marketing or
					analytics.
				</p>
				<div>
					<h3>1. What we collect</h3>
					<p>
						We use cookies for: <br /> - Authentication (e.g., keeping you logged in)
						<br /> - User preferences (e.g., light/dark mode)
						<br />
					</p>
					<p>
						We also store: <br /> - Account details you provide (username, email) <br /> - Tournament data or other
						content you submit
						<br /> - Anonymized server logs for basic security and debugging
					</p>
				</div>
				<div>
					<h3>2. How we use your data</h3>
					<p>
						We use your information solely to:
						<br /> - Provide core features of the site <br /> - Ensure a personalized experience
						<br /> - Protect the platform from abuse
					</p>
					<p> We do not use third-party advertising or tracking cookies.</p>
				</div>
				<div>
					<h3>3. Your rights</h3>
					<p>
						You may:
						<br /> - Request a copy of your data <br /> - Ask for your account to be deleted
					</p>
					<p>
						For data inquiries or privacy concerns, contact us at:{' '}
						<a href="mailto:privacy@tourganiser.co.za" className="legal-page-email-link">
							privacy@tourganiser.co.za
						</a>
					</p>
				</div>
			</section>

			{/* Copyright */}
			<section id="copyright" className="legal-page-section">
				<h1 className="legal-page-section-heading">Copyright & Reuse Policy</h1>
				<p>
					All original content published on Tourganiser — including text, layout, graphics, branding, source code, and
					design — is protected under international copyright laws.
				</p>
				<p>
					<strong>Permitted Use:</strong> You may reuse or share content from this site for non-commercial purposes as
					long as you credit Tourganiser and provide a link to the source.
				</p>
				<p>
					<strong>Commercial Use:</strong> Commercial use (e.g., republishing for profit or copying our service
					structure) requires explicit written permission. Contact{' '}
					<a href="mailto:info@tourganiser.co.za" className="legal-page-email-link">
						info@tourganiser.co.za
					</a>
					.
				</p>
				<p>
					<strong>Infringement:</strong> If you believe any content here violates your intellectual property rights,
					please contact us at:{' '}
					<a href="mailto:info@tourganiser.co.za" className="legal-page-email-link">
						info@tourganiser.co.za
					</a>
					.
				</p>
			</section>
		</main>
	);
};

export default LegalPage;
