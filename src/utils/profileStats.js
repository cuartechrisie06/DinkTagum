export function calculateProfileStats(gameRecords) {
  const wins = gameRecords.filter((game) => game.result === "win").length;
  const losses = gameRecords.length - wins;
  const pointsFor = gameRecords.reduce((total, game) => total + Number(game.player_score || 0), 0);
  const pointsAgainst = gameRecords.reduce((total, game) => total + Number(game.opponent_score || 0), 0);
  return {
    matchesPlayed: gameRecords.length,
    wins,
    losses,
    pointsFor,
    pointsAgainst,
    winRate: gameRecords.length ? Math.round((wins / gameRecords.length) * 100) : null,
    winLossRatio: losses ? (wins / losses).toFixed(2) : wins ? "Perfect" : "—",
  };
}

export function matchHistoryFromRecords(gameRecords, limit = 8) {
  return gameRecords.slice(0, limit).map((game) => ({
    id: game.id,
    opponent: game.opponents,
    playerScore: game.player_score,
    opponentScore: game.opponent_score,
    result: game.result,
    playedOn: game.played_on,
  }));
}
