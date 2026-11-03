import { formatMoves, formatTime } from '../../utils/format.ts';
import './Sidebar.css';

interface SidebarProps {
  levelName: string;
  levelNumber: number;
  totalLevels: number;
  moveCount: number;
  bestMoves?: number;
  elapsedMs: number;
  boxesOnTarget: number;
  targetsCount: number;
  canUndo: boolean;
  hasWon: boolean;
  hasNextLevel: boolean;
  onUndo: () => void;
  onRestart: () => void;
  onNextLevel: () => void;
  onShowRankings: () => void;
  onShowSolution: () => void;
}

export function Sidebar({
  levelName,
  levelNumber,
  totalLevels,
  moveCount,
  bestMoves,
  elapsedMs,
  boxesOnTarget,
  targetsCount,
  canUndo,
  hasWon,
  hasNextLevel,
  onUndo,
  onRestart,
  onNextLevel,
  onShowRankings,
  onShowSolution,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div>
        <p className="sidebar__level-label">
          Nível {String(levelNumber).padStart(2, '0')} / {String(totalLevels).padStart(2, '0')}
        </p>
        <h2 className="sidebar__level-name">{levelName}</h2>
      </div>

      <div className="sidebar__stats">
        <div className="stat">
          <span className="stat__label">Movimentos</span>
          <span className="stat__value">{formatMoves(moveCount)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Recorde</span>
          <span className="stat__value">{bestMoves !== undefined ? formatMoves(bestMoves) : '—'}</span>
        </div>
      </div>

      <div className="stat stat--wide">
        <span className="stat__label">Tempo</span>
        <span className="stat__value">{formatTime(elapsedMs)}</span>
      </div>

      <div className="stat stat--wide">
        <span className="stat__label">Caixas no destino</span>
        <span className="stat__value">
          {boxesOnTarget} / {targetsCount}
        </span>
      </div>

      <div className="sidebar__buttons">
        <button type="button" className="btn" onClick={onUndo} disabled={!canUndo || hasWon}>
          Desfazer <kbd>Z</kbd>
        </button>
        <button type="button" className="btn" onClick={onRestart}>
          Reiniciar <kbd>R</kbd>
        </button>
      </div>

      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={onNextLevel}
        disabled={!hasWon || !hasNextLevel}
      >
        {hasNextLevel ? 'Próximo Nível' : 'Último Nível'}
      </button>

      <button type="button" className="btn btn--block" onClick={onShowRankings}>
        Ver Ranking
      </button>

      <button type="button" className="btn btn--primary btn--block" onClick={onShowSolution}>
        Ver solução ótima
      </button>

      <div className="sidebar__controls">
        <p className="sidebar__controls-title">Controles</p>
        <ControlRow keys={['W', 'A', 'S', 'D']} label="Mover" />
        <ControlRow keys={['↑', '←', '↓', '→']} label="Mover" />
        <ControlRow keys={['Z']} label="Desfazer" />
        <ControlRow keys={['R']} label="Reiniciar" />
        <ControlRow keys={['ESC']} label="Voltar aos níveis" />
      </div>
    </aside>
  );
}

function ControlRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="control-row">
      <div className="control-row__keys">
        {keys.map((k) => (
          <kbd key={k}>{k}</kbd>
        ))}
      </div>
      <span className="control-row__label">{label}</span>
    </div>
  );
}
