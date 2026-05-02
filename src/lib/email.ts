import { Resend } from 'resend'
import type { Shipment } from './supabase'

const resend = new Resend(process.env.RESEND_API_KEY)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const FROM = `${process.env.FROM_NAME || 'FreightFlow'} <${process.env.FROM_EMAIL || 'noreply@freightflow.app'}>`

// ─── NEW ARRIVAL EMAIL ────────────────────────────────────────────────────────
export async function sendArrivalEmail(shipment: Shipment) {
  const confirmUrl = `${APP_URL}/confirm/${shipment.consignee_token}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f9;margin:0;padding:32px 16px">
  <div style="max-width:580px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    
    <!-- Header -->
    <div style="background:#0f1b2d;padding:28px 32px;text-align:center">
      <div style="color:#3b82f6;font-size:22px;font-weight:700;letter-spacing:-0.5px">✈ FreightFlow</div>
      <div style="color:#94a3b8;font-size:13px;margin-top:4px">Import Management</div>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <h2 style="margin:0 0 8px;font-size:20px;color:#1e293b">Your shipment has arrived 📦</h2>
      <p style="color:#64748b;margin:0 0 24px;font-size:14px;line-height:1.6">
        Dear <strong>${shipment.client_name}</strong>,<br><br>
        A shipment addressed to you has arrived at our facility and is ready for customs processing. Please confirm your details so we can proceed without delay.
      </p>

      <!-- Shipment box -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px">
        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:12px">Shipment Details</div>
        <table style="width:100%;font-size:14px;border-collapse:collapse">
          <tr><td style="color:#64748b;padding:4px 0;width:140px">Reference</td><td style="color:#1e293b;font-weight:600">${shipment.file_number}</td></tr>
          ${shipment.awb ? `<tr><td style="color:#64748b;padding:4px 0">AWB</td><td style="color:#1e293b;font-family:monospace">${shipment.awb}</td></tr>` : ''}
          <tr><td style="color:#64748b;padding:4px 0">Supplier</td><td style="color:#1e293b">${shipment.supplier}</td></tr>
          ${shipment.packages ? `<tr><td style="color:#64748b;padding:4px 0">Packages</td><td style="color:#1e293b">${shipment.packages} pkg — ${shipment.weight_kg?.toLocaleString()} kg</td></tr>` : ''}
          ${shipment.arrival_date ? `<tr><td style="color:#64748b;padding:4px 0">Arrived</td><td style="color:#1e293b">${new Date(shipment.arrival_date).toLocaleDateString('fr-FR')}</td></tr>` : ''}
          ${shipment.agent ? `<tr><td style="color:#64748b;padding:4px 0">Agent</td><td style="color:#1e293b">${shipment.agent}</td></tr>` : ''}
        </table>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0">
        <a href="${confirmUrl}" style="background:#3b82f6;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block">
          ✅ Confirm My Shipment Details
        </a>
        <div style="margin-top:10px;font-size:12px;color:#94a3b8">
          Or copy this link: <a href="${confirmUrl}" style="color:#3b82f6">${confirmUrl}</a>
        </div>
      </div>

      <!-- What's needed -->
      <div style="border-left:3px solid #3b82f6;padding-left:16px;margin:24px 0">
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:8px">What we need from you:</div>
        <ul style="font-size:13px;color:#64748b;margin:0;padding-left:16px;line-height:1.8">
          <li>Confirm your delivery address</li>
          <li>Provide EORI and VAT number</li>
          <li>Sign and return the customs mandate</li>
        </ul>
      </div>

      <p style="font-size:13px;color:#94a3b8;margin-top:24px">
        ⚠️ Please respond within <strong>24 hours</strong> to avoid storage charges.<br>
        If you have questions, reply to this email or call us directly.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center">
      <div style="font-size:12px;color:#94a3b8">FreightFlow Import Management · France</div>
    </div>
  </div>
</body>
</html>`

  return resend.emails.send({
    from: FROM,
    to: shipment.client_email!,
    subject: `Your Shipment ${shipment.file_number} Has Arrived — Action Required`,
    html,
  })
}

// ─── DOCS REMINDER EMAIL ──────────────────────────────────────────────────────
export async function sendDocsReminderEmail(shipment: Shipment, missingDocs: string[]) {
  const confirmUrl = `${APP_URL}/confirm/${shipment.consignee_token}`

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f6f9;margin:0;padding:32px 16px">
  <div style="max-width:580px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#0f1b2d;padding:28px 32px;text-align:center">
      <div style="color:#f59e0b;font-size:22px;font-weight:700">⚠️ FreightFlow</div>
      <div style="color:#94a3b8;font-size:13px;margin-top:4px">Documents Required</div>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 16px;font-size:18px;color:#1e293b">Missing Documents — ${shipment.file_number}</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.6;margin-bottom:20px">
        Dear ${shipment.client_name},<br><br>
        We are still waiting for the following documents to proceed with customs clearance for your shipment from <strong>${shipment.supplier}</strong>:
      </p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin-bottom:24px">
        ${missingDocs.map(d => `<div style="color:#c2410c;font-size:13px;padding:3px 0">❌ ${d}</div>`).join('')}
      </div>
      <div style="text-align:center">
        <a href="${confirmUrl}" style="background:#f59e0b;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">
          Upload Documents Now
        </a>
      </div>
    </div>
  </div>
</body>
</html>`

  return resend.emails.send({
    from: FROM,
    to: shipment.client_email!,
    subject: `⚠️ Documents Required — ${shipment.file_number} | ${shipment.supplier}`,
    html,
  })
}

// ─── CUSTOMS CLEARED EMAIL ────────────────────────────────────────────────────
export async function sendCustomsClearedEmail(shipment: Shipment) {
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f6f9;margin:0;padding:32px 16px">
  <div style="max-width:580px;margin:0 auto;background:white;border-radius:12px;overflow:hidden">
    <div style="background:#0f1b2d;padding:28px 32px;text-align:center">
      <div style="color:#22c55e;font-size:22px;font-weight:700">✅ FreightFlow</div>
    </div>
    <div style="padding:32px">
      <h2 style="color:#1e293b">Customs Cleared — ${shipment.file_number}</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.6">
        Dear ${shipment.client_name},<br><br>
        Great news! Your shipment from <strong>${shipment.supplier}</strong> has been cleared through customs and is now ready for delivery.
        ${shipment.delivery_address ? `<br><br>Delivery address on file:<br><strong>${shipment.delivery_address}</strong>` : ''}
        <br><br>Our team will contact you to arrange delivery.
      </p>
    </div>
  </div>
</body>
</html>`

  return resend.emails.send({
    from: FROM,
    to: shipment.client_email!,
    subject: `✅ Customs Cleared — ${shipment.file_number} Ready for Delivery`,
    html,
  })
}
