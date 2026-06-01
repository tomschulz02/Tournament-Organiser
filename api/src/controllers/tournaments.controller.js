async function createTournament(req, res){
    try {
        const {tournamentData} = req.body;
        const userId = req.user.id;
    } catch (error) {
        res.status(500).json({ error: error.message || "CREATE_TOURNAMENT_ERROR" });
    }
}