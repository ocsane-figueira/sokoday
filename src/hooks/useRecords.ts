import { useCallback, useState } from 'react';
import type { LevelProgress, LevelRecord } from '../game/types';

// RNF04 — persistência local do progresso do jogador (localStorage).
const STORAGE_KEY = 'sokoban:progress:v1';

type ProgressMap = Record<string, LevelProgress>;

function loadAll(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

function saveAll(data: ProgressMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage indisponível (modo privado, quota etc.) — falha silenciosamente
  }
}

function emptyProgress(): LevelProgress {
  return { completed: false, history: [] };
}

export function useRecords() {
  const [progress, setProgress] = useState<ProgressMap>(() => loadAll());

  const getProgress = useCallback(
    (levelId: string): LevelProgress => progress[levelId] ?? emptyProgress(),
    [progress],
  );

  // RN10/RN13 — só partidas concluídas entram no histórico; recorde é o menor nº de movimentos.
  const recordCompletion = useCallback((levelId: string, moves: number, timeMs: number) => {
    setProgress((prev) => {
      const current = prev[levelId] ?? emptyProgress();
      const entry: LevelRecord = { levelId, moves, timeMs, date: new Date().toISOString() };
      const next: LevelProgress = {
        completed: true,
        bestMoves: current.bestMoves === undefined ? moves : Math.min(current.bestMoves, moves),
        bestTimeMs: current.bestTimeMs === undefined ? timeMs : Math.min(current.bestTimeMs, timeMs),
        history: [...current.history, entry],
      };
      const updated = { ...prev, [levelId]: next };
      saveAll(updated);
      return updated;
    });
  }, []);

  // RF18 — rankings por fase: menor tempo (empate → menos movimentos) e menor nº de movimentos
  // (empate → menor tempo).
  const getRankings = useCallback(
    (levelId: string) => {
      const history = progress[levelId]?.history ?? [];
      const byTime = [...history].sort(
        (a, b) => a.timeMs - b.timeMs || a.moves - b.moves,
      );
      const byMoves = [...history].sort(
        (a, b) => a.moves - b.moves || a.timeMs - b.timeMs,
      );
      return { byTime, byMoves };
    },
    [progress],
  );

  const completedCount = Object.values(progress).filter((p) => p.completed).length;

  return { getProgress, recordCompletion, getRankings, completedCount };
}
