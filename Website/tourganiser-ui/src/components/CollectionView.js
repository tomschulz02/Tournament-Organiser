import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icons';
import { TournamentCard } from '../pages/Browse';

export default function CollectionView({ collection }) {
	const location = useLocation();
	const navigate = useNavigate();

	const exitElements = ['collection-view-modal', 'collection-view-modal-close'];

	const handleClose = (e) => {
		if (exitElements.includes(e.target.classList.value)) {
			navigate('/tournaments');
		}
	};

	return (
		<>
			<div className="collection-view-modal" onClick={handleClose}>
				<div className="collection-view-modal-content">
					<Icon name={'exit'} onClick={() => navigate('/tournaments')} className="collection-view-modal-close" />
					<div className="collection-view-modal-header">
						<h2>{collection.collection}</h2>
					</div>
					<div className="collection-tournaments">
						{collection.message.map((tournament, index) => {
							return (
								<TournamentCard
									key={index}
									details={tournament.message.details}
									action={() => navigate(`/tournaments/view/t_${tournament.message.details.id}`)}
								/>
							);
						})}
					</div>
				</div>
			</div>
		</>
	);
}
