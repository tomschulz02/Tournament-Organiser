import '../App.css';

export default function SummaryPage({ fields}) {
	const knockoutRoundMap = {
		24: 'Round of 24',
		16: 'Round of 16',
		12: 'Round of 12',
		8: 'Quarterfinal',
		4: 'Semifinal',
		2: 'Final',
	};

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
					<sub>* required</sub>
					<div className="tournament-summary-section-fields">
						<div className="tournament-summary-section-fields-row">
							<h4>Name*</h4>
							<p>{fields.details.name || '-'}</p>
						</div>
						<div className="tournament-summary-section-fields-row">
							<h4>Date*</h4>
							<p>{fields.details.date || '-'}</p>
						</div>
						<div className="tournament-summary-section-fields-row">
							<h4>Location*</h4>
							<p>{fields.details.location || '-'}</p>
						</div>
						<div className="tournament-summary-section-fields-row">
							<h4>Description</h4>
							<p>{fields.details.description || '-'}</p>
						</div>
					</div>
				</div>
			)}
			{fields['structure'] && (
				<div className="new-tournament-summary-section">
					<h3>Tournament Structure</h3>
					<sub>*required</sub>
					<div className="tournament-summary-section-fields">
						<div className="tournament-summary-section-fields-row">
							<h4>Number of Teams*</h4>
							<p>{parseInt(fields.structure.numTeams) || '-'}</p>
						</div>
						{fields.template === 'Classic' && (
							<>
								<div className="tournament-summary-section-fields-row">
									<h4>Number of Groups*</h4>
									<p>{parseInt(fields.structure.numGroups) || '-'}</p>
								</div>
								<div className="tournament-summary-section-fields-row">
									<h4>First Knockout Phase*</h4>
									<p>{knockoutRoundMap[parseInt(fields.structure.knockoutRound)] || '-'}</p>
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
