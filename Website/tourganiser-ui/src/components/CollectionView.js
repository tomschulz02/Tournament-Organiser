import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icons';
import { TournamentCard } from '../pages/Browse';
import { useEffect, useState } from 'react';

export default function CollectionView({ collection, status }) {
	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		if (status) {
			document.getElementById('collectionPreview').classList.remove('closed');
			let gridWidth;
			if (window.innerWidth <= 768) {
				gridWidth = null;
			} else if (window.innerWidth > 1200) {
				gridWidth = 0.5 * window.innerWidth + 180;
			} else {
				gridWidth = window.innerWidth - 420;
			}
			for (let card of document.getElementById('tournamentsGrid').children) {
				card.style.width = gridWidth ? gridWidth + 'px' : '100%';
			}
			document.getElementById('tournamentsSearch').style.width = gridWidth ? gridWidth + 'px' : '100%';
		}
	}, []);

	const handleClose = (e) => {
		document.getElementById('collectionPreview').classList.add('closed');
		for (let card of document.getElementById('tournamentsGrid').children) {
			card.style.width = '100%';
		}
		document.getElementById('tournamentsSearch').style.width = '100%';
		setTimeout(() => {
			navigate('/tournaments');
		}, 500);
	};

	return (
		<>
			<div id="collectionPreview" className="collection-view-modal-content closed">
				<Icon name={'exit'} onClick={handleClose} className="collection-view-modal-close" />
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
		</>
	);
}
