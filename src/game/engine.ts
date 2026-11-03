// Lógica pura do jogo Sokoban: sem estado do React, sem DOM.
// Recebe um estado e retorna um novo estado (imutável), seguindo RN01-RN05.
import type { Direction, GameState, LevelDefinition, MoveResult, Position } from './types';

const DELTAS: Record<Direction, Position> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

export function key(row: number, col: number): string {
  return `${row},${col}`;
}

export function parseLevel(level: LevelDefinition): GameState {
  const walls = new Set<string>();
  const targets = new Set<string>();
  const boxes = new Set<string>();
  let player: Position | null = null;

  const height = level.rows.length;
  const width = Math.max(...level.rows.map((r) => r.length));

  level.rows.forEach((rowStr, row) => {
    for (let col = 0; col < rowStr.length; col++) {
      const ch = rowStr[col];
      switch (ch) {
        case '#':
          walls.add(key(row, col));
          break;
        case '.':
          targets.add(key(row, col));
          break;
        case '$':
          boxes.add(key(row, col));
          break;
        case '*':
          targets.add(key(row, col));
          boxes.add(key(row, col));
          break;
        case '@':
          player = { row, col };
          break;
        case '+':
          targets.add(key(row, col));
          player = { row, col };
          break;
        default:
          break;
      }
    }
  });

  if (!player) {
    throw new Error(`Nível "${level.id}" não possui personagem (@).`);
  }

  return { width, height, walls, targets, boxes, player };
}

export function cloneState(state: GameState): GameState {
  return {
    width: state.width,
    height: state.height,
    walls: state.walls, // paredes nunca mudam, pode compartilhar a referência
    targets: state.targets, // destinos nunca mudam
    boxes: new Set(state.boxes),
    player: { ...state.player },
  };
}

function isWall(state: GameState, row: number, col: number): boolean {
  if (row < 0 || col < 0 || row >= state.height || col >= state.width) return true;
  return state.walls.has(key(row, col));
}

function isBox(state: GameState, row: number, col: number): boolean {
  return state.boxes.has(key(row, col));
}

/**
 * Aplica um movimento do personagem em uma direção.
 * Não realiza mutação do estado recebido; retorna sempre um novo estado.
 */
export function move(state: GameState, direction: Direction): MoveResult {
  const delta = DELTAS[direction];
  const nextRow = state.player.row + delta.row;
  const nextCol = state.player.col + delta.col;

  // RN02 — bloqueio por parede / limites do cenário
  if (isWall(state, nextRow, nextCol)) {
    return { state, moved: false, pushed: false };
  }

  if (isBox(state, nextRow, nextCol)) {
    const boxNextRow = nextRow + delta.row;
    const boxNextCol = nextCol + delta.col;

    // RN04 — não é permitido empurrar se houver parede ou outra caixa atrás
    if (isWall(state, boxNextRow, boxNextCol) || isBox(state, boxNextRow, boxNextCol)) {
      return { state, moved: false, pushed: false };
    }

    // RN03 — empurra a caixa e move o personagem para a posição anterior dela
    const newBoxes = new Set(state.boxes);
    newBoxes.delete(key(nextRow, nextCol));
    newBoxes.add(key(boxNextRow, boxNextCol));

    const newState: GameState = {
      ...state,
      boxes: newBoxes,
      player: { row: nextRow, col: nextCol },
    };
    return { state: newState, moved: true, pushed: true };
  }

  // Movimento simples para posição livre
  const newState: GameState = {
    ...state,
    player: { row: nextRow, col: nextCol },
  };
  return { state: newState, moved: true, pushed: false };
}

/** RN09 / RF05 — vitória quando todas as caixas estão sobre os destinos. */
export function isWin(state: GameState): boolean {
  if (state.targets.size === 0) return false;
  for (const target of state.targets) {
    if (!state.boxes.has(target)) return false;
  }
  return true;
}

export function boxesOnTarget(state: GameState): number {
  let count = 0;
  for (const box of state.boxes) {
    if (state.targets.has(box)) count++;
  }
  return count;
}
