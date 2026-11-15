import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFirebaseApiKey,
  resolveOptionalSecret,
} from '../config.ts';
import {
  buildAlertEmailPayload,
  dedupeRecipientEmails,
  getNotificationCapabilityReport,
} from './notificationService.ts';

test('getNotificationCapabilityReport reports Resend email status honestly without SMS or Push', () => {
  const unconfigured = getNotificationCapabilityReport(null);
  assert.equal(unconfigured.inAppFirestore.status, 'delivered');
  assert.equal(unconfigured.emailChannel.provider, 'resend');
  assert.equal(unconfigured.emailChannel.status, 'blocked');
  assert.match(unconfigured.emailChannel.detail, /RESEND_API_KEY/);
  assert.equal('externalChannels' in unconfigured, false);

  const configured = getNotificationCapabilityReport('re_test_12345');
  assert.equal(configured.emailChannel.provider, 'resend');
  assert.equal(configured.emailChannel.status, 'configured');
});

test('dedupeRecipientEmails normalizes case, filters invalid emails, and enforces max bound', () => {
  const result = dedupeRecipientEmails(
    [
      'Caregiver@Example.com ',
      'caregiver@example.com',
      'invalid-email',
      '',
      null,
      undefined,
      'family@example.com',
      'patient@example.com',
    ],
    2,
  );
  assert.deepEqual(result, ['caregiver@example.com', 'family@example.com']);
});

test('buildAlertEmailPayload formats subject, plain text, and escapes HTML', () => {
  const payload = buildAlertEmailPayload({
    patientName: 'Eleanor <Vance>',
    severity: 'urgent',
    title: 'Missed Dose <Lisinopril>',
    detail: 'Morning dose & check-in unconfirmed.',
    sourceType: 'scheduler_dose',
  });

  assert.equal(payload.subject, '[PILLUMINATI · URGENT] Missed Dose <Lisinopril>');
  assert.match(payload.text, /Patient: Eleanor <Vance>/);
  assert.match(payload.html, /Eleanor &lt;Vance&gt;/);
  assert.match(payload.html, /Missed Dose &lt;Lisinopril&gt;/);
  assert.match(payload.html, /Morning dose &amp; check-in unconfirmed\./);
});

test('resolveFirebaseApiKey prefers FIREBASE_API_KEY env override and falls back cleanly', () => {
  assert.equal(
    resolveFirebaseApiKey('AIzaCustomEnvKey', 'AIzaFallbackKey'),
    'AIzaCustomEnvKey',
  );
  assert.equal(
    resolveFirebaseApiKey('MY_FIREBASE_API_KEY', 'AIzaFallbackKey'),
    'AIzaFallbackKey',
  );
  assert.equal(
    resolveFirebaseApiKey('  ', 'AIzaFallbackKey'),
    'AIzaFallbackKey',
  );
  assert.equal(resolveOptionalSecret('re_live_abc', 'MY_RESEND_API_KEY'), 're_live_abc');
  assert.equal(resolveOptionalSecret('MY_RESEND_API_KEY', 'MY_RESEND_API_KEY'), null);
});
