import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSokoban } from '../../hooks/useSokoban.ts';
import type { Direction, LevelDefinition, LevelProgress, LevelRecord } from '../../game/types.ts';
import { parseLevel } from '../../game/engine.ts';
import { solve } from '../../game/solver.ts';
import { useArduino } from '../../context/useArduino';
import { Board } from '../Board/Board.tsx';
import { Sidebar } from '../Sidebar/Sidebar.tsx';
import { WinModal } from '../Modal/WinModal.tsx';
import { RankingsModal } from '../Modal/RankingsModal.tsx';
import { AnalysisModal } from '../Modal/AnalysisModal.tsx';
import { SolutionModal } from '../Modal/SolutionModal.tsx';
import { Header } from '../Header/Header.tsx';
import './GameScreen.css';

/** Intervalo entre os movimentos executados automaticamente pela solução (450ms para sincronia perfeita com a matriz LED). */
const AUTO_PLAY_STEP_MS = 750;

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

interface GameScreenProps {
  level: LevelDefinition;
  levelNumber: number;
  totalLevels: number;
  completedCount: number;
  hasNextLevel: boolean;
  getProgress: (levelId: string) => LevelProgress;
  recordCompletion: (levelId: string, moves: number, timeMs: number) => void;
  getRankings: (levelId: string) => { byTime: LevelRecord[]; byMoves: LevelRecord[] };
  onBackToLevels: () => void;
  onNextLevel: () => void;
}

