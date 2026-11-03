/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { move, parseLevel } from '../../game/engine';
import type { SolutionResult } from '../../game/solver';
import type { Direction, GameState, LevelDefinition } from '../../game/types';
import { SolutionModal } from './SolutionModal';

const level: LevelDefinition = {
  id: 'tiny',
  name: 'Labirinto Compacto',
  rows: ['#####', '#@$.#', '#####'],
};

const longLevel: LevelDefinition = {
  id: 'long',
  name: 'Corredor',
  rows: ['########', '#@ $  .#', '########'],
};

afterEach(cleanup);

function renderModal(overrides: {
  level?: LevelDefinition;
  initialSolution: SolutionResult;
  currentState?: GameState;
  onApplySolution?: (directions: Direction[], options?: { restartFirst: boolean }) => void;
  onClose?: () => void;
}) {
  const modalLevel = overrides.level ?? level;
  return render(
    <SolutionModal
      level={modalLevel}
      levelName={modalLevel.name}
      initialSolution={overrides.initialSolution}
      currentState={overrides.currentState ?? parseLevel(modalLevel)}
      onClose={overrides.onClose ?? (() => { })}
      onApplySolution={overrides.onApplySolution ?? (() => { })}
    />,
  );
}

describe('SolutionModal', () => {
  it('exibe o tempo da busca em milissegundos ou segundos', () => {
    const solution = {
      status: 'solved',
      directions: [],
      expandedNodes: 1,
      searchTimeMs: 850,
    } as SolutionResult;

    renderModal({ initialSolution: solution });
    expect(screen.getByText('Busca: 850 ms')).toBeTruthy();

    cleanup();
    renderModal({ initialSolution: { ...solution, searchTimeMs: 1250 } });
    expect(screen.getByText('Busca: 1,3 s')).toBeTruthy();
  });

  it('exibe o tempo mesmo quando não encontra solução', () => {
    const solution = {
      status: 'unsolved',
      expandedNodes: 1,
      searchTimeMs: 12,
    } as SolutionResult;

    renderModal({ initialSolution: solution });

    expect(screen.getByText('Busca: 12 ms')).toBeTruthy();
  });

  it('exibe o tempo quando a busca atinge o limite', () => {
    const solution = {
      status: 'limit-reached',
      expandedNodes: 200_000,
      searchTimeMs: 1250,
    } as SolutionResult;

    renderModal({ initialSolution: solution });

    expect(screen.getByText('Busca: 1,3 s')).toBeTruthy();
  });

  it('recalcula a solução a partir do estado atual da partida', () => {
    // Jogador já empurrou a caixa uma casa: restam 2 passos em vez de 3.
    const afterPush = move(parseLevel(longLevel), 'right').state;
    const pushed = move(afterPush, 'right').state;
    const initialSolution = {
      status: 'solved',
      directions: ['right', 'right', 'right', 'right'],
      expandedNodes: 1,
      searchTimeMs: 1,
    } as SolutionResult;

    renderModal({ level: longLevel, initialSolution, currentState: pushed });

    expect(screen.getByText('Passo 0 de 4')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Calcular atual' }));

    expect(screen.getByText('Passo 0 de 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Calcular atual' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao mapa original' }));
    expect(screen.getByText('Passo 0 de 4')).toBeTruthy();
  });

  it('executa a solução inicial no jogo sem reiniciar quando a partida está no início', () => {
    const directions: Direction[] = ['right'];
    const onApplySolution = vi.fn();
    const onClose = vi.fn();

    renderModal({
      initialSolution: { status: 'solved', directions, expandedNodes: 1, searchTimeMs: 1 } as SolutionResult,
      onApplySolution,
      onClose,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Resolver automaticamente' }));

    expect(onApplySolution).toHaveBeenCalledWith(directions, undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('executa a solução recalculada a partir do estado atual', () => {
    const current = move(parseLevel(longLevel), 'right').state;
    const onApplySolution = vi.fn();
    const onClose = vi.fn();

    renderModal({
      level: longLevel,
      initialSolution: {
        status: 'solved',
        directions: ['right', 'right', 'right', 'right'],
        expandedNodes: 1,
        searchTimeMs: 1,
      } as SolutionResult,
      currentState: current,
      onApplySolution,
      onClose,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Calcular atual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolver automaticamente' }));

    expect(onApplySolution).toHaveBeenCalledWith(['right', 'right', 'right'], undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reinicia a fase antes de aplicar a solução inicial se a partida já andou', () => {
    const directions: Direction[] = ['right', 'right', 'right', 'right'];
    const onApplySolution = vi.fn();

    renderModal({
      level: longLevel,
      initialSolution: { status: 'solved', directions, expandedNodes: 1, searchTimeMs: 1 } as SolutionResult,
      currentState: move(parseLevel(longLevel), 'right').state,
      onApplySolution,
    });

    expect(screen.queryByRole('button', { name: 'Resolver automaticamente' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar e resolver' }));

    expect(onApplySolution).toHaveBeenCalledWith(directions, { restartFirst: true });
  });

  it('desabilita a execução automática quando não há passos a executar', () => {
    renderModal({
      initialSolution: { status: 'solved', directions: [], expandedNodes: 0, searchTimeMs: 1 } as SolutionResult,
    });

    const button = screen.getByRole('button', { name: 'Resolver automaticamente' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
