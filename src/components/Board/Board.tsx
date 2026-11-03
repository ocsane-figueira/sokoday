import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { key } from '../../game/engine';
import type { Direction, GameState } from '../../game/types';
import { BoxSprite, PlayerSprite } from '../Sprites';
import { calculateBoardSizing, type BoardSizing } from './boardSizing';
import './Board.css';

interface BoardProps {
  state: GameState;
  /** Direção do último movimento — define para que lado o personagem olha. */
  facing: Direction;
}

type CellKind = 'wall' | 'target' | 'box' | 'box-on-target' | 'player' | 'player-on-target' | 'floor';

function getCellKind(state: GameState, row: number, col: number): CellKind {
  const k = key(row, col);
  const isWall = state.walls.has(k);
  if (isWall) return 'wall';

  const isTarget = state.targets.has(k);
  const isBox = state.boxes.has(k);
  const isPlayer = state.player.row === row && state.player.col === col;

  if (isPlayer) return isTarget ? 'player-on-target' : 'player';
  if (isBox) return isTarget ? 'box-on-target' : 'box';
  if (isTarget) return 'target';
  return 'floor';
}

export function Board({ state, facing }: BoardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [sizing, setSizing] = useState<BoardSizing>({ cellSize: 44, gap: 2 });

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => {
      const computedStyle = window.getComputedStyle(wrapper);
      const horizontalPadding =
        Number.parseFloat(computedStyle.paddingLeft) + Number.parseFloat(computedStyle.paddingRight);
      const verticalPadding =
        Number.parseFloat(computedStyle.paddingTop) + Number.parseFloat(computedStyle.paddingBottom);
      const nextSizing = calculateBoardSizing({
        availableWidth: wrapper.clientWidth - horizontalPadding,
        availableHeight: wrapper.clientHeight - verticalPadding,
        columns: state.width,
        rows: state.height,
        padding: 0,
      });

      setSizing((current) =>
        current.cellSize === nextSizing.cellSize && current.gap === nextSizing.gap ? current : nextSizing,
      );
    };

    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(wrapper);

    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [state.height, state.width]);

  const cells: CellKind[][] = [];
  for (let row = 0; row < state.height; row++) {
    const rowCells: CellKind[] = [];
    for (let col = 0; col < state.width; col++) {
      rowCells.push(getCellKind(state, row, col));
    }
    cells.push(rowCells);
  }

  return (
    <div ref={wrapperRef} className="board-wrapper">
      <div
        className="board"
        style={
          {
            '--cell-size': `${sizing.cellSize}px`,
            '--cell-gap': `${sizing.gap}px`,
            gridTemplateColumns: `repeat(${state.width}, var(--cell-size))`,
            gridTemplateRows: `repeat(${state.height}, var(--cell-size))`,
          } as CSSProperties
        }
      >
        {cells.map((rowCells, row) =>
          rowCells.map((kind, col) => (
            <div key={`${row}-${col}`} className={`cell cell--${kind}`} aria-hidden="true">
              {(kind === 'box' || kind === 'box-on-target') && <BoxSprite onTarget={kind === 'box-on-target'} />}
              {(kind === 'player' || kind === 'player-on-target') && <PlayerSprite facing={facing} />}
              {kind === 'target' && <span className="cell__target" />}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
