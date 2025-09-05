import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { fetchTournamentData } from '../requests';
import '../App.css';
import LoadingScreen from '../components/LoadingScreen';
import TournamentView from '../components/TournamentView';
import CollectionView from '../components/CollectionView';

export default function ViewPage() {
	const { id } = useParams();
	const [tournamentData, setTournamentData] = useState({});
	const [type, setType] = useState(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const fetchDetails = async () => {
			setLoading(true);
			try {
				let response;
				if ([...id][0] === 'c') {
					// fetch collection data
					response = await fetchTournamentData(id);
				} else {
					// fetch tournament data
					response = await fetchTournamentData(id);
				}

				if (!response.success) {
					setType(null);
					return;
				}

				setTournamentData(await response);
				setType([...id][0]);
			} catch (error) {
				console.error(error);
				setType(null);
			} finally {
				setLoading(false);
			}
		};

		fetchDetails();
	}, [id]);

	if (loading) return <LoadingScreen />;

	if (!type) {
		return (
			<div className="tournament-not-found">
				<h2>⛔ Tournament Not Found</h2>
				<p>The tournament you are looking for doesn't exist or was removed.</p>
			</div>
		);
	}

	return (
		<>
			{type === 'c' && <CollectionView collection={tournamentData} />}
			{type === 't' && <TournamentView tournament={tournamentData} />}
		</>
	);
}
