import { useParams } from "react-router-dom";
import React, { useState, useEffect } from "react";
import { fetchTournamentData } from "../requests";
import "../styles/Tournaments.css";
import { useMessage } from "../MessageContext";

export default function TournamentView() {
	const { id } = useParams();
	const [tournamentData, setTournamentData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);
	const { showMessage } = useMessage();

	useEffect(() => {
		const getTournamentDetails = async () => {
			try {
				const response = await fetchTournamentData(id);
				console.log(response);
				if (response.error) {
					setNotFound(true);
					showMessage("Tournament not found", "error");
				} else {
					setTournamentData(response.message);
					setNotFound(false);
				}
			} catch (error) {
				setNotFound(true);
				showMessage("Error fetching tournament data", "error");
			}
		};
		getTournamentDetails();
		setLoading(false);
	}, [id]);

	if (notFound) {
		return (
			<div style={{ textAlign: "center", marginTop: "2rem" }}>
				<h2>⛔ Tournament Not Found</h2>
				<p>The tournament you are looking for doesn’t exist or was removed.</p>
			</div>
		);
	}

	return (
		<div className="tournament-view">
			<h1>Tournament View</h1>
			<p>Tournament ID: {id}</p>
			{/* Add more tournament details here */}
		</div>
	);
}
