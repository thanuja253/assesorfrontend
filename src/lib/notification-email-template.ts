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
  details?: NotificationEmailDetailRow[];
  ctaUrl?: string;
  ctaLabel?: string;
  year: string | number;
};

/** JSON Schema (draft-07) for notification email payload. */
export const notificationEmailPayloadSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "NotificationEmailPayload",
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
    primaryColor: { type: "string", minLength: 1 },
    portalUrl: { type: "string", minLength: 1 },
    supportEmail: { type: "string", minLength: 1, format: "email" },
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
    ctaUrl: { type: "string", minLength: 1 },
    ctaLabel: { type: "string", minLength: 1 },
    year: { oneOf: [{ type: "string" }, { type: "integer" }] },
  },
} as const;

/**
 * Final HTML template — placeholders must remain exactly as listed.
 * {messageParagraphs} and {details} are expanded by renderNotificationEmail.
 */
export const notificationEmailHtmlTemplate = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Hidden preheader for inbox preview -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#f4f6f8;">
    {headline}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f6f8;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">
          <!-- Header / logo -->
          <tr>
            <td align="left" style="padding:0 0 16px 0;">
              <a href="{portalUrl}" target="_blank" style="text-decoration:none;">
                <img src="{logoUrl}" width="160" height="44" alt="{brandName}" style="display:block;border:0;outline:none;text-decoration:none;max-width:160px;height:auto;" />
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <!-- Accent bar + subject / headline -->
                <tr>
                  <td style="padding:0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="height:4px;background-color:{primaryColor};font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 28px 8px 28px;">
                    <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">
                      {subject}
                    </p>
                    <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:30px;font-weight:bold;color:#0f172a;">
                      {headline}
                    </h1>
                  </td>
                </tr>

                <!-- Greeting + body -->
                <tr>
                  <td style="padding:8px 28px 8px 28px;">
                    <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#334155;">
                      Hello {recipientName},
                    </p>
                    {messageParagraphs}
                  </td>
                </tr>

                <!-- Optional details table -->
                {details}

                <!-- Optional CTA -->
                <tr>
                  <td align="left" style="padding:8px 28px 28px 28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="border-radius:6px;background-color:{primaryColor};">
                          <a href="{ctaUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;background-color:{primaryColor};">
                            {ctaLabel}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:20px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                    <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                      This is an automated message, please do not reply.
                    </p>
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                      Support: <a href="mailto:{supportEmail}" style="color:{primaryColor};text-decoration:underline;">{supportEmail}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Copyright -->
          <tr>
            <td align="center" style="padding:16px 8px 0 8px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#94a3b8;">
                &copy; {year} {brandName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/** Final plain-text template — same placeholders as HTML. */
export const notificationEmailTextTemplate = `{subject}

{headline}

Hello {recipientName},

{messageParagraphs}

{details}

{ctaLabel}: {ctaUrl}

This is an automated message, please do not reply.
Support: {supportEmail}

(c) {year} {brandName}. All rights reserved.`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeParagraphs(paragraphs: string[]): string[] {
  return paragraphs.map((p) => p.trim()).filter(Boolean).slice(0, 3);
}

function normalizeDetails(details?: NotificationEmailDetailRow[]): NotificationEmailDetailRow[] {
  if (!details?.length) return [];
  return details
    .map((row) => ({
      label: String(row.label ?? "").trim(),
      value: String(row.value ?? "").trim(),
    }))
    .filter((row) => row.label && row.value);
}

function renderMessageParagraphsHtml(paragraphs: string[]): string {
  return paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#334155;">${escapeHtml(p)}</p>`,
    )
    .join("\n                    ");
}

