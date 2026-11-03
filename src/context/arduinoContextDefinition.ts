import { createContext } from 'react';
import type { ArduinoContextValue } from './arduinoContextTypes';

export const ArduinoContext = createContext<ArduinoContextValue | null>(null);

