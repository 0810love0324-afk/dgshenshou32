export type AssistResult = '莊' | '閒' | '和';

type Side = '莊' | '閒';
type Run = { side: Side; length: number };

function roadSides(results: AssistResult[]): Side[] {
  // Baccarat ties are attached to the current Big Road mark, so they do not
  // create a new banker/player column and do not advance these pattern rules.
  return results.filter((r): r is Side => r === '莊' || r === '閒');
}

function columnRuns(results: AssistResult[]): Run[] {
  const runs: Run[] = [];
  for (const side of roadSides(results)) {
    const last = runs[runs.length - 1];
    if (last?.side === side) last.length += 1;
    else runs.push({ side, length: 1 });
  }
  return runs;
}

function opposite(side: Side): Side {
  return side === '莊' ? '閒' : '莊';
}

/**
 * 1房2廳 / 2房1廳
 * Minimum trigger: five cards, i.e. complete run lengths 2-1-2.
 * Once established, continue the 2-1-2-1-2... rhythm. The final run may be
 * the first card of a target length-2 run, in which case recommend the same
 * side one more time to complete that run.
 */
function oneTwoRecommendation(runs: Run[]): Side | null {
  if (runs.length < 3) return null;

  // Completed ...2-1-2 -> next column is a single card on the opposite side.
  const a = runs.slice(-3);
  if (a[0]?.length === 2 && a[1]?.length === 1 && a[2]?.length === 2) {
    return opposite(a[2].side);
  }

  if (runs.length >= 4) {
    const b = runs.slice(-4);
    // ...2-1-2-1 -> next column starts a target length-2 run.
    if (b[0]?.length === 2 && b[1]?.length === 1 && b[2]?.length === 2 && b[3]?.length === 1) {
      return opposite(b[3].side);
    }
  }

  if (runs.length >= 5) {
    const c = runs.slice(-5);
    // ...2-1-2-1-1 -> first card of the target length-2 run was correct;
    // recommend the same side again to finish the pair.
    if (
      c[0]?.length === 2 && c[1]?.length === 1 && c[2]?.length === 2 &&
      c[3]?.length === 1 && c[4]?.length === 1
    ) {
      return c[4].side;
    }
  }

  return null;
}

/**
 * 單跳
 * Minimum trigger: three consecutive banker/player cards alternating.
 * Example: 莊-閒-莊 -> recommend 閒; 閒-莊-閒 -> recommend 莊.
 */
function singleJumpRecommendation(runs: Run[]): Side | null {
  if (runs.length < 3) return null;
  const tail = runs.slice(-3);
  if (tail.every(r => r.length === 1)) return opposite(tail[2]!.side);
  return null;
}

/**
 * 雙跳
 * Minimum trigger: four cards, i.e. two complete columns of height 2.
 * Example: 2閒-2莊 -> recommend 閒. If the first 閒 arrives, the road becomes
 * ...2-2-1 and the next recommendation remains 閒 to complete 2閒.
 */
function doubleJumpRecommendation(runs: Run[]): Side | null {
  if (runs.length >= 2) {
    const full = runs.slice(-2);
    if (full[0]?.length === 2 && full[1]?.length === 2) {
      return opposite(full[1].side);
    }
  }
  if (runs.length >= 3) {
    const partial = runs.slice(-3);
    if (partial[0]?.length === 2 && partial[1]?.length === 2 && partial[2]?.length === 1) {
      return partial[2].side;
    }
  }
  return null;
}

/**
 * 齊頭
 * No fixed height. Compare the current Big Road column with the immediately
 * previous column. If the new/current column is shorter, keep recommending the
 * current side until it reaches the previous column's height.
 *
 * More specific rhythms (1房2廳/2房1廳, 單跳, 雙跳) are checked first so a
 * recognized rhythm is not overwritten by this generic height-fill rule.
 */
function alignedHeadRecommendation(runs: Run[]): Side | null {
  if (runs.length < 2) return null;
  const current = runs[runs.length - 1]!;
  const previous = runs[runs.length - 2]!;
  if (current.length < previous.length) return current.side;
  return null;
}

function stableRandomSide(results: AssistResult[], roomKey: string): Side {
  // Keep the fallback stable while the same road is on screen so countdown /
  // other live table updates do not make the recommendation flicker. It changes
  // when the banker/player Big Road sequence changes and is salted per room.
  const seq = roadSides(results).join('|');
  const input = `${roomKey}|${seq}|${roadSides(results).length}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash & 1) === 0 ? '莊' : '閒';
}

export type RecommendationDetail = {
  side: Side | '—';
  mode: 'logic' | 'random' | 'waiting';
  pattern: '1房2廳/2房1廳' | '單跳' | '雙跳' | '齊頭' | null;
};

/**
 * Main floating-panel recommendation.
 *
 * Every room calls this with that room's own live Big Road results. On every
 * road update we re-evaluate from the newest data. If one of the user's rules
 * is currently valid, it owns the recommendation. If a prior logical call was
 * broken by the actual next result, that road shape normally stops matching;
 * the recommendation therefore falls back to banker/player random output until
 * a newly valid shape appears again.
 */
export function recommendationDetail(results: AssistResult[], roomKey = ''): RecommendationDetail {
  const seq = roadSides(results);
  if (!seq.length) return { side: '—', mode: 'waiting', pattern: null };

  const runs = columnRuns(results);

  // Specific recurring rhythms take precedence over the generic 齊頭 rule.
  const oneTwo = oneTwoRecommendation(runs);
  if (oneTwo) return { side: oneTwo, mode: 'logic', pattern: '1房2廳/2房1廳' };

  const single = singleJumpRecommendation(runs);
  if (single) return { side: single, mode: 'logic', pattern: '單跳' };

  const double = doubleJumpRecommendation(runs);
  if (double) return { side: double, mode: 'logic', pattern: '雙跳' };

  const aligned = alignedHeadRecommendation(runs);
  if (aligned) return { side: aligned, mode: 'logic', pattern: '齊頭' };

  return { side: stableRandomSide(results, roomKey), mode: 'random', pattern: null };
}

export function recommendSide(results: AssistResult[], roomKey = ''): Side | '—' {
  return recommendationDetail(results, roomKey).side;
}