function renderDetailsHtml(details: NotificationEmailDetailRow[], primaryColor: string): string {
  if (details.length === 0) return "";

  const rows = details
    .map(
      (row, index) => `<tr>
                      <td style="padding:10px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;border-top:${index === 0 ? "0" : "1px solid #e2e8f0"};width:36%;vertical-align:top;">
                        <strong style="color:#334155;">${escapeHtml(row.label)}</strong>
                      </td>
                      <td style="padding:10px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#0f172a;border-top:${index === 0 ? "0" : "1px solid #e2e8f0"};vertical-align:top;">
                        ${escapeHtml(row.value)}
                      </td>
                    </tr>`,
    )
    .join("\n                    ");

  return `<tr>
                  <td style="padding:0 28px 16px 28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
                      <tr>
                        <td colspan="2" style="padding:10px 14px;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:bold;color:${escapeHtml(primaryColor)};border-bottom:1px solid #e2e8f0;">
                          Details
                        </td>
                      </tr>
                      ${rows}
                    </table>
                  </td>
                </tr>`;
}

function renderMessageParagraphsText(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

function renderDetailsText(details: NotificationEmailDetailRow[]): string {
  if (details.length === 0) return "";
  return "Details:\n" + details.map((row) => `${row.label}: ${row.value}`).join("\n");
}

function applyReplacements(
  template: string,
  replacements: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

/** Remove optional CTA row from template before rendering. */
function stripCtaRowFromTemplate(template: string): string {
  const start = "<!-- Optional CTA -->";
  const end = "<!-- Footer -->";
  const startIdx = template.indexOf(start);
  const endIdx = template.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return template;
  return template.slice(0, startIdx) + template.slice(endIdx);
}

export function renderNotificationEmail(payload: NotificationEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const paragraphs = normalizeParagraphs(payload.messageParagraphs);
  const details = normalizeDetails(payload.details);
  const primaryColor = payload.primaryColor.trim() || "#16a34a";

  const recipientDisplay = isNonEmpty(payload.recipientName)
    ? escapeHtml(payload.recipientName.trim())
    : "";
  const greetingHtml = recipientDisplay ? `Hello ${recipientDisplay},` : "Hello,";
  const greetingText = isNonEmpty(payload.recipientName)
    ? `Hello ${payload.recipientName.trim()},`
    : "Hello,";

  const ctaUrl = isNonEmpty(payload.ctaUrl) ? payload.ctaUrl.trim() : "";
  const ctaLabel = isNonEmpty(payload.ctaLabel) ? payload.ctaLabel.trim() : "";
  const hasCta = Boolean(ctaUrl && ctaLabel);

  let htmlSource = notificationEmailHtmlTemplate;
  if (!hasCta) {
    htmlSource = stripCtaRowFromTemplate(htmlSource);
  }
  if (details.length === 0) {
    htmlSource = htmlSource.replace("{details}", "");
  }

  const scalarReplacements: Record<string, string> = {
    brandName: escapeHtml(payload.brandName),
    logoUrl: escapeHtml(payload.logoUrl),
    primaryColor: escapeHtml(primaryColor),
    portalUrl: escapeHtml(payload.portalUrl),
    supportEmail: escapeHtml(payload.supportEmail),
    subject: escapeHtml(payload.subject),
    headline: escapeHtml(payload.headline),
    ctaUrl: hasCta ? escapeHtml(ctaUrl) : "",
    ctaLabel: hasCta ? escapeHtml(ctaLabel) : "",
    year: escapeHtml(String(payload.year)),
    messageParagraphs: renderMessageParagraphsHtml(paragraphs),
    details: renderDetailsHtml(details, primaryColor),
  };

  let html = applyReplacements(htmlSource, scalarReplacements);
  html = html.replace("Hello {recipientName},", greetingHtml);

  let textSource = notificationEmailTextTemplate;
  if (!hasCta) {
    textSource = textSource.replace("\n{ctaLabel}: {ctaUrl}\n", "\n");
  }

  const textReplacements: Record<string, string> = {
    subject: payload.subject,
    headline: payload.headline,
    messageParagraphs: renderMessageParagraphsText(paragraphs),
    details: renderDetailsText(details),
    ctaUrl: hasCta ? ctaUrl : "",
    ctaLabel: hasCta ? ctaLabel : "",
    supportEmail: payload.supportEmail,
    year: String(payload.year),
    brandName: payload.brandName,
  };

  let text = applyReplacements(textSource, textReplacements);
  text = text.replace("Hello {recipientName},", greetingText);

  text = text.replace(/\n{3,}/g, "\n\n").trim() + "\n";

  return {
    subject: payload.subject,
    html,
    text,
  };
}
