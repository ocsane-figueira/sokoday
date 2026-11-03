import { useState } from 'react';
import { LEVELS } from './game/levels';
import type { LevelDefinition } from './game/types';
import { useRecords } from './hooks/useRecords';
import { ArduinoProvider } from './context/ArduinoContext';
import { useArduino } from './context/useArduino';
import { LevelSelect } from './components/LevelSelect/LevelSelect';
import { GameScreen } from './components/GameScreen/GameScreen';

type Screen =
  | { name: 'select' }
  | { name: 'game'; levelIndex: number; levelList: LevelDefinition[] };

function AppContent() {
  const [screen, setScreen] = useState<Screen>({ name: 'select' });
  const { getProgress, recordCompletion, getRankings, completedCount } = useRecords();
  const { status, sendLevelToUno, setLevelOnUno } = useArduino();

  if (screen.name === 'select') {
    return (
      <LevelSelect
        getProgress={getProgress}
        onSelectLevel={(index, list) =>
          setScreen({ name: 'game', levelIndex: index, levelList: list })
        }
      />
    );
  }

  const currentList = screen.levelList ?? LEVELS;
  const level = currentList[screen.levelIndex] ?? LEVELS[0];
  const hasNextLevel = screen.levelIndex < currentList.length - 1;

  const handleNextLevel = () => {
    if (!hasNextLevel) return;
    const nextIndex = screen.levelIndex + 1;
    const nextLevel = currentList[nextIndex];

    if (status === 'connected') {
      if (nextLevel.id.startsWith('UNO:')) {
        setLevelOnUno(nextIndex + 1);
      } else {
        sendLevelToUno(nextLevel);
      }
    }

    setScreen({
      name: 'game',
      levelIndex: nextIndex,
      levelList: currentList,
    });
  };

  return (
    <GameScreen
      key={level.id}
      level={level}
      levelNumber={screen.levelIndex + 1}
      totalLevels={currentList.length}
      completedCount={completedCount}
      hasNextLevel={hasNextLevel}
      getProgress={getProgress}
      recordCompletion={recordCompletion}
      getRankings={getRankings}
      onBackToLevels={() => setScreen({ name: 'select' })}
      onNextLevel={handleNextLevel}
    />
  );
}

export function App() {
  return (
    <ArduinoProvider>
      <AppContent />
    </ArduinoProvider>
  );
}

export default App;
