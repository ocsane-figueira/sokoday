import { useArduino } from '../../context/useArduino';
import './Header.css';

interface HeaderProps {
  completedCount: number;
  totalLevels: number;
  onOpenLevels?: () => void;
  showLevelsButton?: boolean;
}

export function Header({ completedCount, totalLevels, onOpenLevels, showLevelsButton = true }: HeaderProps) {
  const { status, activeLevelId, isSupported, connectDevice, disconnectDevice } = useArduino();

  const handleConnect = async () => {
    try {
      await connectDevice();
    } catch {
      // Erro já tratado no contexto
    }
  };

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__title">SOKOBAN</span>
      </div>

      <div className="app-header__actions">
        {/* Integração Arduino Uno */}
        <div className="app-header__arduino">
          {status === 'connected' ? (
            <div className="arduino-status">
              <span className="arduino-badge arduino-badge--connected" title="Arduino Uno conectado via Web Serial">
                <span className="arduino-badge__dot" />
                Uno Conectado{activeLevelId ? ` (Fase ${activeLevelId})` : ''}
              </span>
              <button
                type="button"
                className="btn btn--ghost-inverse btn--sm"
                onClick={disconnectDevice}
                title="Desconectar do Arduino Uno"
              >
                Desconectar
              </button>
            </div>
          ) : status === 'connecting' ? (
            <span className="arduino-badge arduino-badge--connecting">
              <span className="arduino-badge__spinner" />
              Conectando Uno...
            </span>
          ) : (
            <button
              type="button"
              className="btn btn--outline-inverse btn--sm"
              onClick={handleConnect}
              disabled={!isSupported}
              title={
                !isSupported
                  ? 'Navegador incompatível com a Web Serial API (utilize Chrome, Edge ou Opera).'
                  : 'Conectar ao Arduino Uno via porta Serial USB'
              }
            >
              Conectar Uno
            </button>
          )}
        </div>

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
