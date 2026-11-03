import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Direction, LevelDefinition } from '../game/types';
import {
  DEFAULT_ARDUINO_LEVELS,
  directionToUno,
  extractNumericLevelId,
  formatLevelForUno,
  parseArduinoMapToLevel,
  unoToDirection,
} from '../game/arduinoLevelAdapter';
import {
  arduinoSerial,
  isWebSerialSupported,
} from '../services/arduinoSerial';
import { ArduinoContext } from './arduinoContextDefinition';
import type {
  ArduinoContextValue,
  ConnectionStatus,
  GameEvent,
  GameEventListener,
} from './arduinoContextTypes';

export function ArduinoProvider({
  children,
  initialStatus,
}: {
  children: ReactNode;
  initialStatus?: ConnectionStatus;
}) {
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus ?? 'disconnected');
  const [error, setError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<'NATIVE' | 'CUSTOM' | null>(null);
  const [activeLevelId, setActiveLevelId] = useState<string | null>(null);
  const [unoMoves, setUnoMoves] = useState<number>(0);
  const [arduinoLevels, setArduinoLevels] = useState<LevelDefinition[]>(DEFAULT_ARDUINO_LEVELS);
  const [isLoadingLevels, setIsLoadingLevels] = useState<boolean>(false);
  const isSupported = isWebSerialSupported();

  const gameEventListenersRef = useRef<Set<GameEventListener>>(new Set());
  const mapCollectingRef = useRef<{ id: number; rows: string[] } | null>(null);
  const pendingMapResolversRef = useRef<
    Map<number, { resolve: (lvl: LevelDefinition) => void; reject: (err: Error) => void }>
  >(new Map());

  const dispatchGameEvent = useCallback((event: GameEvent) => {
    for (const listener of gameEventListenersRef.current) {
      try {
        listener(event);
      } catch (err) {
        console.error('Erro no ouvinte de evento do jogo:', err);
      }
    }
  }, []);

  const handleSerialLine = useCallback(
    (line: string) => {
      // Ignora linhas de depuração informativa
      if (line.startsWith('INFO:')) {
        return;
      }

      // SYNC:<origem>,<id>,<movimentos>
      if (line.startsWith('SYNC:')) {
        const parts = line.slice(5).split(',');
        const origin = parts[0] === 'CUSTOM' ? 'CUSTOM' : 'NATIVE';
        const id = parts[1] || '1';
        const moves = parseInt(parts[2] || '0', 10);
        setActiveSource(origin);
        setActiveLevelId(id);
        setUnoMoves(Number.isNaN(moves) ? 0 : moves);
        return;
      }

      // MAP_START:<origem>,<id>
      if (line.startsWith('MAP_START:')) {
        const parts = line.slice(10).split(',');
        const id = parseInt(parts[1] || '1', 10);
        mapCollectingRef.current = { id: Number.isNaN(id) ? 1 : id, rows: [] };
        return;
      }

      // MAP_ROW:<y>,<8 chars>
      if (line.startsWith('MAP_ROW:')) {
        if (!mapCollectingRef.current) return;
        const commaIndex = line.indexOf(',');
        if (commaIndex > 8) {
          const y = parseInt(line.slice(8, commaIndex), 10);
          const rowContent = line.slice(commaIndex + 1);
          if (!Number.isNaN(y) && y >= 0 && y < 8) {
            mapCollectingRef.current.rows[y] = rowContent;
          }
        }
        return;
      }

      // MAP_END
      if (line === 'MAP_END') {
        if (mapCollectingRef.current && mapCollectingRef.current.rows.length > 0) {
          const { id, rows } = mapCollectingRef.current;
          const level = parseArduinoMapToLevel(id, rows);

          setArduinoLevels((prev) => {
            const next = [...prev];
            const index = next.findIndex((l) => l.id === level.id);
            if (index !== -1) {
              next[index] = level;
            } else {
              next.push(level);
            }
            return next;
          });

          const pending = pendingMapResolversRef.current.get(id);
          if (pending) {
            pending.resolve(level);
            pendingMapResolversRef.current.delete(id);
          }
        }
        mapCollectingRef.current = null;
        return;
      }

      // Movimentos recebidos do hardware (botão físico)
      if (line.startsWith('MV:')) {
        const dirCode = line.slice(3).trim();
        const dir = unoToDirection(dirCode);
        if (dir) {
          setUnoMoves((prev) => prev + 1);
          dispatchGameEvent({ type: 'move', direction: dir });
        }
        return;
      }

      // Undo físico (CIMA+BAIXO por 1s/3s)
      if (line === 'CMD:UNDO') {
        setUnoMoves((prev) => Math.max(0, prev - 1));
        dispatchGameEvent({ type: 'undo' });
        return;
      }

      // Reset físico (CIMA por 3s/5s)
      if (line === 'CMD:RESET') {
        setUnoMoves(0);
        dispatchGameEvent({ type: 'reset' });
        return;
      }

      // Vitória no Uno
      if (line.startsWith('WIN:')) {
        const parts = line.slice(4).split(',');
        dispatchGameEvent({
          type: 'win',
          source: parts[0] || 'NATIVE',
          id: parts[1] || '1',
        });
        return;
      }
    },
    [dispatchGameEvent],
  );

  useEffect(() => {
    const unsubLine = arduinoSerial.onLine(handleSerialLine);
    const unsubDisconnect = arduinoSerial.onDisconnect(() => {
      setStatus('disconnected');
      setActiveSource(null);
      setActiveLevelId(null);
    });

    return () => {
      unsubLine();
      unsubDisconnect();
    };
  }, [handleSerialLine]);

  const connectDevice = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      await arduinoSerial.connect();
      setStatus('connected');
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : 'Falha ao conectar ao Arduino.';
      // Não exibe erro se o usuário simplesmente cancelou o diálogo de seleção de porta
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        setStatus('disconnected');
        return;
      }
      setError(msg);
      throw err;
    }
  }, []);

  const disconnectDevice = useCallback(async () => {
    try {
      await arduinoSerial.disconnect();
    } finally {
      setStatus('disconnected');
      setActiveSource(null);
      setActiveLevelId(null);
    }
  }, []);

  const syncDevice = useCallback(async () => {
    if (arduinoSerial.isConnected()) {
      await arduinoSerial.sendCommand('SYNC');
    }
  }, []);

  const fetchSingleMap = useCallback((id: number): Promise<LevelDefinition> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingMapResolversRef.current.delete(id);
        // Em caso de timeout, usa a definição padrão nativa
        const fallback = DEFAULT_ARDUINO_LEVELS[id - 1] ?? {
          id: `UNO:${id}`,
          name: `Arduino Fase ${id}`,
          rows: Array(8).fill('########'),
        };
        resolve(fallback);
      }, 2000);

      pendingMapResolversRef.current.set(id, {
        resolve: (lvl) => {
          clearTimeout(timer);
          resolve(lvl);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      arduinoSerial.sendCommand(`GET_MAP:${id}`).catch((err) => {
        clearTimeout(timer);
        pendingMapResolversRef.current.delete(id);
        reject(err);
      });
    });
  }, []);

  const fetchArduinoNativeLevels = useCallback(async (): Promise<LevelDefinition[]> => {
    if (!arduinoSerial.isConnected()) {
      throw new Error('Arduino Uno não está conectado.');
    }
    setIsLoadingLevels(true);
    const fetched: LevelDefinition[] = [];
    try {
      for (let id = 1; id <= 4; id++) {
        const level = await fetchSingleMap(id);
        fetched.push(level);
      }
      setArduinoLevels(fetched);
      return fetched;
    } finally {
      setIsLoadingLevels(false);
    }
  }, [fetchSingleMap]);

  const sendLevelToUno = useCallback(async (level: LevelDefinition): Promise<boolean> => {
    if (!arduinoSerial.isConnected()) {
      return false;
    }
    try {
      const rows = formatLevelForUno(level);
      const numericId = extractNumericLevelId(level.id);
      await arduinoSerial.sendMap(numericId, rows);
      setActiveSource('CUSTOM');
      setActiveLevelId(String(numericId));
      setUnoMoves(0);
      return true;
    } catch (err) {
      console.error('Erro ao enviar nível para o Arduino Uno:', err);
      return false;
    }
  }, []);

  const setLevelOnUno = useCallback(async (levelId: number | 'CUSTOM') => {
    if (!arduinoSerial.isConnected()) return;
    await arduinoSerial.sendCommand(`SET_LEVEL:${levelId}`);
    if (levelId === 'CUSTOM') {
      setActiveSource('CUSTOM');
    } else {
      setActiveSource('NATIVE');
      setActiveLevelId(String(levelId));
    }
    setUnoMoves(0);
  }, []);

  const notifyMove = useCallback(async (dir: Direction) => {
    if (!arduinoSerial.isConnected()) return;
    const unoDir = directionToUno(dir);
    await arduinoSerial.sendCommand(`MV:${unoDir}`);
    setUnoMoves((prev) => prev + 1);
  }, []);

  const notifyUndo = useCallback(async () => {
    if (!arduinoSerial.isConnected()) return;
    await arduinoSerial.sendCommand('UNDO');
    setUnoMoves((prev) => Math.max(0, prev - 1));
  }, []);

  const notifyReset = useCallback(async () => {
    if (!arduinoSerial.isConnected()) return;
    await arduinoSerial.sendCommand('RESET');
    setUnoMoves(0);
  }, []);

  const subscribeToGameEvents = useCallback((listener: GameEventListener) => {
    gameEventListenersRef.current.add(listener);
    return () => {
      gameEventListenersRef.current.delete(listener);
    };
  }, []);

  const value: ArduinoContextValue = {
    status,
    error,
    activeSource,
    activeLevelId,
    unoMoves,
    arduinoLevels,
    isLoadingLevels,
    isSupported,
    connectDevice,
    disconnectDevice,
    syncDevice,
    fetchArduinoNativeLevels,
    sendLevelToUno,
    setLevelOnUno,
    notifyMove,
    notifyUndo,
    notifyReset,
    subscribeToGameEvents,
  };

  return <ArduinoContext.Provider value={value}>{children}</ArduinoContext.Provider>;
}
