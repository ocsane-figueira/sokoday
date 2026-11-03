import { LEVELS } from '../../game/levels.ts';
import type { LevelProgress } from '../../game/types.ts';
import { Header } from '../Header/Header.tsx';
import './LevelSelect.css';

interface LevelSelectProps {
  getProgress: (levelId: string) => LevelProgress;
  completedCount: number;
  onSelectLevel: (index: number) => void;
}

export function LevelSelect({ getProgress, completedCount, onSelectLevel }: LevelSelectProps) {
  return (
    <div className="screen">
      <Header completedCount={completedCount} totalLevels={LEVELS.length} showLevelsButton={false} />
      <main className="level-select">
        <h1 className="level-select__title">Selecionar Nível</h1>

        <div className="level-grid">
          {LEVELS.map((level, index) => {
            const progress = getProgress(level.id);
            return (
              <button
                key={level.id}
                type="button"
                className={`level-card${progress.completed ? ' level-card--done' : ''}`}
                onClick={() => onSelectLevel(index)}
              >
                <div className="level-card__top">
                  <span className="level-card__number">{String(index + 1).padStart(2, '0')}</span>
                  {progress.completed && <span className="level-card__badge">OK</span>}
                </div>
                <span className="level-card__name">{level.name}</span>
                <span className="level-card__record">
                  {progress.bestMoves !== undefined ? `Recorde: ${progress.bestMoves}` : 'Sem recorde'}
                </span>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
