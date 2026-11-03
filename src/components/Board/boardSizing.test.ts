import { describe, expect, it } from 'vitest';
import { calculateBoardSizing } from './boardSizing';

describe('calculateBoardSizing', () => {
  it('mantém células de 44px quando o mapa pequeno cabe no espaço disponível', () => {
    expect(
      calculateBoardSizing({
        availableWidth: 640,
        availableHeight: 480,
        columns: 5,
        rows: 3,
        padding: 24,
      }),
    ).toEqual({ cellSize: 44, gap: 2 });
  });

  it('reduz células pela largura para um mapa largo', () => {
    expect(
      calculateBoardSizing({
        availableWidth: 640,
        availableHeight: 480,
        columns: 20,
        rows: 10,
        padding: 24,
      }),
    ).toEqual({ cellSize: 28, gap: 1 });
  });

  it('reduz células pela altura para um mapa alto', () => {
    expect(
      calculateBoardSizing({
        availableWidth: 640,
        availableHeight: 240,
        columns: 8,
        rows: 30,
        padding: 24,
      }),
    ).toEqual({ cellSize: 6, gap: 0 });
  });

  it('usa a menor dimensão quando largura e altura limitam o mapa', () => {
    expect(
      calculateBoardSizing({
        availableWidth: 300,
        availableHeight: 220,
        columns: 12,
        rows: 12,
        padding: 12,
      }),
    ).toEqual({ cellSize: 16, gap: 0 });
  });

  it('nunca retorna tamanho ou espaçamento negativo em contêineres mínimos', () => {
    expect(
      calculateBoardSizing({
        availableWidth: 0,
        availableHeight: 0,
        columns: 100,
        rows: 100,
        padding: 24,
      }),
    ).toEqual({ cellSize: 1, gap: 0 });
  });
});