export function GameScreen({
  level,
  levelNumber,
  totalLevels,
  completedCount,
  hasNextLevel,
  getProgress,
  recordCompletion,
  getRankings,
  onBackToLevels,
  onNextLevel,
}: GameScreenProps) {
  const [activeModal, setActiveModal] = useState<'ranking' | 'analysis' | 'solution' | null>(null);
  const previousBestRef = useRef<number | undefined>(getProgress(level.id).bestMoves);
  const [autoPlayQueue, setAutoPlayQueue] = useState<Direction[] | null>(null);
  const isAutoPlaying = autoPlayQueue !== null && autoPlayQueue.length > 0;
  const [winInfo, setWinInfo] = useState<{ moves: number; timeMs: number; isNewRecord: boolean } | null>(
    null,
  );

  const { notifyMove, notifyUndo, resetLevelOnUno, subscribeToGameEvents } = useArduino();
  const isExternalMoveRef = useRef(false);

  useEffect(() => {
    previousBestRef.current = getProgress(level.id).bestMoves;
    setWinInfo(null);
    setActiveModal(null);
    setAutoPlayQueue(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id]);

  const handleWin = useCallback(
    (moves: number, timeMs: number) => {
      const previousBest = previousBestRef.current;
      const isNewRecord = previousBest === undefined || moves < previousBest;
      recordCompletion(level.id, moves, timeMs);
      setWinInfo({ moves, timeMs, isNewRecord });
    },
    [level.id, recordCompletion],
  );

  const { state, status, moveCount, elapsedMs, canUndo, facing, targetsCount, boxesOnTargetCount, handleMove, undo, restart } =
    useSokoban(level, handleWin);

  const handleMoveRef = useRef(handleMove);
  useEffect(() => {
    handleMoveRef.current = handleMove;
  }, [handleMove]);

  // Movimento com suporte a Anti-Eco
  const handleMoveWithUno = useCallback(
    (direction: Direction, fromExternal = false) => {
      if (fromExternal) {
        isExternalMoveRef.current = true;
        handleMove(direction);
        isExternalMoveRef.current = false;
      } else {
        notifyMove(direction);
        handleMove(direction);
      }
    },
    [handleMove, notifyMove],
  );

  // Reinício que garante que o Arduino carregue estritamente a fase em exibição
  const handleRestart = useCallback(() => {
    setAutoPlayQueue(null);
    restart();
  }, [restart]);

  const handleUserRestart = useCallback(() => {
    handleRestart();
    resetLevelOnUno(level);
  }, [handleRestart, resetLevelOnUno, level]);

  // Desfazer com notificação serial
  const handleUndo = useCallback(() => {
    setAutoPlayQueue(null);
    undo();
  }, [undo]);

  const handleUserUndo = useCallback(() => {
    handleUndo();
    notifyUndo();
  }, [handleUndo, notifyUndo]);

  // Assinatura de eventos gerados pelo hardware (botões físicos)
  useEffect(() => {
    const unsubscribe = subscribeToGameEvents((event) => {
      if (event.type === 'move') {
        handleMoveWithUno(event.direction, true);
      } else if (event.type === 'undo') {
        handleUndo();
      } else if (event.type === 'reset') {
        handleRestart();
      } else if (event.type === 'win') {
        // Vitória sinalizada pelo Uno
      }
    });

    return unsubscribe;
  }, [subscribeToGameEvents, handleMoveWithUno, handleUndo, handleRestart]);

  // Auto-play do Resolvedor (A*):
  // Cada passo da fila executa localmente e emite simultaneamente MV:<dir> ao Uno
  useEffect(() => {
    if (autoPlayQueue === null) return;
    if (autoPlayQueue.length === 0 || status !== 'playing') {
      setAutoPlayQueue(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const [nextDirection, ...rest] = autoPlayQueue;
      setAutoPlayQueue(rest.length > 0 ? rest : null);
      notifyMove(nextDirection);
      handleMoveRef.current(nextDirection);
    }, AUTO_PLAY_STEP_MS);

    return () => window.clearTimeout(timeoutId);
  }, [autoPlayQueue, status, notifyMove]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (status === 'won' || activeModal !== null) return;

      // Durante o auto-play só Escape é aceito, e ele apenas cancela a execução.
      if (isAutoPlaying) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setAutoPlayQueue(null);
        }
        return;
      }

      if (event.key in KEY_MAP) {
        event.preventDefault();
        handleMoveWithUno(KEY_MAP[event.key]);
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'z':
          event.preventDefault();
          handleUserUndo();
          break;
        case 'r':
          event.preventDefault();
          handleUserRestart();
          break;
        case 'escape':
          event.preventDefault();
          onBackToLevels();
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal, handleMoveWithUno, handleUserRestart, handleUserUndo, isAutoPlaying, status, onBackToLevels]);

  const progress = getProgress(level.id);
  const rankings = getRankings(level.id);
  // O A* é executado uma vez por nível; a sequência resultante é reutilizada ao
  // abrir o modal para não recalcular nem depender da posição atual do jogador.
  const solution = useMemo(() => solve(parseLevel(level)), [level]);

  return (
    <div className="screen">
      <Header completedCount={completedCount} totalLevels={totalLevels} onOpenLevels={onBackToLevels} />
      <main className="game-screen">
        <Board state={state} facing={facing} />
        <Sidebar
          levelName={level.name}
          levelNumber={levelNumber}
          totalLevels={totalLevels}
          moveCount={moveCount}
          bestMoves={progress.bestMoves}
          elapsedMs={elapsedMs}
          boxesOnTarget={boxesOnTargetCount}
          targetsCount={targetsCount}
          canUndo={canUndo}
          hasWon={status === 'won'}
          hasNextLevel={hasNextLevel}
          onUndo={handleUserUndo}
          onRestart={handleUserRestart}
          onNextLevel={onNextLevel}
          onShowRankings={() => setActiveModal('ranking')}
          onShowSolution={() => {
            if (!isAutoPlaying) setActiveModal('solution');
          }}
        />
      </main>

      {status === 'won' && winInfo && activeModal === null && (
        <WinModal
          levelName={level.name}
          moves={winInfo.moves}
          bestMoves={getProgress(level.id).bestMoves}
          timeMs={winInfo.timeMs}
          isNewRecord={winInfo.isNewRecord}
          hasNextLevel={hasNextLevel}
          onRepeat={handleUserRestart}
          onBackToLevels={onBackToLevels}
          onShowRankings={() => setActiveModal('ranking')}
          onNextLevel={onNextLevel}
        />
      )}

      {activeModal === 'ranking' && (
        <RankingsModal
          levelName={level.name}
          byTime={rankings.byTime}
          byMoves={rankings.byMoves}
          onShowAnalysis={() => setActiveModal('analysis')}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'analysis' && (
        <AnalysisModal
          levelName={level.name}
          history={progress.history}
          onBackToRanking={() => setActiveModal('ranking')}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'solution' && (
        <SolutionModal
          level={level}
          levelName={level.name}
          initialSolution={solution}
          currentState={state}
          onClose={() => setActiveModal(null)}
          onApplySolution={(directions, options) => {
            setActiveModal(null);
            if (options?.restartFirst) {
              handleUserRestart();
              // Pausa de 500ms para o Arduino completar o reset e desenhar o mapa inicial na matriz
              window.setTimeout(() => {
                setAutoPlayQueue(directions);
              }, 500);
            } else {
              setAutoPlayQueue(directions);
            }
          }}
        />
      )}
    </div>
  );
}
