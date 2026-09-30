# EmailJS Reference — Azure Horizon

## Account Credentials
- Public Key: `e9wHktkV2OU_QMaYq`
- Private Key: `MbOqjaY8NL-yqLuQFhBmX`
- Service ID: `service_jdrtevg`
- Template ID: `template_yjx0xlw`

## Template Format (dashboard "Format" tab)
- Subject: `{{to_email}}`
- To Email: `{{to_email}}`
- From Name: `{{name}}`
- From Email: default account address
- Reply To: `{{email}}`

> Note: the actual received subject line uses the template param `title`/`subject_line`
> (e.g. "Invitation Pass: Resort Gala Event"), so the Subject field in the dashboard
> editor is likely set to `{{title}}` — adjust there if subjects ever look wrong.

## Template Code (HTML content of `template_yjx0xlw`)

Paste this into the EmailJS template editor's HTML/Content field.

Variables used (`{{variable}}` syntax, EmailJS default):
- `{{name}}` — Guest's name
- `{{subject_line}}` — Short heading
- `{{status_label}}` — "APPROVED" / "DECLINED" / "PENDING" / "CONFIRMED" (drives accent color)
- `{{status_color}}` — Pre-picked hex color passed from code (e.g. `#16a34a`, `#dc2626`, `#c9a227`)
- `{{message}}` — Main body text/explanation
- `{{detail_rows}}` — Pre-formatted HTML string of itemized rows (optional)
- `{{amount}}` — Total amount (e.g. "R 1,250.00"); pass `FREE` for invitations
- `{{reference_id}}` — Booking/event/claim reference
- `{{time}}` — Timestamp
- `{{cta_text}}` — Button label (optional)
- `{{cta_link}}` — Deep link or web link (optional)

```html
<!-- 
AZURE HORIZON — Branded Notification Email Template (EmailJS)
Paste this into the EmailJS template editor's HTML/Content field.
Works for: refund decisions, damage invoices, event confirmations, invitations, general notifications.
-->
<div style="font-family: 'Helvetica Neue', system-ui, Arial, sans-serif; background-color: #0f172a; padding: 32px 16px; margin: 0;">
  <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; border-collapse: collapse;">
    <tr>
      <td>
        <!-- Header / Brand -->
        <table role="presentation" width="100%" style="background-color: #1e3a5f; border-radius: 16px 16px 0 0; padding: 28px 32px;">
          <tr>
            <td style="text-align: center;">
              <div style="font-size: 13px; letter-spacing: 3px; color: #c9a227; text-transform: uppercase; margin-bottom: 6px;">
                Azure Horizon
              </div>
              <div style="font-size: 22px; font-weight: 700; color: #ffffff;">
                Your Digital Resort Companion
              </div>
            </td>
          </tr>
        </table>

        <!-- Status accent bar -->
        <table role="presentation" width="100%" style="background-color: {{status_color}}; padding: 10px 32px;">
          <tr>
            <td style="text-align: center; color: #ffffff; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
              {{status_label}}
            </td>
          </tr>
        </table>

        <!-- Body card -->
        <table role="presentation" width="100%" style="background-color: #ffffff; padding: 32px;">
          <tr>
            <td>
              <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">
                {{subject_line}}
              </div>
              <div style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">
                Reference: {{reference_id}} &nbsp;•&nbsp; {{time}}
              </div>

              <div style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 4px;">
                Dear {{name}},
              </div>
              <div style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
                {{message}}
              </div>

              <!-- Itemized detail box (optional - omit table if {{detail_rows}} unused) -->
              <table role="presentation" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    {{detail_rows}}
                  </td>
                </tr>
              </table>

              <!-- Total amount, if relevant -->
              <table role="presentation" width="100%" style="border-top: 2px dashed #e2e8f0; padding-top: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="font-size: 15px; font-weight: 700; color: #1e293b;">
                    Total
                  </td>
                  <td style="text-align: right; font-size: 18px; font-weight: 700; color: #1e3a5f;">
                    {{amount}}
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table role="presentation" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="{{cta_link}}" style="display: inline-block; background-color: #c9a227; color: #1e3a5f; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 10px; text-decoration: none;">
                      {{cta_text}}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" style="background-color: #0f172a; border-radius: 0 0 16px 16px; padding: 20px 32px;">
          <tr>
            <td style="text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
              This is an automated message from Azure Horizon Resort.<br />
              Please do not reply directly to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
```

## Known Issue: HTML in `{{message}}` renders as raw text
The invitation email contains HTML (QR image + Accept/Decline buttons) inside `{{message}}`.
When the email arrives, the raw HTML source is shown instead of rendered content.

Cause: EmailJS **auto-escapes template variables by default** in the new editor.
Fix (dashboard, one time):
1. Go to https://dashboard.emailjs.com/admin/templates → edit `template_yjx0xlw`
2. Click the `{{message}}` variable inside the HTML content
3. Toggle **"Disable HTML escaping"** (or "Allow HTML") ON
4. Save and resend the invitation

Alternative if that toggle is unavailable: switch the template content mode to
"HTML" (Editor Mode: Code/HTML) so the body is treated as HTML.

The code already sends both `message` (HTML body) and `message_html` (same HTML)
in `template_params`, so either `{{message}}` or `{{message_html}}` works once
escaping is off.

## Invitation Emails (RSVP-aware)
- QR Pass image: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=<qrPayload>`
- Accept/Decline links point to the Firebase Hosting RSVP page:
  `https://hotel-management-system-c3526.web.app/rsvp/?invitationId=...&eventId=...&response=accepted|declined&token=...`
- RSVP token = `sha256(RSVP_SIGNING_SECRET + invitationId + ':' + response)` (hex)
  - `RSVP_SIGNING_SECRET = "azure-horizon-demo-signing-secret-2026"`
  - Same secret used for QR payload signing (`sha256(secret + JSON.stringify(payload))`)
- Invitations are complimentary → `amount` is sent as `FREE`
- Implemented in `src/services/emailjs-service.ts` (`sendInviteeQREmail`).
  Test harness: `send_rsvp_test_email.js` (repo root).
