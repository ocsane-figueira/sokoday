import { useContext } from 'react';
import { ArduinoContext } from './arduinoContextDefinition';
import type { ArduinoContextValue } from './arduinoContextTypes';

export function useArduino(): ArduinoContextValue {
  const context = useContext(ArduinoContext);
  if (!context) {
    throw new Error('useArduino deve ser utilizado dentro de um ArduinoProvider.');
  }
  return context;
}
