/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseLevel } from '../../game/engine';
import type { GameState } from '../../game/types';
import { Board } from './Board';

const resizeCallbacks: ResizeObserverCallback[] = [];

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }

  observe() {}

  disconnect() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

function createState(): GameState {
  return parseLevel({
    id: 'mapa-largo',
    name: 'Mapa largo',
    rows: ['####################', '#@                 .#', '####################'],
  });
}

afterEach(() => {
  cleanup();
  resizeCallbacks.length = 0;
});

describe('Board', () => {
  it('recalcula o tamanho das células quando o contêiner muda', () => {
    const { container } = render(<Board state={createState()} facing="right" />);
    const wrapper = container.querySelector('.board-wrapper') as HTMLElement;
    const board = container.querySelector('.board') as HTMLElement;
    Object.defineProperties(wrapper, {
      clientWidth: { configurable: true, value: 640 },
      clientHeight: { configurable: true, value: 240 },
    });

    act(() => {
      window.dispatchEvent(new Event('resize'));
      resizeCallbacks[0]?.([], {} as ResizeObserver);
    });

    expect(Number.parseFloat(board.style.getPropertyValue('--cell-size'))).toBeLessThan(44);
    expect(Number.parseFloat(board.style.getPropertyValue('--cell-size'))).toBeGreaterThan(0);
    expect(board.style.getPropertyValue('--cell-gap')).toBe('1px');
  });
});
