import type { LevelDefinition } from './types';

// Níveis de exemplo para validar a interface (etapa 1 — sem resolução automática/A*).
// Todos foram verificados manualmente e possuem solução.
export const LEVELS: LevelDefinition[] = [
  {
    id: 'nivel-1',
    name: 'Primeiro Empurrão',
    rows: [
      '#####',
      '#@$.#',
      '#####',
    ],
  },
  {
    id: 'nivel-2',
    name: 'Contorno',
    rows: [
      '#######',
      '#     #',
      '#  $  #',
      '#     #',
      '#  .  #',
      '#     #',
      '#  @  #',
      '#######',
    ],
  },
  {
    id: 'nivel-3',
    name: 'Canto da Sala',
    rows: [
      '######',
      '#.   #',
      '# $  #',
      '#  @ #',
      '#    #',
      '######',
    ],
  },
  {
    id: 'nivel-4',
    name: 'Par Simétrico',
    rows: [
      '########',
      '#      #',
      '# $  $ #',
      '#  ##  #',
      '# .  . #',
      '#   @  #',
      '########',
    ],
  },
  {
    id: 'nivel-5',
    name: 'Linha Dupla',
    rows: [
      '########',
      '#   .  #',
      '#   $  #',
      '#   $  #',
      '#  @   #',
      '#   .  #',
      '########',
    ],
  },
  {
    id: 'nivel-6',
    name: 'Desvio Central',
    rows: [
      '########',
      '#      #',
      '# $$   #',
      '#  ##. #',
      '#   .@ #',
      '#      #',
      '########',
    ],
  },
  {
    id: 'nivel-7',
    name: 'O Corredor',
    rows: [
      '########',
      '#.  #  #',
      '#$  #  #',
      '#   #$ #',
      '#   #. #',
      '# @ #  #',
      '#      #',
      '########',
    ],
  },
  {
    id: 'nivel-8',
    name: 'Labirinto em L',
    rows: [
      '########',
      '# .    #',
      '# $ ## #',
      '#   #. #',
      '# $ #$ #',
      '# @ .  #',
      '#      #',
      '########',
    ],
  },
  {
    id: 'nivel-9',
    name: 'Cruzamento',
    rows: [
      '########',
      '#   .  #',
      '#  $$$ #',
      '# . # .#',
      '#   #  #',
      '#   @  #',
      '#      #',
      '########',
    ],
  },
  {
    id: 'nivel-10',
    name: 'Pequeno Labirinto',
    rows: [
      '########',
      '# .  . #',
      '# $### #',
      '#    # #',
      '#  $   #',
      '#  @   #',
      '########',
    ],
  },
  {
    id: 'nivel-11',
    name: 'Bloqueio Duplo',
    rows: [
      '########',
      '# . .  #',
      '# $ $  #',
      '#   ## #',
      '#   #  #',
      '# $ $  #',
      '# @ . .#',
      '########',
    ],
  },
  {
    id: 'nivel-12',
    name: 'Quatro Pilares',
    rows: [
      '########',
      '#.    .#',
      '# $  $ #',
      '# #  # #',
      '# #  # #',
      '# $  $ #',
      '#. @  .#',
      '########',
    ],
  }
];
export function getLevelIndexById(id: string): number {
  return LEVELS.findIndex((level) => level.id === id);
}
