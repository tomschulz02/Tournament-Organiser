import { useParams } from "react-router-dom";
import React, { useState, useEffect } from "react";

export default function TournamentView() {
	const { id } = useParams();
	const [tournamentData, setTournamentData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(null);

	if (notFound) {
		return (
			<div style={{ textAlign: "center", marginTop: "2rem" }}>
				<h2>⛔ Tournament Not Found</h2>
				<p>
					The tournament ID <code>{id}</code> doesn’t exist or was removed.
				</p>
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
