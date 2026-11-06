import nodemailer, { type Transporter } from 'nodemailer'
import { env, isTest } from '../../config/env.js'
import { logger } from '../../config/logger.js'

export interface EmailMessage {
  to: string
  subject: string
  text: string
}

export interface EmailService {
  send(msg: EmailMessage): Promise<void>
}

/** Dev: log emails to the console. Tests: keep them in memory so tests can read the links. */
export class ConsoleEmailService implements EmailService {
  readonly outbox: EmailMessage[] = []
  async send(msg: EmailMessage): Promise<void> {
    this.outbox.push(msg)
    if (!isTest)
      logger.info({ to: msg.to, subject: msg.subject, text: msg.text }, 'email (console transport)')
  }
}

export class SmtpEmailService implements EmailService {
  private readonly transport: Transporter
  constructor(url: string) {
    this.transport = nodemailer.createTransport(url)
  }
  async send(msg: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: env.EMAIL_FROM, ...msg })
  }
}

export const emailService: EmailService = env.SMTP_URL
  ? new SmtpEmailService(env.SMTP_URL)
  : new ConsoleEmailService()

/** Fire-and-forget so slow SMTP never delays (or reveals anything through) the HTTP response. */
export function sendEmail(msg: EmailMessage): void {
  emailService
    .send(msg)
    .catch((err: unknown) => logger.error({ err, subject: msg.subject }, 'email send failed'))
}
