import { useEffect } from 'react';
import type { LevelRecord } from '../../game/types.ts';
import { formatDate, formatMoves, formatTime } from '../../utils/format.ts';
import './Modal.css';

interface AnalysisModalProps {
  levelName: string;
  history: LevelRecord[];
  onBackToRanking: () => void;
  onClose: () => void;
}

type Metric = 'moves' | 'timeMs';

export function AnalysisModal({ levelName, history, onBackToRanking, onClose }: AnalysisModalProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.key.toLowerCase() !== 'escape') return;

      event.preventDefault();
      onBackToRanking();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBackToRanking]);

  const chronological = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const chartRecords = chronological.slice(-10);
  const chartStartIndex = chronological.length - chartRecords.length;
  const last = chronological.at(-1);
  const first = chronological[0];
  const previous = chronological.at(-2);
  const bestMoves = Math.min(...chronological.map((record) => record.moves));
  const bestTimeMs = Math.min(...chronological.map((record) => record.timeMs));
  const averageMoves = chronological.reduce((sum, record) => sum + record.moves, 0) / chronological.length;
  const averageTimeMs = chronological.reduce((sum, record) => sum + record.timeMs, 0) / chronological.length;

  return (
    <div className="modal-overlay">
      <div className="modal modal--analysis" role="dialog" aria-modal="true" aria-labelledby="analysis-modal-title">
        <p className="modal__eyebrow">Análise de evolução</p>
        <h2 id="analysis-modal-title" className="modal__title">
          {levelName}
        </h2>

        {chronological.length === 0 ? (
          <div className="analysis-empty">
            <p>Você ainda não concluiu este nível.</p>
            <p>Complete uma partida para começar a acompanhar sua evolução.</p>
          </div>
        ) : (
          <>
            <div className="analysis-summary">
              <AnalysisCard label="Tentativas" value={String(chronological.length)} />
              <AnalysisCard label="Melhor movimento" value={`${formatMoves(bestMoves)} mov.`} />
              <AnalysisCard label="Melhor tempo" value={formatTime(bestTimeMs)} />
              <AnalysisCard label="Média de movimentos" value={`${formatAverage(averageMoves)} mov.`} />
              <AnalysisCard label="Média de tempo" value={formatTime(averageTimeMs)} />
              <AnalysisCard
                label="Última tentativa"
                value={`${formatMoves(last!.moves)} mov. · ${formatTime(last!.timeMs)}`}
              />
            </div>

            <div className="analysis-charts">
              <MetricChart
                title="Movimentos por tentativa"
                records={chartRecords}
                metric="moves"
                startIndex={chartStartIndex}
              />
              <MetricChart
                title="Tempo por tentativa"
                records={chartRecords}
                metric="timeMs"
                startIndex={chartStartIndex}
              />
            </div>

            <div className="analysis-insights">
              <h3 className="analysis-section-title">Leitura do desempenho</h3>
              {previous ? (
                <>
                  <Insight metric="moves" current={last!.moves} previous={previous.moves} />
                  <Insight metric="timeMs" current={last!.timeMs} previous={previous.timeMs} />
                  <p className="analysis-insight">
                    Desde a primeira tentativa, você está{' '}
                    <strong>{describeChange(last!.moves <= first!.moves, last!.moves === first!.moves)}</strong> em
                    movimentos e <strong>{describeChange(last!.timeMs <= first!.timeMs, last!.timeMs === first!.timeMs)}</strong>{' '}
                    em tempo.
                  </p>
                </>
              ) : (
                <p className="analysis-insight">
                  Esta foi sua primeira tentativa concluída. Jogue novamente para comparar sua evolução.
                </p>
              )}
              <p className="analysis-insight analysis-insight--muted">
                Último registro: {formatDate(last!.date)}.
              </p>
            </div>
          </>
        )}

        <div className="modal__actions modal__actions--analysis">
          <button type="button" className="btn" onClick={onBackToRanking}>
            Voltar ao Ranking
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalysisCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="analysis-card">
      <span className="stat__label">{label}</span>
      <span className="analysis-card__value">{value}</span>
    </div>
  );
}

function MetricChart({
  title,
  records,
  metric,
  startIndex,
}: {
  title: string;
  records: LevelRecord[];
  metric: Metric;
  startIndex: number;
}) {
  const width = 600;
  const height = 190;
  const paddingX = 30;
  const paddingY = 28;
  const values = records.map((record) => record[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pointX = (index: number) =>
    records.length === 1
      ? width / 2
      : paddingX + (index * (width - paddingX * 2)) / (records.length - 1);
  const pointY = (value: number) => height - paddingY - ((value - min) / range) * (height - paddingY * 2);
  const points = records.map((record, index) => `${pointX(index)},${pointY(record[metric])}`).join(' ');

  return (
    <section className="analysis-chart" aria-label={title}>
      <h3 className="analysis-section-title">{title}</h3>
      <svg className="analysis-chart__svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} className="analysis-chart__axis" />
        <polyline points={points} className="analysis-chart__line" />
        {records.map((record, index) => (
          <g key={`${record.date}-${index}`}>
            <circle cx={pointX(index)} cy={pointY(record[metric])} r="5" className="analysis-chart__point" />
            <text x={pointX(index)} y={height - 8} textAnchor="middle" className="analysis-chart__label">
              {startIndex + index + 1}
            </text>
            <title>
              Tentativa {startIndex + index + 1}: {metric === 'moves' ? `${record.moves} movimentos` : formatTime(record.timeMs)}
            </title>
          </g>
        ))}
        <text x={paddingX} y={paddingY - 8} className="analysis-chart__value-label">
          {metric === 'moves' ? `${max} mov.` : formatTime(max)}
        </text>
        <text x={paddingX} y={height - paddingY - 8} className="analysis-chart__value-label">
          {metric === 'moves' ? `${min} mov.` : formatTime(min)}
        </text>
      </svg>
      {records.length < 2 && <p className="analysis-chart__hint">Mais uma tentativa criará uma tendência.</p>}
    </section>
  );
}

function Insight({ metric, current, previous }: { metric: Metric; current: number; previous: number }) {
  const difference = current - previous;
  const improved = difference < 0;
  const stable = difference === 0;
  const metricLabel = metric === 'moves' ? 'movimentos' : 'tempo';
  const value = metric === 'moves' ? `${Math.abs(difference)} mov.` : formatTime(Math.abs(difference));

  return (
    <p className={`analysis-insight analysis-insight--${stable ? 'stable' : improved ? 'improved' : 'worsened'}`}>
      {stable ? 'Desempenho estável' : improved ? 'Você melhorou' : 'Você piorou'} em {metricLabel} na última tentativa
      {stable ? '.' : ` (${value}).`}
    </p>
  );
}

function describeChange(isBetter: boolean, isEqual: boolean) {
  if (isEqual) return 'igual';
  return isBetter ? 'melhor' : 'pior';
}

function formatAverage(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}
