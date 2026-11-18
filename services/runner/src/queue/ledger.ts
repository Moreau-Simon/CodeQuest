/**
 * Registre d'idempotence (T071).
 *
 * BullMQ déduplique déjà par `jobId`, mais une livraison Redis peut être
 * rejouée après un redémarrage. Ce registre garantit qu'une même soumission
 * n'est jamais exécutée deux fois, même si le job est livré en double.
 */
export class JobLedger {
  private readonly claimed = new Set<string>();
  private readonly completed = new Set<string>();

  claim(jobId: string): boolean {
    if (this.claimed.has(jobId) || this.completed.has(jobId)) return false;
    this.claimed.add(jobId);
    return true;
  }

  complete(jobId: string): void {
    this.claimed.delete(jobId);
    this.completed.add(jobId);
  }

  release(jobId: string): void {
    this.claimed.delete(jobId);
  }

  hasCompleted(jobId: string): boolean {
    return this.completed.has(jobId);
  }
}
