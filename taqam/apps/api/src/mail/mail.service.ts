import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { EmailLog, EmailType } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

export interface MailInput {
  companyId: string | null;
  to: string;
  subject: string;
  /** plain text (Arabic first, then English); the HTML part is generated from it */
  body: string;
  type: EmailType;
  /** automatic reminders: a unique key that makes re-sending a no-op */
  dedupeKey?: string | null;
}

interface Transport {
  sendMail(m: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown>;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text → minimal RTL HTML: blank lines split paragraphs, single newlines become <br>. */
export function textToHtml(text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const latin = !/[؀-ۿ]/.test(p);
      return `<p${latin ? ' dir="ltr" style="text-align:left"' : ''}>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`;
    });
  return (
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head>' +
    '<body dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.8;color:#0C1F24;background:#ffffff;padding:16px">' +
    `<div style="max-width:600px;margin:0 auto">${paras.join('')}</div></body></html>`
  );
}

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';

/**
 * Outbound email. With SMTP_HOST set, sends via SMTP (nodemailer); otherwise the message is only stored in
 * EmailLog with status LOGGED (outbox — nothing leaves the server). Every attempt is logged; never throws.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private cached: { key: string; transport: Transport } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  get configured(): boolean {
    return !!process.env.SMTP_HOST?.trim();
  }

  get from(): string {
    return process.env.SMTP_FROM?.trim() || 'شؤون <hello@shuoon.net>';
  }

  protected transport(): Transport {
    const host = process.env.SMTP_HOST!.trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = /^(1|true|yes)$/i.test(process.env.SMTP_SECURE ?? '') || port === 465;
    const user = process.env.SMTP_USER || undefined;
    const key = [host, port, secure, user].join('|');
    if (this.cached?.key !== key) {
      this.cached = {
        key,
        transport: nodemailer.createTransport({
          host,
          port,
          secure,
          auth: user ? { user, pass: process.env.SMTP_PASS ?? '' } : undefined,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 20000,
        }),
      };
    }
    return this.cached.transport;
  }

  /**
   * Sends (or logs) one email. Returns the EmailLog row, or null when skipped because `dedupeKey` was
   * already used (the key is claimed before sending, so concurrent runs never double-send).
   */
  async send(m: MailInput): Promise<EmailLog | null> {
    const smtp = this.configured;
    let log: EmailLog;
    try {
      log = await this.prisma.emailLog.create({
        data: {
          companyId: m.companyId,
          to: m.to,
          subject: m.subject,
          body: m.body,
          type: m.type,
          // claimed as FAILED("sending…") until the SMTP server accepts it
          status: smtp ? 'FAILED' : 'LOGGED',
          error: smtp ? 'sending…' : null,
          dedupeKey: m.dedupeKey ?? null,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return null;
      this.logger.error(`could not log email to ${m.to}: ${(e as Error).message}`);
      return null;
    }
    if (!smtp) return log;
    try {
      await this.transport().sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.body, html: textToHtml(m.body) });
      return await this.prisma.emailLog.update({ where: { id: log.id }, data: { status: 'SENT', error: null } });
    } catch (e) {
      const error = (e as Error)?.message || String(e);
      this.logger.warn(`email to ${m.to} failed: ${error}`);
      try {
        // release the dedupe key so a later run can retry
        return await this.prisma.emailLog.update({ where: { id: log.id }, data: { status: 'FAILED', error: error.slice(0, 1000), dedupeKey: null } });
      } catch {
        return { ...log, status: 'FAILED', error, dedupeKey: null };
      }
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
