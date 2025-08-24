import { Link } from 'react-router-dom';

export default function CollectionView({ collection }) {
	return (
		<>
			<Link to="/tournaments" className="back-to-browse">
				&lt; Back to browse
			</Link>
			<div className="collection-info">
				<h2>{collection.collection}</h2>
			</div>
			<div className="collection-tournaments">
				{collection.message.map((tournament, index) => {
					return (
						<div key={tournament.message.details.id} className="collection-tournament-card">
							<div className="tournament-name">{tournament.message.details.name}</div>
							<div className="tournament-description">{tournament.message.details.description}</div>
							<div className={`tournament-status ${tournament.message.details.status.toLowerCase().replace(' ', '-')}`}>
								{tournament.message.details.status}
							</div>
							<Link to={`/tournaments/view/t_${tournament.message.details.id}`} className="view-tournament-btn">
								View
							</Link>
						</div>
					);
				})}
			</div>
		</>
	);
}
