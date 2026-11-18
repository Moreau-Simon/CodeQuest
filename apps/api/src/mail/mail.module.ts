import { Injectable, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { EMAIL_QUEUE, MAIL_TRANSPORT } from './mail.constants';
import { MailService, type MailMessage, type MailTransport } from './mail.service';

/** Transport SMTP (MailHog en développement — T036). */
@Injectable()
export class NodemailerTransport implements MailTransport {
  constructor(private readonly transporter: Transporter) {}

  async sendMail(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text
    });
  }
}

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      useFactory: () => {
        const transporter = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth:
            env.SMTP_USER && env.SMTP_PASSWORD
              ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
              : undefined
        });
        return new NodemailerTransport(transporter);
      }
    },
    {
      provide: MailService,
      useFactory: (transport: MailTransport, queue?: unknown) =>
        new MailService(transport, queue as never),
      inject: [MAIL_TRANSPORT, { token: EMAIL_QUEUE, optional: true }]
    }
  ],
  exports: [MailService, MAIL_TRANSPORT]
})
export class MailModule {}
