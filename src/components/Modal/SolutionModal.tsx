import { useEffect, useMemo, useRef, useState } from 'react';
import { key, parseLevel } from '../../game/engine';
import { buildSolutionPlayback } from '../../game/solutionPlayback';
import { solve } from '../../game/solver';
import type { SolutionResult } from '../../game/solver';
import type { Direction, GameState, LevelDefinition } from '../../game/types';
import { Board } from '../Board/Board';
import './Modal.css';

interface SolutionModalProps {
  level: LevelDefinition;
  levelName: string;
  /** Solução calculada a partir do mapa original da fase. */
  initialSolution: SolutionResult;
  /** Estado vigente da partida, usado para recalcular a solução. */
  currentState: GameState;
  onClose: () => void;
  /**
   * Pede ao jogo que execute as direções passo a passo. 
estartFirst indica
   * que as direções partem do mapa original e a partida deve ser reiniciada antes.
   */
  onApplySolution: (directions: Direction[], options?: { restartFirst: boolean }) => void;
}

const DIRECTION_LABELS: Record<Direction, string> = {
  up: 'Cima',
  right: 'Direita',
  down: 'Baixo',
  left: 'Esquerda',
};

/**
 * Mostra uma solução calculada sobre uma cópia do mapa inicial. O índice muda
 * apenas o quadro exibido no modal; o tabuleiro e o progresso da partida seguem
 * completamente independentes desta demonstração.
 */
