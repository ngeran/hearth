import type { Env } from "./env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export class MailerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailerError";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrap(body: string): string {
  return [
    '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.6;color:#1f2933;max-width:520px">',
    body,
    '<p style="margin-top:28px;font-size:12px;color:#6b7280">Hearth</p>',
    "</div>",
  ].join("");
}

function codeBlock(code: string): string {
  return [
    '<p style="font-size:32px;letter-spacing:8px;font-weight:700;',
    "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:20px 0;",
    `color:#B44530">${escapeHtml(code)}</p>`,
  ].join("");
}

export function signInEmail(email: string, code: string): MailMessage {
  const escapedCode = escapeHtml(code);

  return {
    to: email,
    subject: "Your Hearth sign-in code / Ο κωδικός σύνδεσής σου",
    text: [
      "Your Hearth sign-in code:",
      code,
      "",
      "It expires in 10 minutes. If you did not ask for it, you can ignore this email.",
      "",
      "Ο κωδικός σύνδεσής σου στο Hearth:",
      code,
      "",
      "Λήγει σε 10 λεπτά. Αν δεν τον ζήτησες, μπορείς να αγνοήσεις αυτό το email.",
    ].join("\n"),
    html: wrap(
      [
        "<p>Your Hearth sign-in code / Ο κωδικός σύνδεσής σου:</p>",
        codeBlock(code),
        `<p style="font-size:14px;color:#4b5563">The code expires in 10 minutes. If you did not ask for it, ignore this email.<br>Ο κωδικός λήγει σε 10 λεπτά. Αν δεν τον ζήτησες, αγνόησε αυτό το email.</p>`,
        `<p style="display:none">${escapedCode}</p>`,
      ].join(""),
    ),
  };
}

export function academicEmail(email: string, code: string): MailMessage {
  const escapedCode = escapeHtml(code);

  return {
    to: email,
    subject: "Confirm your student email / Επιβεβαίωσε το φοιτητικό σου email",
    text: [
      "Your Hearth student-email code:",
      code,
      "",
      "It expires in 10 minutes. If you did not ask for it, you can ignore this email.",
      "",
      "Ο κωδικός για το φοιτητικό σου email στο Hearth:",
      code,
      "",
      "Λήγει σε 10 λεπτά. Αν δεν τον ζήτησες, μπορείς να αγνοήσεις αυτό το email.",
    ].join("\n"),
    html: wrap(
      [
        "<p>Confirm your student email / Επιβεβαίωσε το φοιτητικό σου email:</p>",
        codeBlock(code),
        `<p style="font-size:14px;color:#4b5563">The code expires in 10 minutes. If you did not ask for it, ignore this email.<br>Ο κωδικός λήγει σε 10 λεπτά. Αν δεν τον ζήτησες, αγνόησε αυτό το email.</p>`,
        `<p style="display:none">${escapedCode}</p>`,
      ].join(""),
    ),
  };
}

export function createMailer(env: Env): Mailer {
  return {
    async send(message) {
      // Tests use a fixed OTP and must never reach a real inbox.
      if (env.ENVIRONMENT === "test") {
        return;
      }

      if (!env.RESEND_API_KEY) {
        throw new MailerError("Email delivery is not configured.");
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: env.MAIL_FROM ?? "Hearth <hello@hearth.example>",
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });

      if (!response.ok) {
        // Deliberately excludes the provider body: it can echo the recipient.
        throw new MailerError(`Email delivery failed with status ${response.status}.`);
      }
    },
  };
}
