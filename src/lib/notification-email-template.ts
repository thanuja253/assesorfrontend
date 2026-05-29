export type NotificationEmailDetailRow = { label: string; value: string };

export type NotificationEmailPayload = {
  brandName: string;
  logoUrl: string;
  primaryColor: string;
  portalUrl: string;
  supportEmail: string;
  subject: string;
  headline: string;
  recipientName?: string;
  messageParagraphs: string[];
  details?: Array<NotificationEmailDetailRow>;
  ctaUrl?: string;
  ctaLabel?: string;
  year: string | number;
};

/**
 * JSON Schema (draft-07 compatible) for the notification email payload.
 * Keep in sync with NotificationEmailPayload.
 */
export const notificationEmailPayloadSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "NotificationEmailPayload",
  type: "object",
  additionalProperties: false,
  required: [
    "brandName",
    "logoUrl",
    "primaryColor",
    "portalUrl",
    "supportEmail",
    "subject",
    "headline",
    "messageParagraphs",
    "year",
  ],
  properties: {
    brandName: { type: "string", minLength: 1 },
    logoUrl: { type: "string", minLength: 1 },
    primaryColor: { type: "string", minLength: 1, description: "Hex or CSS color value." },
    portalUrl: { type: "string", minLength: 1 },
    supportEmail: { type: "string", minLength: 1 },
    subject: { type: "string", minLength: 1 },
    headline: { type: "string", minLength: 1 },
    recipientName: { type: "string" },
    messageParagraphs: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string", minLength: 1 },
    },
    details: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: {
          label: { type: "string", minLength: 1 },
          value: { type: "string", minLength: 1 },
        },
      },
    },
    ctaUrl: { type: "string" },
    ctaLabel: { type: "string" },
    year: { oneOf: [{ type: "string" }, { type: "number" }] },
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeUrl(value: string): string {
  const trimmed = value.trim();
  // Allow http(s) and mailto. If invalid, fall back to portalUrl in renderer.
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return "";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeParagraphs(paragraphs: string[]): string[] {
  return paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeDetails(details?: Array<NotificationEmailDetailRow>): Array<NotificationEmailDetailRow> {
  if (!details || !Array.isArray(details)) return [];
  return details
    .map((row) => ({ label: String(row.label ?? "").trim(), value: String(row.value ?? "").trim() }))
    .filter((row) => row.label && row.value);
}

export const notificationEmailHtmlTemplateWithPlaceholders = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>{subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f7f9;">
    <!-- Preheader (hidden) -->
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
      {headline} — {subject}
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f7f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">
            <tr>
              <td style="padding:0 0 12px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="left" style="padding:0;">
                      <a href="{portalUrl}" style="text-decoration:none;">
                        <img src="{logoUrl}" width="140" height="40" alt="{brandName}" style="display:block;border:0;outline:none;text-decoration:none;height:40px;width:140px;object-fit:contain;" />
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="background-color:#ffffff;border:1px solid #e6ebf1;border-radius:10px;overflow:hidden;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:18px 20px;background-color:#ffffff;border-top:6px solid {primaryColor};">
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
                        Subject: <span style="color:#111827;font-weight:bold;">{subject}</span>
                      </p>
                      <h1 style="margin:10px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:28px;color:#111827;">
                        {headline}
                      </h1>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:18px 20px 6px 20px;">
                      <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#111827;">
                        Hello {recipientName},
                      </p>
                      {messageParagraphs}
                    </td>
                  </tr>

                  {details}

                  {cta}

                  <tr>
                    <td style="padding:16px 20px;background-color:#ffffff;border-top:1px solid #eef2f7;">
                      <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
                        This is an automated message, please do not reply.
                      </p>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
                        Need help? Contact <a href="mailto:{supportEmail}" style="color:{primaryColor};text-decoration:underline;">{supportEmail}</a>.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:14px 10px 0 10px;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#9aa3af;">
                  © {year} {brandName}. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const notificationEmailTextTemplateWithPlaceholders = `{subject}

{headline}

Hello {recipientName},

{messageParagraphs}

{details}

{ctaLabel}: {ctaUrl}

This is an automated message, please do not reply.
Support: {supportEmail}
© {year} {brandName}`;

function renderMessageParagraphsHtml(paragraphs: string[]): string {
  return paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#374151;">${escapeHtml(
          p,
        )}</p>`,
    )
    .join("");
}

function renderDetailsHtml(details: Array<NotificationEmailDetailRow>, primaryColor: string): string {
  if (details.length === 0) return "";
  const rows = details
    .map((row) => {
      return `<tr>
  <td style="padding:8px 10px;border-top:1px solid #eef2f7;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;width:32%;"><strong style="color:#374151;">${escapeHtml(
    row.label,
  )}</strong></td>
  <td style="padding:8px 10px;border-top:1px solid #eef2f7;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#111827;">${escapeHtml(
    row.value,
  )}</td>
</tr>`;
    })
    .join("");

  return `<tr>
  <td style="padding:0 20px 6px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e6ebf1;border-radius:8px;overflow:hidden;">
      <tr>
        <td colspan="2" style="padding:10px;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#111827;border-bottom:1px solid #e6ebf1;">
          <strong style="color:${escapeHtml(primaryColor)};">Details</strong>
        </td>
      </tr>
      ${rows}
    </table>
  </td>
</tr>`;
}

function renderCtaHtml(ctaUrl: string, ctaLabel: string, primaryColor: string): string {
  return `<tr>
  <td style="padding:10px 20px 22px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="left">
          <a href="${escapeHtml(ctaUrl)}"
             style="display:inline-block;background-color:${escapeHtml(primaryColor)};color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;border-radius:8px;padding:12px 18px;">
            ${escapeHtml(ctaLabel)}
          </a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

function renderMessageParagraphsText(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

function renderDetailsText(details: Array<NotificationEmailDetailRow>): string {
  if (details.length === 0) return "";
  return (
    "Details:\n" +
    details.map((row) => `- ${row.label}: ${row.value}`).join("\n")
  );
}

export function renderNotificationEmail(payload: NotificationEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const recipientName = isNonEmptyString(payload.recipientName) ? payload.recipientName.trim() : "";
  const greetingName = recipientName ? escapeHtml(recipientName) : "";
  const greetingReplacement = greetingName ? `Hello ${greetingName},` : "Hello,";

  const messageParagraphs = normalizeParagraphs(payload.messageParagraphs);
  const details = normalizeDetails(payload.details);

  const primaryColor = String(payload.primaryColor ?? "").trim() || "#16a34a";
  const portalUrl = sanitizeUrl(String(payload.portalUrl ?? "")) || "#";

  const ctaUrlRaw = isNonEmptyString(payload.ctaUrl) ? payload.ctaUrl.trim() : "";
  const ctaLabelRaw = isNonEmptyString(payload.ctaLabel) ? payload.ctaLabel.trim() : "";
  const ctaUrl = sanitizeUrl(ctaUrlRaw);
  const hasCta = Boolean(ctaUrl && ctaLabelRaw);

  const htmlMessageParagraphs = renderMessageParagraphsHtml(messageParagraphs);
  const htmlDetails = renderDetailsHtml(details, primaryColor);
  const htmlCta = hasCta ? renderCtaHtml(ctaUrl, ctaLabelRaw, primaryColor) : "";

  let html = notificationEmailHtmlTemplateWithPlaceholders;
  html = html.replaceAll("{brandName}", escapeHtml(payload.brandName));
  html = html.replaceAll("{logoUrl}", escapeHtml(payload.logoUrl));
  html = html.replaceAll("{primaryColor}", escapeHtml(primaryColor));
  html = html.replaceAll("{portalUrl}", escapeHtml(portalUrl));
  html = html.replaceAll("{supportEmail}", escapeHtml(payload.supportEmail));
  html = html.replaceAll("{subject}", escapeHtml(payload.subject));
  html = html.replaceAll("{headline}", escapeHtml(payload.headline));
  // Note: Template greeting line contains "Hello {recipientName},"; replace entire line safely.
  html = html.replace("Hello {recipientName},", greetingReplacement);
  html = html.replace("{messageParagraphs}", htmlMessageParagraphs);
  html = html.replace("{details}", htmlDetails);
  html = html.replace("{cta}", htmlCta);
  html = html.replaceAll("{ctaUrl}", escapeHtml(ctaUrlRaw));
  html = html.replaceAll("{ctaLabel}", escapeHtml(ctaLabelRaw));
  html = html.replaceAll("{year}", escapeHtml(String(payload.year)));

  const textMessage = renderMessageParagraphsText(messageParagraphs);
  const textDetails = renderDetailsText(details);
  const textCta = hasCta ? `${ctaLabelRaw}: ${ctaUrl}` : "";

  let text = notificationEmailTextTemplateWithPlaceholders;
  text = text.replaceAll("{subject}", payload.subject);
  text = text.replaceAll("{headline}", payload.headline);
  text = text.replace("Hello {recipientName},", recipientName ? `Hello ${recipientName},` : "Hello,");
  text = text.replace("{messageParagraphs}", textMessage);
  text = text.replace("{details}", textDetails);
  text = text.replaceAll("{ctaUrl}", payload.ctaUrl ?? "");
  text = text.replaceAll("{ctaLabel}", payload.ctaLabel ?? "");
  // Keep the line but blank it if CTA not provided.
  text = text.replace("{ctaLabel}: {ctaUrl}", hasCta ? textCta : "");
  text = text.replaceAll("{supportEmail}", payload.supportEmail);
  text = text.replaceAll("{brandName}", payload.brandName);
  text = text.replaceAll("{year}", String(payload.year));

  // Normalize excessive blank lines.
  text = text.replace(/\n{4,}/g, "\n\n\n").trim() + "\n";

  return { subject: payload.subject, html, text };
}

