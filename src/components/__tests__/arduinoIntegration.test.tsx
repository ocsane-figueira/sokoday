/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArduinoProvider } from '../../context/ArduinoContext';
import { arduinoSerial } from '../../services/arduinoSerial';
import { Header } from '../Header/Header';
import { LevelSelect } from '../LevelSelect/LevelSelect';

beforeEach(() => {
  Object.defineProperty(navigator, 'serial', {
    configurable: true,
    writable: true,
    value: {
      requestPort: vi.fn(),
      addEventListener: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Integração Web <-> Arduino Uno', () => {
  describe('Header', () => {
    it('exibe botão de conectar quando desconectado', () => {
      render(
        <ArduinoProvider>
          <Header completedCount={0} totalLevels={12} />
        </ArduinoProvider>,
      );

      const connectBtn = screen.getByRole('button', { name: /Conectar Uno/i });
      expect(connectBtn).toBeDefined();
    });

    it('exibe badge conectado e botão desconectar após conexão', async () => {
      vi.spyOn(arduinoSerial, 'connect').mockImplementation(async () => {
        vi.spyOn(arduinoSerial, 'isConnected').mockReturnValue(true);
      });
      vi.spyOn(arduinoSerial, 'disconnect').mockImplementation(async () => {
        vi.spyOn(arduinoSerial, 'isConnected').mockReturnValue(false);
      });

      render(
        <ArduinoProvider>
          <Header completedCount={0} totalLevels={12} />
        </ArduinoProvider>,
      );

      const connectBtn = screen.getByRole('button', { name: /Conectar Uno/i });
      await act(async () => {
        fireEvent.click(connectBtn);
      });

      expect(screen.getByText(/Uno Conectado/i)).toBeDefined();
      const disconnectBtn = screen.getByRole('button', { name: /Desconectar/i });
      expect(disconnectBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(disconnectBtn);
      });

      expect(screen.getByRole('button', { name: /Conectar Uno/i })).toBeDefined();
    });
  });

  describe('LevelSelect', () => {
    const mockGetProgress = () => ({
      completed: false,
      history: [],
    });

    it('permite alternar entre as abas Fases Web e Fases do Uno', () => {
      render(
        <ArduinoProvider>
          <LevelSelect getProgress={mockGetProgress} onSelectLevel={() => { }} />
        </ArduinoProvider>,
      );

      const webTab = screen.getByRole('button', { name: /Fases Web/i });
      const unoTab = screen.getByRole('button', { name: /Fases do Uno/i });

      expect(webTab).toBeDefined();
      expect(unoTab).toBeDefined();

      // Inicialmente na aba Web
      expect(screen.getByText('Primeiro Empurrão')).toBeDefined();

      // Clica na aba Arduino
      fireEvent.click(unoTab);
      expect(screen.getByText(/Fases Nativas na Flash do Arduino Uno/i)).toBeDefined();
      expect(screen.getByText('Arduino Fase 1')).toBeDefined();
      expect(screen.getByText('Arduino Fase 4')).toBeDefined();
    });

    it('transmite a fase via SET_MAP ao selecionar uma fase Web com Uno conectado', async () => {
      const sendMapSpy = vi.spyOn(arduinoSerial, 'sendMap').mockResolvedValue(undefined);
      vi.spyOn(arduinoSerial, 'isConnected').mockReturnValue(true);

      const onSelect = vi.fn();
      render(
        <ArduinoProvider initialStatus="connected">
          <LevelSelect getProgress={mockGetProgress} onSelectLevel={onSelect} />
        </ArduinoProvider>,
      );

      const firstLevelCard = screen.getByRole('button', { name: /Primeiro Empurrão/i });
      await act(async () => {
        fireEvent.click(firstLevelCard);
      });

      expect(sendMapSpy).toHaveBeenCalledWith(1, expect.any(Array));
      expect(onSelect).toHaveBeenCalled();
    });

    it('envia SET_LEVEL ao selecionar uma fase do Uno com Uno conectado', async () => {
      const sendCommandSpy = vi.spyOn(arduinoSerial, 'sendCommand').mockResolvedValue(undefined);
      vi.spyOn(arduinoSerial, 'isConnected').mockReturnValue(true);

      const onSelect = vi.fn();
      render(
        <ArduinoProvider initialStatus="connected">
          <LevelSelect getProgress={mockGetProgress} onSelectLevel={onSelect} />
        </ArduinoProvider>,
      );

      const unoTab = screen.getByRole('button', { name: /Fases do Uno/i });
      fireEvent.click(unoTab);

      const unoLevel2Card = screen.getByRole('button', { name: /Arduino Fase 2/i });
      await act(async () => {
        fireEvent.click(unoLevel2Card);
      });

      expect(sendCommandSpy).toHaveBeenCalledWith('SET_LEVEL:2');
      expect(onSelect).toHaveBeenCalled();
    });
  });

  describe('GameScreen e Anti-Eco', () => {
    const mockProgress = { completed: false, history: [] };

    it('movimento do teclado no site envia MV para o Uno', async () => {
      const sendCommandSpy = vi.spyOn(arduinoSerial, 'sendCommand').mockResolvedValue(undefined);
      vi.spyOn(arduinoSerial, 'isConnected').mockReturnValue(true);

      const { LEVELS } = await import('../../game/levels');
      const { GameScreen } = await import('../GameScreen/GameScreen');

      render(
        <ArduinoProvider initialStatus="connected">
          <GameScreen
            level={LEVELS[0]}
            levelNumber={1}
            totalLevels={12}
            completedCount={0}
            hasNextLevel={true}
            getProgress={() => mockProgress}
            recordCompletion={() => { }}
            getRankings={() => ({ byTime: [], byMoves: [] })}
            onBackToLevels={() => { }}
            onNextLevel={() => { }}
          />
        </ArduinoProvider>,
      );

      // Pressiona seta para a direita
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });

      expect(sendCommandSpy).toHaveBeenCalledWith('MV:R');
    });

    it('tecla Z envia UNDO e tecla R envia RESET ao Uno', async () => {
      const sendCommandSpy = vi.spyOn(arduinoSerial, 'sendCommand').mockResolvedValue(undefined);
      vi.spyOn(arduinoSerial, 'isConnected').mockReturnValue(true);

      const { LEVELS } = await import('../../game/levels');
      const { GameScreen } = await import('../GameScreen/GameScreen');

      render(
        <ArduinoProvider initialStatus="connected">
          <GameScreen
            level={LEVELS[0]}
            levelNumber={1}
            totalLevels={12}
            completedCount={0}
            hasNextLevel={true}
            getProgress={() => mockProgress}
            recordCompletion={() => { }}
            getRankings={() => ({ byTime: [], byMoves: [] })}
            onBackToLevels={() => { }}
            onNextLevel={() => { }}
          />
        </ArduinoProvider>,
      );

      // Pressiona Z
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
      });
      expect(sendCommandSpy).toHaveBeenCalledWith('UNDO');

      // Pressiona R
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
      });
      expect(sendCommandSpy).toHaveBeenCalledWith('RESET');
    });

    it('tecla R ou repetir em nível do Arduino (UNO:2) envia SET_LEVEL:2', async () => {
      const sendCommandSpy = vi.spyOn(arduinoSerial, 'sendCommand').mockResolvedValue(undefined);
      vi.spyOn(arduinoSerial, 'isConnected').mockReturnValue(true);

      const { DEFAULT_ARDUINO_LEVELS } = await import('../../game/arduinoLevelAdapter');
      const { GameScreen } = await import('../GameScreen/GameScreen');

      render(
        <ArduinoProvider initialStatus="connected">
          <GameScreen
            level={DEFAULT_ARDUINO_LEVELS[1]}
            levelNumber={2}
            totalLevels={4}
            completedCount={0}
            hasNextLevel={true}
            getProgress={() => mockProgress}
            recordCompletion={() => {}}
            getRankings={() => ({ byTime: [], byMoves: [] })}
            onBackToLevels={() => {}}
            onNextLevel={() => {}}
          />
        </ArduinoProvider>,
      );

      // Pressiona R
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
      });
      expect(sendCommandSpy).toHaveBeenCalledWith('SET_LEVEL:2');
    });

    it('movimento físico do Uno (MV:R) não gera eco de volta pela Serial', async () => {
      const sendCommandSpy = vi.spyOn(arduinoSerial, 'sendCommand').mockResolvedValue(undefined);
      vi.spyOn(arduinoSerial, 'isConnected').mockReturnValue(true);

      let lineCallback: ((line: string) => void) | undefined;
      vi.spyOn(arduinoSerial, 'onLine').mockImplementation((cb) => {
        lineCallback = cb;
        return () => { };
      });

      const { LEVELS } = await import('../../game/levels');
      const { GameScreen } = await import('../GameScreen/GameScreen');

      render(
        <ArduinoProvider initialStatus="connected">
          <GameScreen
            level={LEVELS[0]}
            levelNumber={1}
            totalLevels={12}
            completedCount={0}
            hasNextLevel={true}
            getProgress={() => mockProgress}
            recordCompletion={() => { }}
            getRankings={() => ({ byTime: [], byMoves: [] })}
            onBackToLevels={() => { }}
            onNextLevel={() => { }}
          />
        </ArduinoProvider>,
      );

      sendCommandSpy.mockClear();

      // Simula linha recebida do botão físico do Arduino
      await act(async () => {
        lineCallback?.('MV:R');
      });

      // Não deve ter reenviado nenhum comando MV:R
      expect(sendCommandSpy).not.toHaveBeenCalled();
    });
  });
});