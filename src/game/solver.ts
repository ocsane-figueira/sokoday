// Resolvedor puro de Sokoban. Não depende de React e pode ser reutilizado
// tanto pela demonstração visual quanto pelos testes automatizados.
import { isWin, key, move } from './engine';
import type { Direction, GameState, Position } from './types';

/** Limite de segurança para que uma busca excepcionalmente grande não congele a interface. */
export const DEFAULT_MAX_EXPANDED_NODES = 200_000;

type SearchResult =
  | { status: 'solved'; directions: Direction[]; expandedNodes: number }
  | { status: 'unsolved'; expandedNodes: number }
  | { status: 'limit-reached'; expandedNodes: number };

export type SolutionResult = SearchResult & { searchTimeMs: number };

interface SearchNode {
  state: GameState;
  stateKey: string;
  g: number;
  h: number;
  sequence: number;
}

interface ParentLink {
  previousKey: string;
  directions: Direction[];
}

interface PushTransition {
  state: GameState;
  directions: Direction[];
}

interface WalkingRoute {
  state: GameState;
  directions: Direction[];
}

const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];

const DELTAS: Record<Direction, Position> = {
  up: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

/**
 * Calcula a heurística Manhattan pedida: para cada destino, mede-se a distância
 * até a caixa mais próxima. Obstáculos são ignorados de propósito; assim h nunca
 * superestima o custo restante e A* continua encontrando uma solução ótima.
 */
export function calculateManhattanHeuristic(state: GameState): number {
  const boxes = [...state.boxes].map(positionFromKey);

  return [...state.targets].reduce((sum, targetKey) => {
    const target = positionFromKey(targetKey);
    const nearestBox = Math.min(...boxes.map((box) => manhattanDistance(target, box)));
    return sum + nearestBox;
  }, 0);
}

/**
 * Procura a menor sequência de movimentos do personagem. Cada movimento válido,
 * com ou sem empurrão, possui custo 1; portanto o resultado minimiza os movimentos
 * mostrados ao jogador, e não somente a quantidade de caixas empurradas.
 */
export function solve(
  initialState: GameState,
  maxExpandedNodes = DEFAULT_MAX_EXPANDED_NODES,
): SolutionResult {
  const startedAt = globalThis.performance.now();
  const result = solveSearch(initialState, maxExpandedNodes);

  return { ...result, searchTimeMs: globalThis.performance.now() - startedAt };
}

function solveSearch(
  initialState: GameState,
  maxExpandedNodes = DEFAULT_MAX_EXPANDED_NODES,
): SearchResult {
  if (isWin(initialState)) {
    return { status: 'solved', directions: [], expandedNodes: 0 };
  }

  // Uma caixa em uma casa da qual não há como alcançar destino nem num mapa sem
  // outras caixas nunca poderá ser recuperada. Esta poda é segura e reduz buscas inúteis.
  const liveBoxSquares = findLiveBoxSquares(initialState);
  const targetDistanceMaps = [...initialState.targets].map((targetKey) =>
    findStaticPushDistances(initialState, targetKey),
  );
  // Alguns níveis possuem caixas excedentes: como a vitória só exige ocupar todos
  // os destinos, essas caixas podem permanecer fora do objetivo. Nesse caso uma
  // caixa morta não prova ausência de solução e a poda deve ficar desativada.
  const canPruneDeadBoxes = initialState.boxes.size === initialState.targets.size;
  if (canPruneDeadBoxes && hasStaticDeadBox(initialState, liveBoxSquares)) {
    return { status: 'unsolved', expandedNodes: 0 };
  }

  const startKey = serializeState(initialState);
  const openSet = new MinHeap<SearchNode>(compareNodes);
  const bestCosts = new Map<string, number>([[startKey, 0]]);
  const parents = new Map<string, ParentLink>();
  let expandedNodes = 0;
  let sequence = 0;

  openSet.push({
    state: initialState,
    stateKey: startKey,
    g: 0,
    h: calculateSearchHeuristic(initialState, targetDistanceMaps),
    sequence: sequence++,
  });

  while (!openSet.isEmpty()) {
    const current = openSet.pop()!;

    // A fila pode manter uma versão antiga do mesmo estado; a versão de menor g
    // registrada em bestCosts é a única que pode ser expandida corretamente.
    if (bestCosts.get(current.stateKey) !== current.g) continue;

    if (expandedNodes >= maxExpandedNodes) {
      return { status: 'limit-reached', expandedNodes };
    }
    expandedNodes += 1;

    if (isWin(current.state)) {
      return {
        status: 'solved',
        directions: reconstructPath(current.stateKey, parents),
        expandedNodes,
      };
    }

    for (const transition of findPushTransitions(current.state)) {
      if (
        canPruneDeadBoxes &&
        hasStaticDeadBox(transition.state, liveBoxSquares)
      ) {
        continue;
      }

      const nextKey = serializeState(transition.state);
      const nextCost = current.g + transition.directions.length;
      if (nextCost >= (bestCosts.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;

      // Registrar pai e ação permite reconstruir a resposta sem armazenar cópias
      // inteiras do caminho em todos os nós da fila de prioridade.
      bestCosts.set(nextKey, nextCost);
      parents.set(nextKey, { previousKey: current.stateKey, directions: transition.directions });
      openSet.push({
        state: transition.state,
        stateKey: nextKey,
        g: nextCost,
        h: calculateSearchHeuristic(transition.state, targetDistanceMaps),
        sequence: sequence++,
      });
    }
  }

  return { status: 'unsolved', expandedNodes };
}

/** Serializa jogador e caixas ordenadas para reconhecer estados equivalentes. */
function serializeState(state: GameState): string {
  return `${key(state.player.row, state.player.col)}|${[...state.boxes].sort().join(';')}`;
}

function positionFromKey(positionKey: string): Position {
  const [row, col] = positionKey.split(',').map(Number);
  return { row, col };
}

function manhattanDistance(first: Position, second: Position): number {
  return Math.abs(first.row - second.row) + Math.abs(first.col - second.col);
}

/**
 * Mantém a Manhattan solicitada e a reforça com um pareamento exclusivo entre
 * caixas e destinos. As distâncias de empurrão são calculadas no mapa estático;
 * ignorar as demais caixas só reduz o custo estimado, portanto o maior limite
 * inferior continua admissível para A*.
 */
function calculateSearchHeuristic(
  state: GameState,
  targetDistanceMaps: Map<string, number>[],
): number {
  return Math.max(
    calculateManhattanHeuristic(state),
    calculateMinimumMatchingDistance(state, targetDistanceMaps),
  );
}

function calculateMinimumMatchingDistance(
  state: GameState,
  targetDistanceMaps: Map<string, number>[],
): number {
  const boxes = [...state.boxes];
  if (boxes.length < targetDistanceMaps.length) return Number.POSITIVE_INFINITY;

  const memo = new Map<string, number>();
  const visit = (targetIndex: number, usedBoxes: number): number => {
    if (targetIndex === targetDistanceMaps.length) return 0;

    const memoKey = `${targetIndex}:${usedBoxes}`;
    const cached = memo.get(memoKey);
    if (cached !== undefined) return cached;

    let best = Number.POSITIVE_INFINITY;
    for (let boxIndex = 0; boxIndex < boxes.length; boxIndex++) {
      if ((usedBoxes & (1 << boxIndex)) !== 0) continue;
      const distance = targetDistanceMaps[targetIndex].get(boxes[boxIndex]);
      if (distance === undefined) continue;
      best = Math.min(best, distance + visit(targetIndex + 1, usedBoxes | (1 << boxIndex)));
    }

    memo.set(memoKey, best);
    return best;
  };

  return visit(0, 0);
}

/**
 * Para uma configuração de caixas, encontra a menor caminhada até cada posição
 * que permite empurrar uma caixa. Expandir somente empurrões evita representar
 * milhares de posições intermediárias equivalentes, mas cada aresta ainda cobra
 * todos os passos reais da caminhada e do empurrão final.
 */
function findPushTransitions(state: GameState): PushTransition[] {
  const routes = findWalkingRoutes(state);
  const transitions: PushTransition[] = [];

  for (const boxKey of state.boxes) {
    const box = positionFromKey(boxKey);
    for (const direction of DIRECTIONS) {
      const delta = DELTAS[direction];
      const playerSupportKey = key(box.row - delta.row, box.col - delta.col);
      const route = routes.get(playerSupportKey);
      if (!route) continue;

      // O último movimento usa o mesmo motor do jogo, garantindo que as regras
      // de parede, caixa à frente e empurrão sejam idênticas às da interface.
      const push = move(route.state, direction);
      if (!push.moved || !push.pushed) continue;
      transitions.push({ state: push.state, directions: [...route.directions, direction] });
    }
  }

  return transitions;
}

/** Busca em largura das caminhadas do personagem sem alterar a posição de caixas. */
function findWalkingRoutes(initialState: GameState): Map<string, WalkingRoute> {
  const routes = new Map<string, WalkingRoute>();
  const queue: WalkingRoute[] = [{ state: initialState, directions: [] }];
  routes.set(key(initialState.player.row, initialState.player.col), queue[0]);

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const direction of DIRECTIONS) {
      const next = move(current.state, direction);
      // Caminhadas que empurram são tratadas separadamente como uma transição A*.
      if (!next.moved || next.pushed) continue;

      const nextKey = key(next.state.player.row, next.state.player.col);
      if (routes.has(nextKey)) continue;

      const route = { state: next.state, directions: [...current.directions, direction] };
      routes.set(nextKey, route);
      queue.push(route);
    }
  }

  return routes;
}

/** Reconstrói o caminho do estado vencedor até o inicial, na ordem de execução. */
function reconstructPath(finalKey: string, parents: Map<string, ParentLink>): Direction[] {
  const segments: Direction[][] = [];
  let currentKey = finalKey;

  while (parents.has(currentKey)) {
    const parent = parents.get(currentKey)!;
    segments.push(parent.directions);
    currentKey = parent.previousKey;
  }

  return segments.reverse().flat();
}

/**
 * Faz uma busca reversa de "puxar caixa" a partir dos destinos. Se uma caixa
 * pudesse ser empurrada de A para B, na busca reversa ela pode ir de B para A
 * desde que a casa de apoio do personagem também não seja parede.
 */
function findLiveBoxSquares(state: GameState): Set<string> {
  const liveSquares = new Set(state.targets);
  const queue = [...state.targets].map(positionFromKey);

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];

    for (const direction of DIRECTIONS) {
      const delta = DELTAS[direction];
      const previousBox = { row: current.row - delta.row, col: current.col - delta.col };
      const playerSupport = { row: previousBox.row - delta.row, col: previousBox.col - delta.col };
      const previousKey = key(previousBox.row, previousBox.col);

      if (
        isStaticWall(state, previousBox) ||
        isStaticWall(state, playerSupport) ||
        liveSquares.has(previousKey)
      ) {
        continue;
      }

      liveSquares.add(previousKey);
      queue.push(previousBox);
    }
  }

  return liveSquares;
}

