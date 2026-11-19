/**
 * Mesure CPU par cgroup v2 (T083, contrat §4).
 *
 * `cpu.stat` expose `usage_usec` ; le temps d'un run est le delta entre deux
 * lectures, arrondi à la milliseconde. Cinq runs sont exécutés, la médiane est
 * retenue et un écart-type supérieur à 20 % déclenche un run de confirmation
 * (plafond 7).
 */
export interface CpuMeasurement {
  cpuTimesMs: number[];
  cpuTimeMedianMs: number;
  cpuTimeStdDevMs: number;
  runs: number;
}

export function parseUsageUsec(cpuStat: string): number {
  const line = cpuStat.split(/\r?\n/).find((entry) => entry.trim().startsWith('usage_usec'));
  if (!line) throw new Error('cpu.stat ne contient pas usage_usec');
  const value = Number(line.split(/\s+/)[1]);
  if (!Number.isFinite(value)) throw new Error('usage_usec illisible');
  return value;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Exécute `runs` mesures et ajoute jusqu'à 2 confirmations si la dispersion
 * dépasse 20 % de la médiane.
 */
export async function measureCpu(
  execute: () => Promise<number>,
  runs = 5,
  maxRuns = 7,
  seedTimes: readonly number[] = []
): Promise<CpuMeasurement> {
  const times: number[] = seedTimes.map((value) => Math.round(value));
  while (times.length < runs) {
    times.push(Math.round(await execute()));
  }

  let currentMedian = median(times);
  let deviation = standardDeviation(times);

  while (times.length < maxRuns && currentMedian > 0 && deviation > currentMedian * 0.2) {
    times.push(Math.round(await execute()));
    currentMedian = median(times);
    deviation = standardDeviation(times);
  }

  return {
    cpuTimesMs: times,
    cpuTimeMedianMs: Math.round(currentMedian),
    cpuTimeStdDevMs: Math.round(deviation * 100) / 100,
    runs: times.length
  };
}
