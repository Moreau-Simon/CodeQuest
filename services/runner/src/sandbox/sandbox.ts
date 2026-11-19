import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  javascriptHarness,
  parseHarnessOutput,
  pythonHarness,
  type HarnessResult
} from './harness';
import { normalizeLimits, type ExecutionLimits } from '../measure/limits';

export interface SandboxJob {
  submissionId: string;
  language: 'python' | 'javascript';
  code: string;
  limits: Partial<ExecutionLimits>;
  tests?: Array<{ input: unknown; expected: unknown }>;
}

export interface SandboxOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  cpuTimeMs: number;
  harness: HarnessResult | null;
}

export interface SandboxOptions {
  dockerPath?: string;
  runtime?: string;
  pythonImage?: string;
  nodeImage?: string;
  maxOutputBytes?: number;
  seccompProfile?: string;
}

interface ProcessOutcome {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Arguments Docker du bac à sable (T081, contrat §5). Pure fonction testée par
 * les tests d'évasion : réseau coupé, racine en lecture seule, capacités
 * retirées, seccomp et utilisateur non privilégié.
 */
export function buildDockerArgs(
  job: SandboxJob,
  workspace: string,
  containerName: string,
  options: SandboxOptions = {}
): string[] {
  const limits = normalizeLimits(job.limits);
  const image =
    job.language === 'python'
      ? (options.pythonImage ?? 'codequest/py312-runner:1.4.0')
      : (options.nodeImage ?? 'codequest/node20-runner:1.4.0');
  const command =
    job.language === 'python' ? ['python', '/work/harness.py'] : ['node', '/work/harness.js'];

  return [
    'create',
    '--name',
    containerName,
    `--runtime=${options.runtime ?? 'runsc'}`,
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    `--security-opt=seccomp=${options.seccompProfile ?? process.env.SECCOMP_PROFILE ?? 'infra/seccomp/runner.json'}`,
    '--user=10001:10001',
    `--pids-limit=${limits.pidsMax}`,
    `--memory=${limits.memoryMb}m`,
    '--cpus=1',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=64m',
    `--mount=type=bind,source=${workspace},target=/work,readonly`,
    '-w',
    '/work',
    image,
    ...command
  ];
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
  maxOutputBytes: number
): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutputBytes) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutputBytes) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        code: 127,
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut,
        durationMs: Date.now() - startedAt
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: stdout.slice(0, maxOutputBytes),
        stderr: stderr.slice(0, maxOutputBytes),
        timedOut,
        durationMs: Date.now() - startedAt
      });
    });
  });
}

/**
 * Lecture best-effort du cgroup v2 **du conteneur sandboxé** (T083).
 *
 * Ne jamais retomber sur `/sys/fs/cgroup/cpu.stat` : ce chemin désigne le cgroup
 * de l'hôte (ou du runner lui-même) et mesurerait le CPU de la machine au lieu de
 * celui du code soumis — ce qui fausserait le score (principe III). Si aucun
 * chemin lié au conteneur n'existe, retourner `null` : l'appelant utilise alors
 * la durée murale comme repli explicite.
 */
export function readCpuUsageUsec(
  containerId: string,
  cgroupRoot = '/sys/fs/cgroup'
): number | null {
  const candidates = [
    `${cgroupRoot}/system.slice/docker-${containerId}.scope/cpu.stat`,
    `${cgroupRoot}/docker/${containerId}/cpu.stat`
  ];
  for (const candidate of candidates) {
    try {
      const stat = readFileSync(candidate, 'utf8');
      const line = stat.split('\n').find((entry) => entry.startsWith('usage_usec'));
      if (line) return Number(line.split(/\s+/)[1]);
    } catch {
      // Chemin absent : essayer le suivant.
    }
  }
  return null;
}

/**
 * Exécution isolée (T081) : conteneur gVisor éphémère, jamais de volume
 * partagé en écriture, sortie tronquée, conteneur supprimé après le run.
 */
export class DockerSandbox {
  constructor(private readonly options: SandboxOptions = {}) {}

  async run(job: SandboxJob): Promise<SandboxOutcome> {
    const limits = normalizeLimits(job.limits);
    const workspace = await mkdtemp(path.join(tmpdir(), 'cq-sandbox-'));
    const containerName = `cq-${job.submissionId.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40)}`;
    const docker = this.options.dockerPath ?? 'docker';

    try {
      await writeFile(
        path.join(workspace, job.language === 'python' ? 'main.py' : 'main.js'),
        job.code,
        'utf8'
      );
      await writeFile(
        path.join(workspace, job.language === 'python' ? 'harness.py' : 'harness.js'),
        job.language === 'python' ? pythonHarness() : javascriptHarness(),
        'utf8'
      );
      // Le harnais est copié dans /tmp par l'image d'entrée (tmpfs inscriptible).
      await writeFile(path.join(workspace, 'tests.json'), JSON.stringify(job.tests ?? []), 'utf8');

      const create = await runProcess(
        docker,
        buildDockerArgs(job, workspace, containerName, this.options),
        limits.wallTimeMs,
        limits.outputBytes
      );
      if (create.code !== 0) {
        return {
          exitCode: create.code,
          stdout: create.stdout,
          stderr: create.stderr,
          timedOut: create.timedOut,
          durationMs: create.durationMs,
          cpuTimeMs: create.durationMs,
          harness: null
        };
      }

      const containerId = create.stdout.trim().split(/\r?\n/).pop() ?? containerName;
      const before = readCpuUsageUsec(containerId);
      const start = await runProcess(
        docker,
        ['start', '-a', containerName],
        limits.wallTimeMs + 2_000,
        limits.outputBytes
      );
      const after = readCpuUsageUsec(containerId);
      await runProcess(docker, ['rm', '-f', containerName], 10_000, 4_096);

      const cpuTimeMs =
        before !== null && after !== null && after >= before
          ? Math.round((after - before) / 1_000)
          : start.durationMs;

      return {
        exitCode: start.code,
        stdout: start.stdout,
        stderr: start.stderr,
        timedOut: start.timedOut,
        durationMs: start.durationMs,
        cpuTimeMs,
        harness: parseHarnessOutput(start.stdout)
      };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}
