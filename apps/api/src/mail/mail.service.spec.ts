import {
  MailService,
  renderConfirmationEmail,
  renderPasswordResetEmail,
  type MailMessage,
  type MailTransport
} from './mail.service';

describe('gabarits e-mail', () => {
  it('échappe le pseudo et le lien dans le gabarit de confirmation', () => {
    const mail = renderConfirmationEmail({
      pseudonym: '<script>alert(1)</script>',
      link: 'https://app.example/confirm?token=abc&x=1'
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('confirm?token=abc&amp;x=1');
    expect(mail.text).toMatch(/confirmez/i);
  });

  it('produit un gabarit de réinitialisation avec une expiration d’une heure', () => {
    const mail = renderPasswordResetEmail({
      pseudonym: 'ada',
      link: 'https://app.example/reset?token=abc'
    });
    expect(mail.subject).toMatch(/réinitialisation/i);
    expect(mail.text).toMatch(/1 heure/);
  });
});

describe('MailService', () => {
  function fakeTransport(): { transport: MailTransport; sent: MailMessage[] } {
    const sent: MailMessage[] = [];
    return {
      sent,
      transport: {
        sendMail: jest.fn(async (message: MailMessage) => {
          sent.push(message);
        })
      }
    };
  }

  it('envoie directement quand aucune file n’est configurée', async () => {
    const { transport, sent } = fakeTransport();
    const service = new MailService(transport);
    await service.sendConfirmation('joueur@example.com', {
      pseudonym: 'ada',
      link: 'https://app.example/confirm?token=abc'
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('joueur@example.com');
  });

  it('met en file quand une file est disponible', async () => {
    const { transport, sent } = fakeTransport();
    const add = jest.fn().mockResolvedValue(undefined);
    const service = new MailService(transport, { add });
    await service.sendPasswordReset('joueur@example.com', {
      pseudonym: 'ada',
      link: 'https://app.example/reset?token=abc'
    });
    expect(add).toHaveBeenCalledWith(
      'password-reset',
      expect.objectContaining({ to: 'joueur@example.com' }),
      expect.any(Object)
    );
    expect(sent).toHaveLength(0);
  });

  it('livre un job de file via le transport', async () => {
    const { transport, sent } = fakeTransport();
    const service = new MailService(transport);
    await service.deliver({
      to: 'joueur@example.com',
      subject: 'Test',
      html: '<p>ok</p>',
      text: 'ok'
    });
    expect(sent).toHaveLength(1);
  });
});
