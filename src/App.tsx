import { useState } from 'react';
import { LEVELS } from './game/levels';
import { useRecords } from './hooks/useRecords';
import { LevelSelect } from './components/LevelSelect/LevelSelect.tsx';
import { GameScreen } from './components/GameScreen/GameScreen.tsx';

type Screen = { name: 'select' } | { name: 'game'; levelIndex: number };

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'select' });
  const { getProgress, recordCompletion, getRankings, completedCount } = useRecords();

  if (screen.name === 'select') {
    return (
      <LevelSelect
        getProgress={getProgress}
        completedCount={completedCount}
        onSelectLevel={(index) => setScreen({ name: 'game', levelIndex: index })}
      />
    );
  }

  const level = LEVELS[screen.levelIndex];
  const hasNextLevel = screen.levelIndex < LEVELS.length - 1;

  return (
    <GameScreen
      key={level.id}
      level={level}
      levelNumber={screen.levelIndex + 1}
      totalLevels={LEVELS.length}
      completedCount={completedCount}
      hasNextLevel={hasNextLevel}
      getProgress={getProgress}
      recordCompletion={recordCompletion}
      getRankings={getRankings}
      onBackToLevels={() => setScreen({ name: 'select' })}
      onNextLevel={() =>
        setScreen((prev) =>
          prev.name === 'game' && prev.levelIndex < LEVELS.length - 1
            ? { name: 'game', levelIndex: prev.levelIndex + 1 }
            : prev,
        )
      }
    />
  );
}

export default App;
