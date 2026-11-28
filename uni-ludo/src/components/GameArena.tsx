import type {GridCoord} from '../../../portal/uniludo/constants';
import {getActivePlayer, getGraduatedCount, type LegalMove, type MatchState} from '../../../portal/uniludo/rules';
import {DiceWidget} from './DiceWidget';
import {MenchBoard} from './MenchBoard';
import {PlayerHudCard} from './PlayerHudCard';

export function GameArena({match, dice, rolling, canRoll, interactive, legalMoves, animatingPawnCoord = null,
  captureFlashCoord = null, prompt, onRoll, onMove}: {
  match: MatchState; dice: number; rolling: boolean; canRoll: boolean; interactive: boolean; legalMoves: LegalMove[];
  animatingPawnCoord?: {pawnId: string; coord: GridCoord} | null; captureFlashCoord?: GridCoord | null; prompt: string;
  onRoll: () => void; onMove: (move: LegalMove) => void;
}) {
  const activePlayer = getActivePlayer(match);
  // Spatial alignment: Top row [Left=Seat 1, Right=Seat 2], Bottom row [Left=Seat 0, Right=Seat 3]
  const topPlayers = [1, 2]
    .map((seat) => match.players.find((p) => p.id === seat))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const bottomPlayers = [0, 3]
    .map((seat) => match.players.find((p) => p.id === seat))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  function players(seats: typeof topPlayers) {
    return <div dir="ltr" className="game-arena-players">
      {seats.map(player => <div key={player.id} style={{gridColumn: player.id === 1 || player.id === 0 ? 1 : 2}}>
        <PlayerHudCard player={player}
        graduatedCount={getGraduatedCount(match.pawns, player.id)}
        isActive={player.id === activePlayer.id && match.phase !== 'finished'} compact />
      </div>)}
    </div>;
  }

  return <section aria-label="صفحهٔ بازی" className="game-arena">
    {players(topPlayers)}
    <div className="game-arena-board">
      <MenchBoard players={match.players} pawns={match.pawns} activePlayerId={activePlayer.id}
        legalMoves={legalMoves} ruleMode={match.config.ruleMode} animatingPawnCoord={animatingPawnCoord}
        captureFlashCoord={captureFlashCoord} onSelectMove={onMove} interactive={interactive} />
    </div>
    {players(bottomPlayers)}
    <div className="game-arena-dice">
      <DiceWidget value={dice} rolling={rolling} canRoll={canRoll} activeFacultyId={activePlayer.teamId}
        activePlayerName={activePlayer.name} isBotTurn={activePlayer.isBot} promptText={prompt} onRoll={onRoll} />
    </div>
  </section>;
}
