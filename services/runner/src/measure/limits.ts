/** Limites d'exécution (T086, FR-027). */
export interface ExecutionLimits {
  wallTimeMs: number;
  cpuTimeMs: number;
  memoryMb: number;
  pidsMax: number;
  outputBytes: number;
}

export const DEFAULT_LIMITS: ExecutionLimits = {
  wallTimeMs: 10_000,
  cpuTimeMs: 5_000,
  memoryMb: 512,
  pidsMax: 64,
  outputBytes: 1_048_576
};

const BOUNDS: Record<keyof ExecutionLimits, readonly [number, number]> = {
  wallTimeMs: [100, 60_000],
  cpuTimeMs: [50, 30_000],
  memoryMb: [64, 4_096],
  pidsMax: [8, 1_024],
  outputBytes: [1_024, 16_777_216]
};

function clamp(value: number, [min, max]: readonly [number, number]): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/** Ramène toute demande de limite dans le domaine sûr du runner. */
export function normalizeLimits(limits: Partial<ExecutionLimits> | undefined): ExecutionLimits {
  const merged = { ...DEFAULT_LIMITS, ...limits };
  return {
    wallTimeMs: clamp(merged.wallTimeMs, BOUNDS.wallTimeMs),
    cpuTimeMs: clamp(merged.cpuTimeMs, BOUNDS.cpuTimeMs),
    memoryMb: clamp(merged.memoryMb, BOUNDS.memoryMb),
    pidsMax: clamp(merged.pidsMax, BOUNDS.pidsMax),
    outputBytes: clamp(merged.outputBytes, BOUNDS.outputBytes)
  };
}
