/**
 * EmailJS Client Service for Azure Horizon Resort
 * Public Key: e9wHktkV2OU_QMaYq
 * Private Key: MbOqjaY8NL-yqLuQFhBmX
 * Service ID: service_jdrtevg
 * Template ID: template_yjx0xlw
 */

export interface EmailJSNotificationParams {
  to_email: string;
  name: string;
  subject_line: string;
  status_label: 'APPROVED' | 'DECLINED' | 'PENDING' | 'CONFIRMED' | 'PAID' | 'INFO';
  status_color?: string;
  message: string;
  detail_rows?: string;
  amount?: string;
  reference_id: string;
  time?: string;
  cta_text?: string;
  cta_link?: string;
  template_id?: string;
}

const EMAILJS_PUBLIC_KEY = 'e9wHktkV2OU_QMaYq';
const EMAILJS_PRIVATE_KEY = process.env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY || '';
const EMAILJS_SERVICE_ID = 'service_jdrtevg';
export const DEFAULT_TEMPLATE_ID = 'template_yjx0xlw';

import * as Crypto from 'expo-crypto';

const RSVP_SIGNING_SECRET = 'azure-horizon-demo-signing-secret-2026';
const RSVP_SITE_BASE = 'https://hotel-management-system-c3526.web.app/rsvp/';

async function rsvpLink(invitationId: string, eventId: string, response: 'accepted' | 'declined'): Promise<string> {
  const token = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    RSVP_SIGNING_SECRET + invitationId + ':' + response
  );
  return `${RSVP_SITE_BASE}?invitationId=${encodeURIComponent(invitationId)}&eventId=${encodeURIComponent(eventId)}&response=${response}&token=${token}`;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  APPROVED: '#16a34a',
  CONFIRMED: '#16a34a',
  PAID: '#16a34a',
  DECLINED: '#dc2626',
  PENDING: '#c9a227',
  INFO: '#1e3a5f',
};

export const sendEmailJSNotification = async (params: EmailJSNotificationParams): Promise<boolean> => {
  try {
    const statusColor = params.status_color || STATUS_COLOR_MAP[params.status_label] || '#c9a227';
    const nowStr = params.time || new Date().toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
    const activeTemplateId = params.template_id || DEFAULT_TEMPLATE_ID;

    // Strip raw HTML tags from detail_rows so clean text renders inside the box
    const cleanDetailRows = (params.detail_rows || '')
      .replace(/<[^>]*>?/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const payload = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: activeTemplateId,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: {
        title: params.subject_line,
        to_email: params.to_email,
        email: params.to_email,
        name: params.name,
        STATUS_LABEL: params.status_label,
        status_label: params.status_label,
        status_color: statusColor,
        subject_line: params.subject_line,
        message: params.message,
        message_html: params.message,
        detail_rows: cleanDetailRows,
        amount: params.amount || '',
        reference_id: params.reference_id,
        time: nowStr,
        cta_text: params.cta_text || 'View in Azure Horizon App',
        cta_link: params.cta_link || 'https://azurehorizon.com',
      },
    };

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`✅ EmailJS: Email delivered to ${params.to_email}`);
      return true;
    } else {
      const errText = await res.text();
      console.warn(`⚠️ EmailJS response error (${res.status}):`, errText);
      return false;
    }
  } catch (err) {
    console.warn('⚠️ EmailJS send error:', err);
    return false;
  }
};

// Dedicated RSVP invitation template (dashboard: template_poopd18)
const RSVP_TEMPLATE_ID = 'template_poopd18';

// QR Pass invitation email with RSVP buttons (uses dedicated RSVP template)
export const sendInviteeQREmail = async (params: {
  to_email: string;
  to_name: string;
  event_title: string;
  event_date: string;
  venue_name: string;
  qr_code: string;
}): Promise<boolean> => {
  // The QR payload is a signed JSON string. Render it as a scannable QR
  // image inside the email instead of dumping the raw JSON as text.
  let passCode = 'AZH-PASS';
  let invitationId = '';
  let eventId = '';
  try {
    const parsed = JSON.parse(params.qr_code);
    if (parsed?.invitationId) {
      passCode = `AZH-${parsed.invitationId.slice(0, 8).toUpperCase()}`;
    }
    invitationId = parsed?.invitationId || '';
    eventId = parsed?.eventId || '';
  } catch {
    // keep fallback
  }
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(params.qr_code)}`;
  const acceptLink = invitationId && eventId ? await rsvpLink(invitationId, eventId, 'accepted') : '';
  const declineLink = invitationId && eventId ? await rsvpLink(invitationId, eventId, 'declined') : '';

  try {
    const payload = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: RSVP_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: params.to_email,
        email: params.to_email,
        name: params.to_name,
        event_title: params.event_title,
        venue_name: params.venue_name,
        event_date: params.event_date,
        qr_image_url: qrImageUrl,
        rsvp_accept_url: acceptLink,
        rsvp_decline_url: declineLink,
        reference_id: passCode,
        time: new Date().toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }),
      },
    };

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`✅ EmailJS: RSVP invitation delivered to ${params.to_email}`);
      return true;
    } else {
      const errText = await res.text();
      console.warn(`⚠️ EmailJS RSVP response error (${res.status}):`, errText);
      return false;
    }
  } catch (err) {
    console.warn('⚠️ EmailJS RSVP send error:', err);
    return false;
  }
};

// Helper compatibility for invoice email dispatch
export const sendInvoiceEmailViaEmailJS = async (params: {
  to_email: string;
  to_name: string;
  subject: string;
  invoice_number: string;
  amount: number;
  type: string;
  message?: string;
}): Promise<boolean> => {
  return sendEmailJSNotification({
    to_email: params.to_email,
    name: params.to_name,
    subject_line: params.subject,
    status_label: 'PAID',
    message: params.message || `Official Azure Horizon Resort Invoice #${params.invoice_number} for R ${Number(params.amount).toLocaleString()}.`,
    detail_rows: `Invoice Number: #${params.invoice_number} | Invoice Type: ${params.type}`,
    amount: `R ${Number(params.amount).toLocaleString()}`,
    reference_id: params.invoice_number,
    cta_text: 'View Invoice in App',
  });
};
