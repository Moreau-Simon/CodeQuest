import { createMailProcessor } from './mail.delivery.job';
import type { MailMessage } from './mail.service';

describe('consommation de la file d’e-mails', () => {
  it('livre le message en file via le transport SMTP', async () => {
    const message: MailMessage = {
      to: 'ada@example.com',
      subject: 'Confirmation',
      html: '<p>ok</p>',
      text: 'ok'
    };
    const deliver = jest.fn().mockResolvedValue(undefined);

    await createMailProcessor({ deliver })({ data: message } as never);

    expect(deliver).toHaveBeenCalledWith(message);
  });
});