/** Calcula quantos empurrões mínimos uma caixa precisa para chegar a um destino estático. */
function findStaticPushDistances(state: GameState, targetKey: string): Map<string, number> {
  const distances = new Map<string, number>([[targetKey, 0]]);
  const queue = [positionFromKey(targetKey)];

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const currentDistance = distances.get(key(current.row, current.col))!;

    for (const direction of DIRECTIONS) {
      const delta = DELTAS[direction];
      const previousBox = { row: current.row - delta.row, col: current.col - delta.col };
      const playerSupport = { row: previousBox.row - delta.row, col: previousBox.col - delta.col };
      const previousKey = key(previousBox.row, previousBox.col);

      if (isStaticWall(state, previousBox) || isStaticWall(state, playerSupport) || distances.has(previousKey)) {
        continue;
      }

      distances.set(previousKey, currentDistance + 1);
      queue.push(previousBox);
    }
  }

  return distances;
}

function hasStaticDeadBox(state: GameState, liveBoxSquares: Set<string>): boolean {
  for (const box of state.boxes) {
    if (!state.targets.has(box) && !liveBoxSquares.has(box)) return true;
  }
  return false;
}

function isStaticWall(state: GameState, position: Position): boolean {
  return (
    position.row < 0 ||
    position.col < 0 ||
    position.row >= state.height ||
    position.col >= state.width ||
    state.walls.has(key(position.row, position.col))
  );
}

