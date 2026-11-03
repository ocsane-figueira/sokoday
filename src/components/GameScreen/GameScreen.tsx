import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSokoban } from '../../hooks/useSokoban.ts';
import type { Direction, LevelDefinition, LevelProgress, LevelRecord } from '../../game/types.ts';
import { parseLevel } from '../../game/engine.ts';
import { solve } from '../../game/solver.ts';
import { Board } from '../Board/Board.tsx';
import { Sidebar } from '../Sidebar/Sidebar.tsx';
import { WinModal } from '../Modal/WinModal.tsx';
import { RankingsModal } from '../Modal/RankingsModal.tsx';
import { AnalysisModal } from '../Modal/AnalysisModal.tsx';
import { SolutionModal } from '../Modal/SolutionModal.tsx';
import { Header } from '../Header/Header.tsx';
import './GameScreen.css';

/** Intervalo entre os movimentos executados automaticamente pela solução. */
const AUTO_PLAY_STEP_MS = 250;

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

  // Auto-play: um único timeout por passo, recriado a cada mudança da fila. O
  // cleanup cancela o timer pendente ao esvaziar, reiniciar, vencer ou desmontar.
  useEffect(() => {
    if (autoPlayQueue === null) return;
    if (autoPlayQueue.length === 0 || status !== 'playing') {
      setAutoPlayQueue(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const [nextDirection, ...rest] = autoPlayQueue;
      setAutoPlayQueue(rest.length > 0 ? rest : null);
      handleMoveRef.current(nextDirection);
    }, AUTO_PLAY_STEP_MS);

    return () => window.clearTimeout(timeoutId);
  }, [autoPlayQueue, status]);

  const handleRestart = useCallback(() => {
    setAutoPlayQueue(null);
    restart();
  }, [restart]);

  const handleUndo = useCallback(() => {
    setAutoPlayQueue(null);
    undo();
  }, [undo]);

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
        handleMove(KEY_MAP[event.key]);
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'z':
          event.preventDefault();
          handleUndo();
          break;
        case 'r':
          event.preventDefault();
          handleRestart();
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
  }, [activeModal, handleMove, handleRestart, handleUndo, isAutoPlaying, status, onBackToLevels]);

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
          onUndo={handleUndo}
          onRestart={handleRestart}
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
          onRepeat={handleRestart}
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
            if (options?.restartFirst) restart();
            setAutoPlayQueue(directions);
          }}
        />
      )}
    </div>
  );
}
