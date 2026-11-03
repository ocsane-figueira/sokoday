import { useEffect } from 'react';
import { formatMoves, formatTime } from '../../utils/format.ts';
import './Modal.css';

interface WinModalProps {
  levelName: string;
  moves: number;
  bestMoves?: number;
  timeMs: number;
  isNewRecord: boolean;
  hasNextLevel: boolean;
  onRepeat: () => void;
  onBackToLevels: () => void;
  onShowRankings: () => void;
  onNextLevel: () => void;
}

export function WinModal({
  levelName,
  moves,
  bestMoves,
  timeMs,
  isNewRecord,
  hasNextLevel,
  onRepeat,
  onBackToLevels,
  onShowRankings,
  onNextLevel,
}: WinModalProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      const key = event.key.toLowerCase();
      if (key === 'v') {
        event.preventDefault();
        onShowRankings();
      } else if (key === 'n') {
        event.preventDefault();
        onBackToLevels();
      } else if (key === 'r') {
        event.preventDefault();
        onRepeat();
      } else if (key === 'escape') {
        event.preventDefault();
        onBackToLevels();
      } else if (key === 'enter' || key === 'return') {
        event.preventDefault();
        if (hasNextLevel) onNextLevel();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasNextLevel, onBackToLevels, onNextLevel, onRepeat, onShowRankings]);

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="win-modal-title">
        <p className="modal__eyebrow">Nível concluído</p>
        <h2 id="win-modal-title" className="modal__title">
          {levelName}
        </h2>

        <div className="modal__stats">
          <div className="stat">
            <span className="stat__label">Movimentos</span>
            <span className="stat__value">{formatMoves(moves)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Recorde</span>
            <span className="stat__value">{formatMoves(bestMoves ?? moves)}</span>
          </div>
        </div>

        <div className="stat stat--wide">
          <span className="stat__label">Tempo total</span>
          <span className="stat__value">{formatTime(timeMs)}</span>
        </div>

        {isNewRecord && <p className="modal__record-note">Novo recorde para este nível!</p>}

        <div className="modal__actions">
          <button type="button" className="btn" onClick={onRepeat}>
            Repetir
          </button>
          <button type="button" className="btn" onClick={onBackToLevels}>
            Níveis
          </button>
          <button type="button" className="btn" onClick={onShowRankings}>
            Ver Ranking
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onNextLevel}
            disabled={!hasNextLevel}
          >
            Próximo Nível
          </button>
        </div>
      </div>
    </div>
  );
}