function compareNodes(first: SearchNode, second: SearchNode): number {
  const firstScore = first.g + first.h;
  const secondScore = second.g + second.h;
  return firstScore - secondScore || first.h - second.h || first.sequence - second.sequence;
}

/** Fila de prioridade mínima compacta para manter a dependência do resolvedor em zero. */
class MinHeap<T> {
  private readonly values: T[] = [];
  private readonly compare: (first: T, second: T) => number;

  constructor(compare: (first: T, second: T) => number) {
    this.compare = compare;
  }

  isEmpty(): boolean {
    return this.values.length === 0;
  }

  push(value: T): void {
    this.values.push(value);
    this.bubbleUp(this.values.length - 1);
  }

  pop(): T | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (this.values.length > 0 && last !== undefined) {
      this.values[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  private bubbleUp(index: number): void {
    let child = index;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.compare(this.values[child], this.values[parent]) >= 0) break;
      [this.values[child], this.values[parent]] = [this.values[parent], this.values[child]];
      child = parent;
    }
  }

  private bubbleDown(index: number): void {
    let parent = index;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;

      if (left < this.values.length && this.compare(this.values[left], this.values[smallest]) < 0) smallest = left;
      if (right < this.values.length && this.compare(this.values[right], this.values[smallest]) < 0) smallest = right;
      if (smallest === parent) return;

      [this.values[parent], this.values[smallest]] = [this.values[smallest], this.values[parent]];
      parent = smallest;
    }
  }
}
