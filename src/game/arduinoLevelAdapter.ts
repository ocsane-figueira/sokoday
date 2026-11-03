import type { Direction, LevelDefinition } from './types';

/**
 * Os 4 níveis gravados na memória Flash do Arduino Uno (definidos em PROGMEM).
 */
export const DEFAULT_ARDUINO_LEVELS: LevelDefinition[] = [
  {
    id: 'UNO:1',
    name: 'Arduino Fase 1',
    rows: [
      '########',
      '#      #',
      '#  $   #',
      '#  .   #',
      '#  @   #',
      '#      #',
      '#      #',
      '########',
    ],
  },
  {
    id: 'UNO:2',
    name: 'Arduino Fase 2',
    rows: [
      '########',
      '#      #',
      '#  .   #',
      '#  $   #',
      '#  $   #',
      '#  @   #',
      '#  .   #',
      '########',
    ],
  },
  {
    id: 'UNO:3',
    name: 'Arduino Fase 3',
    rows: [
      '########',
      '#  .   #',
      '#  ##$ #',
      '#  #   #',
      '#  $ . #',
      '#  #   #',
      '#  @   #',
      '########',
    ],
  },
  {
    id: 'UNO:4',
    name: 'Arduino Fase 4',
    rows: [
      '########',
      '# .$ . #',
      '#  $   #',
      '#  ##  #',
      '#      #',
      '#   @  #',
      '#      #',
      '########',
    ],
  },
];

/**
 * Formata um nível do Sokoban para a matriz física 8x8 do Arduino Uno.
 * Preenche linhas menores com espaços à direita e adiciona linhas vazias
 * até totalizar rigorosamente 8 linhas de 8 colunas.
 */
export function formatLevelForUno(level: LevelDefinition): string[] {
  if (level.rows.length > 8) {
    throw new Error(
      `Nível "${level.id}" tem ${level.rows.length} linhas, excedendo o limite de 8x8 do Arduino Uno.`,
    );
  }

  const formattedRows: string[] = [];
  for (let y = 0; y < 8; y++) {
    const rawRow = level.rows[y] ?? '';
    if (rawRow.length > 8) {
      throw new Error(
        `Linha ${y} do nível "${level.id}" tem ${rawRow.length} colunas, excedendo o limite de 8 colunas.`,
      );
    }
    formattedRows.push(rawRow.padEnd(8, ' '));
  }

  return formattedRows;
}

/**
 * Converte 8 linhas recebidas do Arduino Uno (via MAP_ROW) em um LevelDefinition válido do site.
 */
export function parseArduinoMapToLevel(id: number, rows: string[]): LevelDefinition {
  const paddedRows: string[] = [];
  for (let y = 0; y < 8; y++) {
    const raw = rows[y] ?? '';
    paddedRows.push(raw.padEnd(8, ' '));
  }

  return {
    id: `UNO:${id}`,
    name: `Arduino Fase ${id}`,
    rows: paddedRows,
  };
}

/**
 * Extrai um identificador numérico de um ID de nível (ex: "LVL:5" -> 5, "UNO:2" -> 2).
 */
export function extractNumericLevelId(id: string): number {
  const match = id.match(/\d+/);
  if (match) {
    const parsed = parseInt(match[0], 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 1;
}

/**
 * Converte a direção do jogo para o caractere de comando do Arduino Uno ('U', 'D', 'L', 'R').
 */
export function directionToUno(dir: Direction): 'U' | 'D' | 'L' | 'R' {
  switch (dir) {
    case 'up':
      return 'U';
    case 'down':
      return 'D';
    case 'left':
      return 'L';
    case 'right':
      return 'R';
  }
}

/**
 * Converte o caractere recebido do Arduino Uno para a direção correspondente no jogo.
 */
export function unoToDirection(code: string): Direction | null {
  switch (code.trim().toUpperCase()) {
    case 'U':
      return 'up';
    case 'D':
      return 'down';
    case 'L':
      return 'left';
    case 'R':
      return 'right';
    default:
      return null;
  }
}
