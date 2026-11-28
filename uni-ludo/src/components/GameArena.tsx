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

  return (
  <section aria-label="صفحهٔ بازی" className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 pb-2 flex flex-col lg:grid lg:grid-cols-12 lg:items-center gap-2 lg:gap-6 min-h-0">
    {/* Desktop Side Column (Players & Dice Dock) */}
    <aside className="hidden lg:flex lg:col-span-4 flex-col gap-3 justify-between h-full max-h-[670px] py-2">
      <div className="space-y-2.5">
        {match.players.map((pl) => (
          <PlayerHudCard
            key={pl.id}
            player={pl}
            graduatedCount={getGraduatedCount(match.pawns, pl.id)}
            isActive={pl.id === activePlayer.id && match.phase !== 'finished'}
          />
        ))}
      </div>

      {/* Desktop Dice & Status Dock */}
      <div className="rounded-3xl bg-[#22182E]/95 border-2 border-[#4C355F] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
        <DiceWidget
          value={dice}
          rolling={rolling}
          canRoll={canRoll}
          activeFacultyId={activePlayer.teamId}
          activePlayerName={activePlayer.name}
          isBotTurn={activePlayer.isBot}
          promptText={prompt}
          onRoll={onRoll}
        />
      </div>
    </aside>

    {/* Mobile Top Players Row — LTR grid so Seat 1 (Top-Left) & Seat 2 (Top-Right) match board corners */}
    <div
      dir="ltr"
      className={`lg:hidden grid gap-2 shrink-0 ${
        topPlayers.length === 1 ? 'grid-cols-1 max-w-[240px] ml-auto w-full' : 'grid-cols-2'
      }`}
    >
      {topPlayers.map((pl) => (
        <PlayerHudCard
          key={pl.id}
          player={pl}
          graduatedCount={getGraduatedCount(match.pawns, pl.id)}
          isActive={pl.id === activePlayer.id && match.phase !== 'finished'}
          compact
        />
      ))}
    </div>

    {/* Center Focal Anchor: Mench Board */}
    <div className="lg:col-span-8 flex-1 flex items-center justify-center min-h-0 w-full">
      <div className="w-full max-w-[min(94vw,52dvh)] sm:max-w-[min(86vw,58dvh)] lg:max-w-[min(80dvh,650px)]">
        <MenchBoard
          players={match.players}
          pawns={match.pawns}
          activePlayerId={activePlayer.id}
          legalMoves={legalMoves}
          ruleMode={match.config.ruleMode}
          animatingPawnCoord={animatingPawnCoord}
          captureFlashCoord={captureFlashCoord}
          onSelectMove={onMove}
          interactive={interactive}
        />
      </div>
    </div>

    {/* Mobile Bottom Players Row — LTR grid so Seat 0 (Bottom-Left) & Seat 3 (Bottom-Right) match board corners */}
    <div
      dir="ltr"
      className={`lg:hidden grid gap-2 shrink-0 ${
        bottomPlayers.length === 1 ? 'grid-cols-1 max-w-[240px] mr-auto w-full' : 'grid-cols-2'
      }`}
    >
      {bottomPlayers.map((pl) => (
        <PlayerHudCard
          key={pl.id}
          player={pl}
          graduatedCount={getGraduatedCount(match.pawns, pl.id)}
          isActive={pl.id === activePlayer.id && match.phase !== 'finished'}
          compact
        />
      ))}
    </div>

    {/* Mobile Ergonomic Thumb-Zone Dice Dock */}
    <div
      className="lg:hidden shrink-0 rounded-2xl bg-[#22182E]/95 border border-[#533C6A] px-3.5 py-2.5 shadow-[0_-6px_24px_rgba(0,0,0,0.35)]"
      style={{ marginBottom: 'var(--safe-bottom)' }}
    >
      <DiceWidget
        value={dice}
        rolling={rolling}
        canRoll={canRoll}
        activeFacultyId={activePlayer.teamId}
        activePlayerName={activePlayer.name}
        isBotTurn={activePlayer.isBot}
        promptText={prompt}
        onRoll={onRoll}
      />
    </div>
  </section>
  );
}
