import { useEffect } from 'react';
import type { LevelRecord } from '../../game/types.ts';
import { formatDate, formatMoves, formatTime } from '../../utils/format.ts';
import './Modal.css';

interface RankingsModalProps {
  levelName: string;
  byTime: LevelRecord[];
  byMoves: LevelRecord[];
  onShowAnalysis: () => void;
  onClose: () => void;
}

export function RankingsModal({ levelName, byTime, byMoves, onShowAnalysis, onClose }: RankingsModalProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;

      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        onShowAnalysis();
      } else if (key === 'escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onShowAnalysis]);

  return (
    <div className="modal-overlay">
      <div className="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="ranking-modal-title">
        <p className="modal__eyebrow">Ranking</p>
        <h2 id="ranking-modal-title" className="modal__title">
          {levelName}
        </h2>

        <div className="rankings">
          <RankingTable title="Menor tempo" records={byTime} highlight="time" />
          <RankingTable title="Menos movimentos" records={byMoves} highlight="moves" />
        </div>

        <div className="modal__actions">
          <button type="button" className="btn" onClick={onShowAnalysis}>
            Analisar evolução
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function RankingTable({
  title,
  records,
  highlight,
}: {
  title: string;
  records: LevelRecord[];
  highlight: 'time' | 'moves';
}) {
  return (
    <div className="ranking-table">
      <h3 className="ranking-table__title">{title}</h3>
      {records.length === 0 ? (
        <p className="ranking-table__empty">Nenhuma partida concluída ainda.</p>
      ) : (
        <ol className="ranking-table__list">
          {records.slice(0, 5).map((record, index) => (
            <li key={`${record.date}-${index}`} className="ranking-table__row">
              <span className="ranking-table__position">{index + 1}º</span>
              <span className={highlight === 'time' ? 'ranking-table__value--highlight' : ''}>
                {formatTime(record.timeMs)}
              </span>
              <span className={highlight === 'moves' ? 'ranking-table__value--highlight' : ''}>
                {formatMoves(record.moves)} mov.
              </span>
              <span className="ranking-table__date">{formatDate(record.date)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