export function SolutionModal({
  level,
  levelName,
  initialSolution,
  currentState,
  onClose,
  onApplySolution,
}: SolutionModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [activeSolution, setActiveSolution] = useState<SolutionResult>(initialSolution);
  const [isCurrentStateSource, setIsCurrentStateSource] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const playback = useMemo(
    () =>
      activeSolution.status === 'solved'
        ? buildSolutionPlayback(isCurrentStateSource ? currentState : level, activeSolution.directions)
        : [],
    [activeSolution, currentState, isCurrentStateSource, level],
  );

  function calculateFromCurrentState() {
    setActiveSolution(solve(currentState));
    setIsCurrentStateSource(true);
    setCurrentStep(0);
  }

  function backToInitialSolution() {
    setActiveSolution(initialSolution);
    setIsCurrentStateSource(false);
    setCurrentStep(0);
  }

  // A solução inicial só vale a partir do mapa original; se a partida já andou e
  // não houve recálculo, a execução precisa reiniciar a fase antes.
  const needsRestart = !isCurrentStateSource && !isSameAsInitial(currentState, level);
  const autoPlayLabel = needsRestart ? 'Reiniciar e resolver' : 'Resolver automaticamente';

  function applySolution() {
    if (activeSolution.status !== 'solved' || activeSolution.directions.length === 0) return;

    onApplySolution(activeSolution.directions, needsRestart ? { restartFirst: true } : undefined);
    onClose();
  }

  // O foco inicial e a restauração ao fechar evitam que o diálogo interrompa
  // a navegação do jogador pela página que abriu a demonstração.
  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => previousFocusRef.current?.focus();
  }, []);

  // Escape encerra a demonstração e Tab nunca alcança os controles da partida
  // que permanecem visualmente cobertos pelo overlay do modal.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if (key === 'arrowleft') {
        event.preventDefault();
        setCurrentStep((step) => Math.max(0, step - 1));
        return;
      }

      if (key === 'arrowright') {
        event.preventDefault();
        setCurrentStep((step) => Math.min(Math.max(0, playback.length - 1), step + 1));
        return;
      }

      if (key === 'r') {
        event.preventDefault();
        setCurrentStep(0);
        return;
      }

      if (key === 'escape' || key === 'f') {
        if (event.repeat) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = getFocusableElements(dialog);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, playback.length]);

  const sourceActions = (
    <>
      {!isCurrentStateSource && (
        <button type="button" className="btn btn--solve-current" onClick={calculateFromCurrentState}>
          Calcular atual
        </button>
      )}
      {isCurrentStateSource && (
        <button type="button" className="btn" onClick={backToInitialSolution}>
          Voltar ao mapa original
        </button>
      )}
    </>
  );

  if (activeSolution.status !== 'solved') {
    return (
      <div className="modal-overlay">
        <div ref={dialogRef} className="modal modal--solution" role="dialog" aria-modal="true" aria-labelledby="solution-modal-title">
          <p className="modal__eyebrow">Solução ótima</p>
          <div className="solution-modal__heading">
            <h2 id="solution-modal-title" className="modal__title">
              {levelName}
            </h2>
            <span className="solution-modal__search-time">Busca: {formatSearchTime(activeSolution.searchTimeMs)}</span>
          </div>
          <p className="solution-modal__message">
            {activeSolution.status === 'limit-reached'
              ? 'A busca atingiu o limite de segurança antes de encontrar uma solução.'
              : isCurrentStateSource
                ? 'Não foi encontrada uma solução a partir do estado atual.'
                : 'Não foi encontrada uma solução para este mapa.'}
          </p>
          <div className="modal__actions modal__actions--solution">
            {sourceActions}
            <button type="button" className="btn btn--auto-play" disabled>
              {autoPlayLabel}
            </button>
            <button ref={closeButtonRef} type="button" className="btn btn--primary" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = playback[currentStep];
  const totalSteps = playback.length - 1;
  const isInitialStep = currentStep === 0;

  return (
    <div className="modal-overlay">
      <div ref={dialogRef} className="modal modal--solution" role="dialog" aria-modal="true" aria-labelledby="solution-modal-title">
        <p className="modal__eyebrow">
          Solução ótima · {isCurrentStateSource ? 'a partir do estado atual' : 'a partir do mapa original'}
        </p>
        <div className="solution-modal__heading">
          <h2 id="solution-modal-title" className="modal__title">
            {levelName}
          </h2>
          <span className="solution-modal__search-time">Busca: {formatSearchTime(activeSolution.searchTimeMs)}</span>
        </div>

        <div className="solution-modal__progress" aria-live="polite">
          <span>Passo {currentStep} de {totalSteps}</span>
          <strong>{isInitialStep ? 'Estado inicial' : DIRECTION_LABELS[current.direction!]}</strong>
        </div>

        <div className="solution-modal__board">
          <Board state={current.state} facing={current.facing} />
        </div>

        <div className="modal__actions modal__actions--solution">
          <button type="button" className="btn" onClick={() => setCurrentStep((step) => step - 1)} disabled={isInitialStep}>
            Anterior
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setCurrentStep((step) => step + 1)}
            disabled={currentStep === totalSteps}
          >
            Próximo
          </button>
          {sourceActions}
          <button
            type="button"
            className="btn btn--auto-play"
            onClick={applySolution}
            disabled={totalSteps === 0}
          >
            {autoPlayLabel}
          </button>
          <button type="button" className="btn" onClick={() => setCurrentStep(0)} disabled={isInitialStep}>
            Reiniciar demonstração
          </button>
          <button ref={closeButtonRef} type="button" className="btn" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Indica se a partida ainda está exatamente no mapa original da fase. */
function isSameAsInitial(state: GameState, level: LevelDefinition): boolean {
  const initial = parseLevel(level);
  if (key(state.player.row, state.player.col) !== key(initial.player.row, initial.player.col)) return false;
  if (state.boxes.size !== initial.boxes.size) return false;
  for (const box of initial.boxes) {
    if (!state.boxes.has(box)) return false;
  }
  return true;
}

function formatSearchTime(searchTimeMs: number): string {
  if (searchTimeMs < 1000) return `${Math.round(searchTimeMs)} ms`;

  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(searchTimeMs / 1000)} s`;
}

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('disabled'));
}
