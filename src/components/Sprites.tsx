import type { ReactElement } from 'react';
import type { Direction } from '../game/types';

/**
 * Sprites em pixel art desenhados como mapas de caracteres 16x16.
 * Cada caractere vira um "pixel" (um <rect> do SVG), então basta editar as
 * strings abaixo para redesenhar um elemento — nenhum arquivo de imagem é
 * necessário e as cores continuam vindo das variáveis CSS (src/index.css).
 */

const PIXEL_GRID = 16;

interface PixelSpriteProps {
  rows: string[];
  palette: Record<string, string>;
  className?: string;
}

/** Converte o mapa de caracteres em <rect>s, agrupando pixels iguais na horizontal. */
function PixelSprite({ rows, palette, className }: PixelSpriteProps) {
  const rects: ReactElement[] = [];

  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      const fill = palette[ch];
      if (!fill) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      rects.push(<rect key={`${y}-${x}`} x={x} y={y} width={run} height={1} fill={fill} />);
      x += run;
    }
  });

  return (
    <svg
      className={className}
      viewBox={`0 0 ${PIXEL_GRID} ${PIXEL_GRID}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {rects}
    </svg>
  );
}

// ---------------------------------------------------------------- Caixa

// F = moldura | P = ripa (madeira clara) | M = face da caixa
const BOX_ROWS = [
  'FFFFFFFFFFFFFFFF',
  'FPPPPPPPPPPPPPPF',
  'FPPPMMMMMMMMPPPF',
  'FPMPPMMMMMMPPMPF',
  'FPMMPPMMMMPPMMPF',
  'FPMMMPPMMPPMMMPF',
  'FPMMMMPPPPMMMMPF',
  'FPMMMMMPPMMMMMPF',
  'FPMMMMPPPPMMMMPF',
  'FPMMMPPMMPPMMMPF',
  'FPMMPPMMMMPPMMPF',
  'FPMPPMMMMMMPPMPF',
  'FPPPMMMMMMMMPPPF',
  'FPPMMMMMMMMMMPPF',
  'FPPPPPPPPPPPPPPF',
  'FFFFFFFFFFFFFFFF',
];

const BOX_PALETTE = {
  F: 'var(--sprite-box-frame)',
  P: 'var(--sprite-box-plank)',
  M: 'var(--sprite-box-face)',
};

const BOX_DONE_PALETTE = {
  F: 'var(--sprite-box-done-frame)',
  P: 'var(--sprite-box-done-plank)',
  M: 'var(--sprite-box-done-face)',
};

export function BoxSprite({ onTarget }: { onTarget: boolean }) {
  return (
    <PixelSprite
      className="cell__sprite"
      rows={BOX_ROWS}
      palette={onTarget ? BOX_DONE_PALETTE : BOX_PALETTE}
    />
  );
}

// ------------------------------------------------------------ Personagem

// . = transparente | H = cabelo | S = pele | E = olho | M = boca
// B = camisa | P = calça | O = sapato
const BODY_ROWS = [
  '.......SS.......',
  '....BBBBBBBB....',
  '...BBBBBBBBBB...',
  '...SBBBBBBBBS...',
  '...SBBBBBBBBS...',
  '....BBBBBBBB....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '...OOOO..OOOO...',
];

const HEAD_DOWN = [
  '................',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...HSSSSSSSSH...',
  '...HSEESSEESH...',
  '...HSSSSSSSSH...',
  '...HSSSMMSSSH...',
];

const HEAD_UP = [
  '................',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
];

const HEAD_LEFT = [
  '................',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...SSSSSSHHHH...',
  '...SEESSSHHHH...',
  '...SSSSSSHHHH...',
  '...SMSSSHHHHH...',
];

/** Espelha o sprite na horizontal (o personagem virado à direita é o inverso do da esquerda). */
const HEAD_RIGHT = HEAD_LEFT.map((row) => [...row].reverse().join(''));

const PLAYER_ROWS: Record<Direction, string[]> = {
  down: [...HEAD_DOWN, ...BODY_ROWS],
  up: [...HEAD_UP, ...BODY_ROWS],
  left: [...HEAD_LEFT, ...BODY_ROWS],
  right: [...HEAD_RIGHT, ...BODY_ROWS],
};

const PLAYER_PALETTE = {
  H: 'var(--sprite-hair)',
  S: 'var(--sprite-skin)',
  E: 'var(--sprite-eye)',
  M: 'var(--sprite-mouth)',
  B: 'var(--sprite-shirt)',
  P: 'var(--sprite-pants)',
  O: 'var(--sprite-shoes)',
};

export function PlayerSprite({ facing }: { facing: Direction }) {
  return <PixelSprite className="cell__sprite" rows={PLAYER_ROWS[facing]} palette={PLAYER_PALETTE} />;
}
