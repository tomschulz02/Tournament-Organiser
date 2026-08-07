import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { fetchTournamentData } from '../requests';
import '../App.css';
import LoadingScreen from '../components/LoadingScreen';
import TournamentView from '../components/TournamentView';

export default function ViewPage() {
	const { id } = useParams();
	const [tournamentData, setTournamentData] = useState(null);
	const [notFound, setNotFound] = useState(false);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const fetchDetails = async () => {
			setLoading(true);
			setNotFound(false);

			try {
				const response = await fetchTournamentData(id);

				if (!response?.success) {
					setTournamentData(null);
					setNotFound(true);
					return;
				}

				setTournamentData(response);
			} catch (error) {
				console.error(error);
				setTournamentData(null);
				setNotFound(true);
			} finally {
				setLoading(false);
			}
		};

		fetchDetails();
	}, [id]);

	if (loading) return <LoadingScreen />;

	if (notFound) {
		return (
			<div className="tournament-not-found">
				<h2>Tournament Not Found</h2>
				<p>The tournament you are looking for doesn&apos;t exist or was removed.</p>
			</div>
		);
	}

	if (!tournamentData) {
		return <div></div>;
	}

	return <TournamentView tournament={tournamentData} />;
}
