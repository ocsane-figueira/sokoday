import type { Direction, LevelDefinition } from '../game/types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type GameEvent =
  | { type: 'move'; direction: Direction }
  | { type: 'undo' }
  | { type: 'reset' }
  | { type: 'win'; source: string; id: string };

export type GameEventListener = (event: GameEvent) => void;

export interface ArduinoContextValue {
  status: ConnectionStatus;
  error: string | null;
  activeSource: 'NATIVE' | 'CUSTOM' | null;
  activeLevelId: string | null;
  unoMoves: number;
  arduinoLevels: LevelDefinition[];
  isLoadingLevels: boolean;
  isSupported: boolean;

  connectDevice: () => Promise<void>;
  disconnectDevice: () => Promise<void>;
  syncDevice: () => Promise<void>;
  fetchArduinoNativeLevels: () => Promise<LevelDefinition[]>;
  sendLevelToUno: (level: LevelDefinition) => Promise<boolean>;
  setLevelOnUno: (levelId: number | 'CUSTOM') => Promise<void>;
  notifyMove: (dir: Direction) => Promise<void>;
  notifyUndo: () => Promise<void>;
  notifyReset: () => Promise<void>;
  subscribeToGameEvents: (listener: GameEventListener) => () => void;
}

