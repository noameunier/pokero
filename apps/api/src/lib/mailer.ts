import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import { getEnv } from '../config/env.ts';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const env = getEnv();
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(input: MailInput, logger?: FastifyBaseLogger): Promise<void> {
  const env = getEnv();
  const transport = getTransporter();

  if (!transport) {
    if (env.NODE_ENV === 'production') {
      logger?.error({ to: input.to, subject: input.subject }, 'SMTP non configuré : email non envoyé');
      throw new Error('SMTP non configuré.');
    }
    logger?.info({ to: input.to, subject: input.subject, text: input.text }, 'Email simulé (SMTP absent)');
    return;
  }

  try {
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  } catch (error) {
    logger?.error({ err: error, to: input.to }, 'Échec de l’envoi d’email');
    if (env.NODE_ENV === 'production') throw error;
  }
}

export function buildVerificationEmail(displayName: string, token: string): MailInput {
  const url = `${getEnv().APP_BASE_URL}/verifier-email?token=${encodeURIComponent(token)}`;
  return {
    to: '',
    subject: 'Pokero — confirmez votre adresse email',
    text: `Bonjour ${displayName},\n\nConfirmez votre adresse email en ouvrant ce lien :\n${url}\n\nCe lien expire dans 24 heures.`,
    html: `<p>Bonjour ${escapeHtml(displayName)},</p><p>Confirmez votre adresse email :</p><p><a href="${url}">${url}</a></p><p>Ce lien expire dans 24 heures.</p>`,
  };
}

export function buildPasswordResetEmail(displayName: string, token: string): MailInput {
  const url = `${getEnv().APP_BASE_URL}/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`;
  return {
    to: '',
    subject: 'Pokero — réinitialisation du mot de passe',
    text: `Bonjour ${displayName},\n\nRéinitialisez votre mot de passe :\n${url}\n\nCe lien expire dans 1 heure. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.`,
    html: `<p>Bonjour ${escapeHtml(displayName)},</p><p>Réinitialisez votre mot de passe :</p><p><a href="${url}">${url}</a></p><p>Ce lien expire dans 1 heure.</p>`,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
