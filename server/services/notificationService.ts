import { Resend } from 'resend';
import type { NotificationCapabilityReport } from '../../src/types/pilluminati.ts';
import { serverConfig } from '../config.ts';
import { logEvent, monitoringMetrics } from '../logger.ts';
import { generateServerId } from '../utils/validation.ts';
import type { AuthoritativeProfile } from './authzService.ts';
import {
  commitFirestoreWrites,
  queryFirestoreCollection,
  SERVER_TIMESTAMP,
} from './firestoreRest.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getNotificationCapabilityReport(
  resendApiKey: string | null = serverConfig.resendApiKey,
): NotificationCapabilityReport {
  return {
    inAppFirestore: {
      status: 'delivered',
      detail:
        'Persisted to Firestore alerts & notificationDeliveries for all authorized Care Circle members.',
    },
    emailChannel: {
      provider: 'resend',
      status: resendApiKey ? 'configured' : 'blocked',
      detail: resendApiKey
        ? 'Resend email delivery is active for verified Care Circle recipients.'
        : 'Blocked: RESEND_API_KEY is not configured in server environment.',
    },
  };
}

export function dedupeRecipientEmails(
  emails: Array<string | undefined | null>,
  max = 20,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim().toLowerCase();
    if (!clean || !EMAIL_RE.test(clean) || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildAlertEmailPayload(params: {
  patientName: string;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  detail: string;
  sourceType: 'manual' | 'scheduler_dose' | 'scheduler_relay';
}): { subject: string; text: string; html: string } {
  const severityTag = params.severity.toUpperCase();
  const subject = `[PILLUMINATI · ${severityTag}] ${params.title}`.slice(0, 180);
  const text = [
    `PILLUMINATI Care Alert (${severityTag})`,
    `Patient: ${params.patientName}`,
    `Source: ${params.sourceType}`,
    '',
    params.title,
    params.detail,
    '',
    'Open PILLUMINATI to review or resolve this alert with your Care Circle.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #10373A; max-width: 560px; margin: 0 auto; padding: 24px; background: #FAF9F6; border: 1px solid #CBE4D8; border-radius: 12px;">
      <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: #5D4A96; text-transform: uppercase;">PILLUMINATI · ${escapeHtml(severityTag)} ALERT</p>
      <h2 style="margin: 0 0 12px; font-size: 20px; color: #10373A;">${escapeHtml(params.title)}</h2>
      <p style="margin: 0 0 8px; font-size: 14px; color: #2C5E63;"><strong>Patient:</strong> ${escapeHtml(params.patientName)}</p>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #10373A;">${escapeHtml(params.detail)}</p>
      <p style="margin: 0; font-size: 12px; color: #4B7478;">Open your PILLUMINATI Care Circle dashboard to review and resolve this alert.</p>
    </div>
  `.trim();

  return { subject, text, html };
}

async function resolveCareCircleRecipientEmails(params: {
  profile: AuthoritativeProfile;
  idToken: string;
  callerUid?: string;
  callerEmail?: string;
}): Promise<string[]> {
  const candidates: Array<string | undefined | null> = [params.callerEmail];

  if (params.callerUid) {
    try {
      const invites = await queryFirestoreCollection<Record<string, unknown>>(
        'invitations',
        [
          { field: 'profileId', op: 'EQUAL', value: params.profile.id },
          { field: 'issuedByUid', op: 'EQUAL', value: params.callerUid },
        ],
        params.idToken,
      );
      for (const inv of invites) {
        if (inv.status === 'accepted' && typeof inv.targetEmail === 'string') {
          candidates.push(inv.targetEmail);
        }
      }
    } catch {
      // Non-owners cannot list invitations they did not issue; fall back to callerEmail
    }
  }

  return dedupeRecipientEmails(candidates);
}

export async function dispatchCareAlert(params: {
  profile: AuthoritativeProfile;
  idToken: string;
  callerUid?: string;
  callerEmail?: string;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  detail: string;
  sourceType: 'manual' | 'scheduler_dose' | 'scheduler_relay';
  dedupeKey?: string;
}): Promise<{
  alertId: string;
  deliveryReport: NotificationCapabilityReport;
}> {
  const alertId = generateServerId('alrt');
  const inAppDeliveryId = generateServerId('deliv');
  const emailDeliveryId = generateServerId('deliv');
  const cap = getNotificationCapabilityReport();

  const initialDeliveryNote = serverConfig.resendApiKey
    ? 'In-app Firestore alert delivered; attempting Resend email notification.'
    : 'In-app Firestore alert delivered. Email delivery blocked (RESEND_API_KEY not configured).';

  await commitFirestoreWrites(
    [
      {
        type: 'create',
        collection: 'alerts',
        docId: alertId,
        data: {
          id: alertId,
          profileId: params.profile.id,
          ownerUid: params.profile.ownerUid,
          authorizedUids: params.profile.authorizedUids,
          patientName: params.profile.fullName.slice(0, 120),
          severity: params.severity,
          title: params.title.slice(0, 140),
          detail: params.detail.slice(0, 400),
          resolved: false,
          sourceType: params.sourceType,
          deliveryChannel: 'in_app_firestore',
          deliveryStatus: 'delivered',
          deliveryNote: initialDeliveryNote.slice(0, 300),
          ...(params.dedupeKey ? { dedupeKey: params.dedupeKey.slice(0, 160) } : {}),
          createdAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
        },
      },
      {
        type: 'create',
        collection: 'notificationDeliveries',
        docId: inAppDeliveryId,
        data: {
          id: inAppDeliveryId,
          profileId: params.profile.id,
          ownerUid: params.profile.ownerUid,
          authorizedUids: params.profile.authorizedUids,
          alertId,
          channel: 'in_app_firestore',
          deliveryStatus: 'delivered',
          statusDetail: `Delivered in-app alert "${params.title}" to ${params.profile.authorizedUids.length} Care Circle member(s).`.slice(
            0,
            300,
          ),
          createdAt: SERVER_TIMESTAMP,
        },
      },
    ],
    params.idToken,
  );

  let emailStatus: 'delivered' | 'blocked' = 'blocked';
  let emailDetail = cap.emailChannel.detail;

  if (serverConfig.resendApiKey) {
    const recipients = await resolveCareCircleRecipientEmails({
      profile: params.profile,
      idToken: params.idToken,
      callerUid: params.callerUid,
      callerEmail: params.callerEmail,
    });

    if (recipients.length === 0) {
      emailStatus = 'blocked';
      emailDetail =
        'Blocked: No verified Care Circle recipient email address was available for this alert.';
    } else {
      try {
        const resend = new Resend(serverConfig.resendApiKey);
        const payload = buildAlertEmailPayload({
          patientName: params.profile.fullName,
          severity: params.severity,
          title: params.title,
          detail: params.detail,
          sourceType: params.sourceType,
        });
        const { data, error } = await resend.emails.send({
          from: serverConfig.resendFromEmail,
          to: recipients,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
        });
        if (error) {
          emailStatus = 'blocked';
          emailDetail = `Resend email failed: ${error.message}`;
          logEvent('warn', 'resend_email_failed', {
            uid: params.callerUid || params.profile.ownerUid,
            meta: { profileId: params.profile.id, alertId, error: error.message },
          });
        } else {
          emailStatus = 'delivered';
          emailDetail = `Delivered email alert via Resend (${data?.id || 'sent'}) to ${recipients.length} Care Circle recipient(s).`;
        }
      } catch (err) {
        emailStatus = 'blocked';
        const msg = err instanceof Error ? err.message : String(err);
        emailDetail = `Resend email failed: ${msg}`;
        logEvent('warn', 'resend_email_exception', {
          uid: params.callerUid || params.profile.ownerUid,
          meta: { profileId: params.profile.id, alertId, error: msg },
        });
      }
    }
  }

  await commitFirestoreWrites(
    [
      {
        type: 'create',
        collection: 'notificationDeliveries',
        docId: emailDeliveryId,
        data: {
          id: emailDeliveryId,
          profileId: params.profile.id,
          ownerUid: params.profile.ownerUid,
          authorizedUids: params.profile.authorizedUids,
          alertId,
          channel: 'email',
          deliveryStatus: emailStatus,
          statusDetail: emailDetail.slice(0, 300),
          createdAt: SERVER_TIMESTAMP,
        },
      },
    ],
    params.idToken,
  );

  monitoringMetrics.alertsDispatched += 1;

  logEvent('info', 'alert_dispatched', {
    uid: params.callerUid || params.profile.ownerUid,
    meta: {
      profileId: params.profile.id,
      alertId,
      sourceType: params.sourceType,
      inAppStatus: 'delivered',
      emailStatus,
    },
  });

  return { alertId, deliveryReport: cap };
}
