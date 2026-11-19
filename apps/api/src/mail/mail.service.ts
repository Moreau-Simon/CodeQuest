import { Inject, Injectable, Optional } from '@nestjs/common';
import { EMAIL_QUEUE, MAIL_TRANSPORT } from './mail.constants';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<void>;
}

export interface MailQueue {
  add(name: string, data: MailMessage, options?: Record<string, unknown>): Promise<unknown>;
}

export interface ConfirmationData {
  pseudonym: string;
  link: string;
}

export interface PasswordResetData {
  pseudonym: string;
  link: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:24px">
  <main style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:14px;padding:24px">
    <h1 style="font-size:20px;margin-top:0">${escapeHtml(title)}</h1>
    ${body}
    <p style="color:#94a3b8;font-size:12px;margin-bottom:0">L'équipe CodeQuest</p>
  </main>
</body></html>`;
}

export function renderConfirmationEmail(data: ConfirmationData): MailMessage {
  return {
    to: '',
    subject: 'Confirmez votre adresse e-mail — CodeQuest',
    html: layout(
      'Bienvenue sur CodeQuest',
      `<p>Bonjour ${escapeHtml(data.pseudonym)},</p>
       <p>Confirmez votre adresse e-mail pour activer toutes les fonctionnalités :</p>
       <p><a href="${escapeHtml(data.link)}">Confirmer mon adresse</a></p>
       <p>Ce lien expire dans 24 heures. Sans confirmation, votre compte reste en lecture seule.</p>`
    ),
    text: `Bonjour ${data.pseudonym},\n\nConfirmez votre adresse e-mail pour activer votre compte :\n${data.link}\n\nCe lien expire dans 24 heures.\n\nL'équipe CodeQuest`
  };
}

export function renderPasswordResetEmail(data: PasswordResetData): MailMessage {
  return {
    to: '',
    subject: 'Réinitialisation de votre mot de passe — CodeQuest',
    html: layout(
      'Réinitialisation du mot de passe',
      `<p>Bonjour ${escapeHtml(data.pseudonym)},</p>
       <p>Une réinitialisation a été demandée. Ce lien est valable 1 heure et ne peut servir qu'une fois.</p>
       <p><a href="${escapeHtml(data.link)}">Choisir un nouveau mot de passe</a></p>
       <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`
    ),
    text: `Bonjour ${data.pseudonym},\n\nRéinitialisez votre mot de passe (lien valable 1 heure, usage unique) :\n${data.link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n\nL'équipe CodeQuest`
  };
}

/**
 * Envoi d'e-mails (T036) : Nodemailer en direct, ou mise en file BullMQ quand
 * `EMAIL_QUEUE` est disponible (worker d'envoi déployé séparément).
 */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @Optional() @Inject(EMAIL_QUEUE) private readonly queue?: MailQueue
  ) {}

  async sendConfirmation(to: string, data: ConfirmationData): Promise<void> {
    await this.sendOrQueue('confirmation', { ...renderConfirmationEmail(data), to });
  }

  async sendPasswordReset(to: string, data: PasswordResetData): Promise<void> {
    await this.sendOrQueue('password-reset', { ...renderPasswordResetEmail(data), to });
  }

  /** Consommé par le worker de la file `emails`. */
  async deliver(message: MailMessage): Promise<void> {
    await this.transport.sendMail(message);
  }

  private async sendOrQueue(jobName: string, message: MailMessage): Promise<void> {
    if (this.queue) {
      await this.queue.add(jobName, message, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { age: 86_400 }
      });
      return;
    }
    await this.deliver(message);
  }
}
