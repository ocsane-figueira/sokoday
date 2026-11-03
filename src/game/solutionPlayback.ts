// Constrói os estados da demonstração sem tocar no estado ativo do jogador.
import { cloneState, move, parseLevel } from './engine';
import type { Direction, GameState, LevelDefinition } from './types';

export interface SolutionPlaybackStep {
  state: GameState;
  /** Direção recém-executada, ausente apenas no quadro inicial. */
  direction?: Direction;
  /** Direção usada pelo sprite do personagem no quadro atual. */
  facing: Direction;
}

/**
 * Reproduz uma solução desde o mapa original (`LevelDefinition`) ou desde um
 * estado em andamento (`GameState`) e guarda cada quadro resultante.
 * O tabuleiro principal não participa desta função, por isso reiniciar ou fechar
 * o modal nunca altera movimentos, tempo, histórico ou recordes da partida atual.
 */
export function buildSolutionPlayback(
  source: LevelDefinition | GameState,
  directions: Direction[],
): SolutionPlaybackStep[] {
  let state = 'rows' in source ? cloneState(parseLevel(source)) : cloneState(source);
  const playback: SolutionPlaybackStep[] = [{ state, facing: 'down' }];

  for (const direction of directions) {
    const result = move(state, direction);
    if (!result.moved) {
      throw new Error(`A solução contém um movimento inválido: ${direction}.`);
    }
    state = result.state;
    playback.push({ state, direction, facing: direction });
  }

  return playback;
}
