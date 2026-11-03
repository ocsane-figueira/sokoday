import { useState } from 'react';
import { LEVELS } from '../../game/levels.ts';
import type { LevelDefinition, LevelProgress } from '../../game/types.ts';
import { useArduino } from '../../context/useArduino';
import { Header } from '../Header/Header.tsx';
import './LevelSelect.css';

interface LevelSelectProps {
  getProgress: (levelId: string) => LevelProgress;
  onSelectLevel: (index: number, list: LevelDefinition[]) => void;
}

  export function LevelSelect({ getProgress, onSelectLevel }: LevelSelectProps) {
    const [activeTab, setActiveTab] = useState<'web' | 'arduino'>('web');
    const {
      status,
      activeSource,
      activeLevelId,
      arduinoLevels,
      isLoadingLevels,
      connectDevice,
      fetchArduinoNativeLevels,
      sendLevelToUno,
      setLevelOnUno,
    } = useArduino();

    const currentList = activeTab === 'web' ? LEVELS : arduinoLevels;
    const completedInCurrent = currentList.filter((l) => getProgress(l.id).completed).length;

    const handleLevelClick = async (level: LevelDefinition, index: number) => {
      if (activeTab === 'web') {
        if (status === 'connected') {
          // Envia a fase formatada em 8x8 via SET_MAP para a matriz WS2812 do Uno
          await sendLevelToUno(level);
        }
        onSelectLevel(index, LEVELS);
      } else {
        if (status === 'connected') {
          // Troca o Uno para a fase nativa correspondente (1 a 4)
          await setLevelOnUno(index + 1);
        }
        onSelectLevel(index, arduinoLevels);
      }
    };

    const handleFetchLevels = async () => {
      try {
        await fetchArduinoNativeLevels();
      } catch (err) {
        console.error('Falha ao buscar fases do Arduino:', err);
      }
    };

    return (
      <div className="screen">
        <Header
          completedCount={completedInCurrent}
          totalLevels={currentList.length}
          showLevelsButton={false}
        />
        <main className="level-select">
          <div className="level-select__header">
            <div>
              <h1 className="level-select__title">Selecionar Nível</h1>
              <p className="level-select__hint">
                Escolha uma fase para jogar ou resolver com o algoritmo A*.
              </p>
            </div>

            {/* Abas: Fases Web vs Fases Arduino */}
            <div className="level-select__tabs">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'web' ? 'tab-btn--active' : ''}`}
                onClick={() => setActiveTab('web')}
              >
                Fases Web ({LEVELS.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'arduino' ? 'tab-btn--active' : ''}`}
                onClick={() => setActiveTab('arduino')}
              >
                Fases do Uno ({arduinoLevels.length})
                {status === 'connected' && <span className="tab-indicator" />}
              </button>
            </div>
          </div>

          {activeTab === 'arduino' && (
            <div className="arduino-panel">
              <div className="arduino-panel__info">
                <span className="arduino-panel__title">Fases Nativas na Flash do Arduino Uno</span>
                <span className="arduino-panel__desc">
                  Fases armazenadas no firmware do Uno. Você pode jogá-las no site e calcular a solução ótima com A*.
                </span>
              </div>
              <div className="arduino-panel__actions">
                {status === 'connected' ? (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={handleFetchLevels}
                    disabled={isLoadingLevels}
                  >
                    {isLoadingLevels ? 'Carregando (GET_MAP:1..4)...' : 'Carregar fases do Uno'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--outline-dark btn--sm"
                    onClick={() => connectDevice()}
                  >
                    Conectar Uno para ler Flash
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="level-grid">
              {
                currentList.map((level, index) => {
                  const progress = getProgress(level.id);
                  const isUnoNativeActive =
                    activeTab === 'arduino' &&
                    status === 'connected' &&
                    activeSource === 'NATIVE' &&
                    activeLevelId === String(index + 1);

                  return (
                    <button
                      key={level.id}
                      type="button"
                      className={`level-card${progress.completed ? ' level-card--done' : ''}${isUnoNativeActive ? ' level-card--active-uno' : ''
                        }`}
                      onClick={() => handleLevelClick(level, index)}
                    >
                      <div className="level-card__top">
                        <span className="level-card__number">{String(index + 1).padStart(2, '0')}</span>
                        <div className="level-card__badges">
                          {isUnoNativeActive && (
                            <span className="level-card__badge level-card__badge--uno">Ativo no Uno</span>
                          )}
                          {progress.completed && <span className="level-card__badge">OK</span>}
                        </div>
                      </div>
                      <span className="level-card__name">{level.name}</span>
                      <span className="level-card__record">
                        {progress.bestMoves !== undefined ? `Recorde: ${progress.bestMoves}` : 'Sem recorde'}
                      </span>
                    </button>
                  );
                })
              }
        </div>
        </main>
      </div>
    );
  }
