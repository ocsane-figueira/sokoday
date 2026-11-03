// Tipos centrais do domínio do jogo (independentes de React e de interface gráfica),
// conforme RNF06 (separar lógica do jogo da interface).

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Position {
  row: number;
  col: number;
}

export interface LevelDefinition {
  id: string;
  name: string;
  /**
   * Mapa do nível em notação clássica do Sokoban:
   *  # = parede | (espaço) = chão | . = destino
   *  $ = caixa  | * = caixa sobre destino
   *  @ = personagem | + = personagem sobre destino
   */
  rows: string[];
}

export interface GameState {
  width: number;
  height: number;
  walls: Set<string>;
  targets: Set<string>;
  boxes: Set<string>;
  player: Position;
}

export interface MoveResult {
  state: GameState;
  moved: boolean;
  pushed: boolean;
}

export interface LevelRecord {
  levelId: string;
  moves: number;
  timeMs: number;
  date: string; // ISO
}

export interface LevelProgress {
  completed: boolean;
  bestMoves?: number;
  bestTimeMs?: number;
  history: LevelRecord[];
}
