import { MailService, textToHtml } from './mail.service';

function fakePrisma() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    emailLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.dedupeKey && rows.some((r) => r.dedupeKey === data.dedupeKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = { id: `e${rows.length + 1}`, error: null, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
}

describe('MailService', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const msg = { companyId: 'c1', to: 'owner@x.sa', subject: 'تذكير', body: 'مرحباً\n\nHello', type: 'MANUAL_REMINDER' as const };

  it('stores the email as LOGGED (outbox) when SMTP_HOST is not set', async () => {
    delete process.env.SMTP_HOST;
    const prisma = fakePrisma();
    const mail = new MailService(prisma as never);
    expect(mail.configured).toBe(false);
    const log = await mail.send(msg);
    expect(log).toMatchObject({ status: 'LOGGED', to: 'owner@x.sa', type: 'MANUAL_REMINDER', companyId: 'c1', error: null });
    expect(prisma.rows).toHaveLength(1);
  });

  it('skips (returns null) a duplicate dedupeKey instead of sending twice', async () => {
    delete process.env.SMTP_HOST;
    const prisma = fakePrisma();
    const mail = new MailService(prisma as never);
    expect(await mail.send({ ...msg, dedupeKey: 'K:1' })).not.toBeNull();
    expect(await mail.send({ ...msg, dedupeKey: 'K:1' })).toBeNull();
    expect(prisma.rows).toHaveLength(1);
  });

  it('records FAILED with the error (never throws) when SMTP sending fails', async () => {
    process.env.SMTP_HOST = 'smtp.invalid';
    const prisma = fakePrisma();
    const mail = new MailService(prisma as never);
    (mail as unknown as { transport: () => unknown }).transport = () => ({ sendMail: async () => Promise.reject(new Error('connection refused')) });
    const log = await mail.send({ ...msg, dedupeKey: 'K:2' });
    expect(log).toMatchObject({ status: 'FAILED', error: 'connection refused', dedupeKey: null });
  });

  it('records SENT when the transport accepts the message', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    const prisma = fakePrisma();
    const mail = new MailService(prisma as never);
    const sendMail = jest.fn(async () => ({ messageId: '1' }));
    (mail as unknown as { transport: () => unknown }).transport = () => ({ sendMail });
    const log = await mail.send(msg);
    expect(log).toMatchObject({ status: 'SENT', error: null });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@x.sa', subject: 'تذكير', text: msg.body, from: 'شؤون <hello@shuoon.net>' }));
  });

  it('textToHtml escapes and renders RTL paragraphs', () => {
    const html = textToHtml('سطر <1>\nسطر 2\n\nEnglish & more');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('سطر &lt;1&gt;<br>سطر 2');
    expect(html).toContain('English &amp; more');
  });
});
