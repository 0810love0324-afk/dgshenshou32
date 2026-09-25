export type BeadResult = '莊' | '閒' | '和';

export type BeadCell = {
  result: BeadResult;
  bankerPair: boolean;
  playerPair: boolean;
  lucky6: boolean;
  point: number | null;
  rawCode: number;
};

export type PairSide = 'player' | 'banker';
export type PairZone = 'near' | 'extension' | null;

export type PairProbability = {
  probability: 25 | 7 | null;
  zone: PairZone;
  pairCount: number;
  sourceIndex: number | null;
  nextIndex: number;
  nextRow: number;
  nextCol: number;
};

export const BEAD_ROWS = 6;

function pointOf(index: number) {
  return { row: index % BEAD_ROWS, col: Math.floor(index / BEAD_ROWS) };
}

function hasPair(cell: BeadCell, side: PairSide) {
  return side === 'player' ? !!cell.playerPair : !!cell.bankerPair;
}

function samePoint(a: { row: number; col: number }, b: { row: number; col: number }) {
  return a.row === b.row && a.col === b.col;
}

/**
 * User-defined pair hot-zone rule.
 *
 * Bead plate chronology is top-to-bottom (6 rows), then continues in the next
 * column to the right.  For a historical pair at P:
 *   25%: down, right-up, right, right-down (only future / in-bounds cells)
 *   7%: continue farther down the same column or farther right on the same row
 *
 * If more than one historical pair covers the same future cell, the displayed
 * rule value is the highest matching value (25 overrides 7); percentages are
 * not added together.
 */
export function pairProbabilityForNext(beads: BeadCell[], side: PairSide): PairProbability {
  const nextIndex = beads.length;
  const next = pointOf(nextIndex);
  let best: 25 | 7 | null = null;
  let zone: PairZone = null;
  let sourceIndex: number | null = null;
  let pairCount = 0;

  for (let i = 0; i < beads.length; i += 1) {
    const cell = beads[i]!;
    if (!hasPair(cell, side)) continue;
    pairCount += 1;
    const origin = pointOf(i);

    const near: { row: number; col: number }[] = [];
    if (origin.row + 1 < BEAD_ROWS) near.push({ row: origin.row + 1, col: origin.col });
    if (origin.row - 1 >= 0) near.push({ row: origin.row - 1, col: origin.col + 1 });
    near.push({ row: origin.row, col: origin.col + 1 });
    if (origin.row + 1 < BEAD_ROWS) near.push({ row: origin.row + 1, col: origin.col + 1 });

    if (near.some(p => samePoint(p, next))) {
      best = 25;
      zone = 'near';
      sourceIndex = i;
      continue;
    }

    if (best === 25) continue;

    const verticalExtension = next.col === origin.col && next.row >= origin.row + 2;
    const horizontalExtension = next.row === origin.row && next.col >= origin.col + 2;
    if (verticalExtension || horizontalExtension) {
      best = 7;
      zone = 'extension';
      sourceIndex = i;
    }
  }

  return { probability: best, zone, pairCount, sourceIndex, nextIndex, nextRow: next.row, nextCol: next.col };
}

export function validateBeadSequence(beads: BeadCell[] | undefined, resultsLength: number) {
  if (!Array.isArray(beads)) return false;
  if (beads.length !== resultsLength) return false;
  return beads.every(cell =>
    !!cell &&
    (cell.result === '莊' || cell.result === '閒' || cell.result === '和') &&
    typeof cell.bankerPair === 'boolean' &&
    typeof cell.playerPair === 'boolean' &&
    typeof cell.lucky6 === 'boolean' &&
    Number.isInteger(cell.rawCode) && cell.rawCode >= 1 && cell.rawCode <= 12
  );
}


export type PairRecommendation = {
  bankerCount: number;
  playerCount: number;
  recommendation: '莊對' | '閒對' | null;
};

/**
 * User-defined recommendation rule for the next bead cell.
 * Count pair markers already opened on the same row (to the left) and the same
 * column (above) as the next bead cell.  Red/banker-pair markers vote for 莊對;
 * blue/player-pair markers vote for 閒對.  A tie yields no recommendation.
 */
export function pairRecommendationForNext(beads: BeadCell[]): PairRecommendation {
  const next = pointOf(beads.length);
  let bankerCount = 0;
  let playerCount = 0;

  for (let i = 0; i < beads.length; i += 1) {
    const cell = beads[i]!;
    const point = pointOf(i);
    if (point.row !== next.row && point.col !== next.col) continue;
    if (cell.bankerPair) bankerCount += 1;
    if (cell.playerPair) playerCount += 1;
  }

  const recommendation = bankerCount > playerCount
    ? '莊對'
    : playerCount > bankerCount
      ? '閒對'
      : null;

  return { bankerCount, playerCount, recommendation };
}

export type TieRecommendation = {
  consecutiveTies: number;
  recommendation: '和' | null;
};

/**
 * User-defined "三合院" live recommendation rule.
 * When the latest two or more bead results are consecutive ties, recommend
 * betting 和 for the next round.  The value is recalculated from the selected
 * room's live bead plate on every update; otherwise no recommendation is shown.
 */
export function tieRecommendationForNext(beads: BeadCell[]): TieRecommendation {
  let consecutiveTies = 0;
  for (let i = beads.length - 1; i >= 0; i -= 1) {
    if (beads[i]!.result !== '和') break;
    consecutiveTies += 1;
  }
  return {
    consecutiveTies,
    recommendation: consecutiveTies >= 2 ? '和' : null,
  };
}

