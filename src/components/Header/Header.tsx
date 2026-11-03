import './Header.css';

interface HeaderProps {
  completedCount: number;
  totalLevels: number;
  onOpenLevels?: () => void;
  showLevelsButton?: boolean;
}

export function Header({ completedCount, totalLevels, onOpenLevels, showLevelsButton = true }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__title">SOKOBAN</span>
      </div>
      <div className="app-header__actions">
        <span className="app-header__progress">
          {completedCount}/{totalLevels} concluídos
        </span>
        {showLevelsButton && (
          <button type="button" className="btn btn--ghost-inverse" onClick={onOpenLevels}>
            Níveis
          </button>
        )}
      </div>
    </header>
  );
}
