export interface BoardSizingInput {
  availableWidth: number;
  availableHeight: number;
  columns: number;
  rows: number;
  padding: number;
  maxCellSize?: number;
}

export interface BoardSizing {
  cellSize: number;
  gap: number;
}

const DEFAULT_MAX_CELL_SIZE = 44;

/**
 * Calcula o maior tamanho de célula que mantém todas as colunas e linhas dentro
 * do contêiner. O gap diminui junto com as células para mapas muito compactos,
 * evitando que o espaçamento consuma toda a área útil.
 */
export function calculateBoardSizing({
  availableWidth,
  availableHeight,
  columns,
  rows,
  padding,
  maxCellSize = DEFAULT_MAX_CELL_SIZE,
}: BoardSizingInput): BoardSizing {
  const safeColumns = Math.max(1, columns);
  const safeRows = Math.max(1, rows);
  const safeWidth = Math.max(0, availableWidth);
  const safeHeight = Math.max(0, availableHeight);
  const safePadding = Math.max(0, padding);
  const safeMaxCellSize = Math.max(1, maxCellSize);

  let gap = 2;
  let cellSize = calculateCellSize({
    availableWidth: safeWidth,
    availableHeight: safeHeight,
    columns: safeColumns,
    rows: safeRows,
    padding: safePadding,
    gap,
    maxCellSize: safeMaxCellSize,
  });

  // Abaixo de 32px, um gap de 2px ocupa uma fração grande da célula; reduzir
  // o espaçamento libera pixels para o mapa sem alterar sua escala relativa.
  if (cellSize < 32) {
    gap = 1;
    cellSize = calculateCellSize({
      availableWidth: safeWidth,
      availableHeight: safeHeight,
      columns: safeColumns,
      rows: safeRows,
      padding: safePadding,
      gap,
      maxCellSize: safeMaxCellSize,
    });
  }

  // Para mapas extremamente grandes, não há espaço útil para separar as células.
  if (cellSize < 16) {
    gap = 0;
    cellSize = calculateCellSize({
      availableWidth: safeWidth,
      availableHeight: safeHeight,
      columns: safeColumns,
      rows: safeRows,
      padding: safePadding,
      gap,
      maxCellSize: safeMaxCellSize,
    });
  }

  return { cellSize: Math.max(1, cellSize), gap };
}

function calculateCellSize({
  availableWidth,
  availableHeight,
  columns,
  rows,
  padding,
  gap,
  maxCellSize,
}: Omit<BoardSizingInput, 'maxCellSize'> & { gap: number; maxCellSize: number }): number {
  const widthSpace = availableWidth - padding * 2 - gap * (columns - 1);
  const heightSpace = availableHeight - padding * 2 - gap * (rows - 1);
  const widthCellSize = Math.floor(widthSpace / columns);
  const heightCellSize = Math.floor(heightSpace / rows);

  return Math.min(maxCellSize, widthCellSize, heightCellSize);
}
