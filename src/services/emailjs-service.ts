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
const EMAILJS_PRIVATE_KEY = 'MbOqjaY8NL-yqLuQFhBmX';
const EMAILJS_SERVICE_ID = 'service_jdrtevg';
export const DEFAULT_TEMPLATE_ID = 'template_yjx0xlw';

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

// Legacy helper compatibility for QR invitations
export const sendInviteeQREmail = async (params: {
  to_email: string;
  to_name: string;
  event_title: string;
  event_date: string;
  venue_name: string;
  qr_code: string;
}): Promise<boolean> => {
  return sendEmailJSNotification({
    to_email: params.to_email,
    name: params.to_name,
    subject_line: `Invitation Pass: ${params.event_title}`,
    status_label: 'CONFIRMED',
    message: `You are cordially invited to ${params.event_title} at ${params.venue_name} on ${params.event_date}. Please present your unique QR Pass: ${params.qr_code} upon entry.`,
    detail_rows: `Event: ${params.event_title} | Venue: ${params.venue_name} | Pass Code: ${params.qr_code}`,
    reference_id: params.qr_code,
    cta_text: 'View Pass in App',
  });
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
