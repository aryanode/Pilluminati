import { serverConfig } from '../config.ts';
import { logEvent, monitoringMetrics } from '../logger.ts';
import {
  evaluateProfileSchedule,
  type SchedulableDoseLog,
  type SchedulableHandoff,
  type SchedulableMedication,
  type ExistingAlertKey,
} from '../utils/schedulerLogic.ts';
import { generateServerId } from '../utils/validation.ts';
import type { VerifiedClientCaller } from '../verifyClientToken.ts';
import { authorizeProfileAccess, type AuthoritativeProfile } from './authzService.ts';
import {
  commitFirestoreWrites,
  queryFirestoreCollection,
  SERVER_TIMESTAMP,
} from './firestoreRest.ts';
import { dispatchCareAlert } from './notificationService.ts';

interface RegisteredSession {
  uid: string;
  email?: string;
  idToken: string;
  emailVerified: boolean;
  profileIds: Set<string>;
  lastSeenMs: number;
  expiresAtMs: number;
}

const activeSessions = new Map<string, RegisteredSession>();
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let lastIntervalTickAt: string | null = null;
let lastTickResultSummary = 'Scheduler initialized; awaiting first tick or active session.';

export function registerActiveSession(
  caller: VerifiedClientCaller,
  profileId?: string,
): void {
  const existing = activeSessions.get(caller.uid);
  const profileIds = existing ? existing.profileIds : new Set<string>();
  if (profileId) {
    profileIds.add(profileId);
  }
  activeSessions.set(caller.uid, {
    uid: caller.uid,
    email: caller.email,
    idToken: caller.idToken,
    emailVerified: caller.emailVerified,
    profileIds,
    lastSeenMs: Date.now(),
    // Firebase ID tokens remain valid for ~55 minutes safely
    expiresAtMs: Date.now() + 50 * 60 * 1000,
  });
}

export function unregisterSession(uid: string): void {
  activeSessions.delete(uid);
}

export function getSchedulerStatus() {
  const now = Date.now();
  let activeSessionCount = 0;
  for (const [uid, sess] of activeSessions.entries()) {
    if (sess.expiresAtMs <= now) {
      activeSessions.delete(uid);
    } else {
      activeSessionCount += 1;
    }
  }

  return {
    running: Boolean(schedulerTimer),
    intervalSeconds: Math.round(serverConfig.schedulerIntervalMs / 1000),
    activeAuthenticatedSessions: activeSessionCount,
    totalTicksExecuted: monitoringMetrics.schedulerTicks,
    lastTickAt: lastIntervalTickAt,
    lastSummary: lastTickResultSummary,
    sessionScope: 'active_sessions_only' as const,
    scopeNote:
      'Live monitoring runs every 60s for active authenticated clinical sessions and on-demand checks using Firebase Auth and Firestore Security Rules.',
  };
}

export async function runSchedulerForProfile(params: {
  profile: AuthoritativeProfile;
  uid: string;
  callerEmail?: string;
  idToken: string;
  triggerType: 'interval' | 'manual';
  escalationGraceMinutes?: number;
}): Promise<{
  runId: string;
  schedulesChecked: number;
  overdueFound: number;
  alertsCreated: number;
  handoffsEscalated: number;
  summary: string;
}> {
  const { profile, uid, callerEmail, idToken, triggerType } = params;
  const now = new Date();
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();

  const [medsRaw, logsRaw, handoffsRaw, alertsRaw] = await Promise.all([
    queryFirestoreCollection<Record<string, unknown>>(
      'medications',
      [
        { field: 'profileId', op: 'EQUAL', value: profile.id },
        { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: uid },
      ],
      idToken,
    ),
    queryFirestoreCollection<Record<string, unknown>>(
      'adherenceRecords',
      [
        { field: 'profileId', op: 'EQUAL', value: profile.id },
        { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: uid },
      ],
      idToken,
    ),
    queryFirestoreCollection<Record<string, unknown>>(
      'caregiverAvailability',
      [
        { field: 'profileId', op: 'EQUAL', value: profile.id },
        { field: 'authorizedUids', op: 'ARRAY_CONTAINS', value: uid },
      ],
      idToken,
    ),
    queryFirestoreCollection<Record<string, unknown>>(
      'alerts',
      [
        { field: 'profileId', op: 'EQUAL', value: profile.id },
        { field: 'authorizedUids', op: 'ARRAY_CONTAINS', value: uid },
      ],
      idToken,
    ),
  ]);

  // Fetch scheduledTime(s) from medicationSchedules
  const schedulesRaw = await queryFirestoreCollection<Record<string, unknown>>(
    'medicationSchedules',
    [
      { field: 'profileId', op: 'EQUAL', value: profile.id },
      { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: uid },
    ],
    idToken,
  );

  const medications: SchedulableMedication[] = medsRaw.map((m) => {
    const medScheds = schedulesRaw.filter((s) => String(s.medicationId) === m.id);
    const rawTimes = Array.isArray(m.scheduledTimes)
      ? m.scheduledTimes.map(String)
      : medScheds
          .map((s) => (typeof s.scheduledTime === 'string' ? s.scheduledTime : ''))
          .filter(Boolean);
    const primaryTime = rawTimes[0] || '08:00';
    return {
      id: m.id,
      name: String(m.name || ''),
      dosage: String(m.dosage || ''),
      scheduledTime: primaryTime,
      scheduledTimes: rawTimes.length > 0 ? rawTimes : [primaryTime],
      frequency:
        typeof m.frequency === 'string'
          ? (m.frequency as SchedulableMedication['frequency'])
          : 'once_daily',
      weekdays: Array.isArray(m.weekdays) ? m.weekdays.map(Number) : undefined,
      customIntervalDays:
        typeof m.customIntervalDays === 'number' ? m.customIntervalDays : undefined,
      startDate: typeof m.startDate === 'string' ? m.startDate : undefined,
      endDate: typeof m.endDate === 'string' ? m.endDate : undefined,
      timezone: typeof m.timezone === 'string' ? m.timezone : undefined,
      gracePeriodMinutes:
        typeof m.gracePeriodMinutes === 'number' ? m.gracePeriodMinutes : undefined,
      missedAfterMinutes:
        typeof m.missedAfterMinutes === 'number' ? m.missedAfterMinutes : undefined,
      active: Boolean(m.active ?? true),
      discontinued: Boolean(m.discontinued ?? false),
    };
  });

  const doseLogs: SchedulableDoseLog[] = logsRaw.map((l) => ({
    medicationId: String(l.medicationId),
    scheduledDate: String(l.scheduledDate || ''),
    scheduledTime: typeof l.scheduledTime === 'string' ? l.scheduledTime : undefined,
    status: (l.status as SchedulableDoseLog['status']) || 'pending',
  }));

  const handoffs: SchedulableHandoff[] = handoffsRaw.map((h) => ({
    id: h.id,
    fromCaregiver: String(h.fromCaregiver || ''),
    toCaregiver: String(h.toCaregiver || ''),
    shiftWindow: String(h.shiftWindow || ''),
    status: (h.status as SchedulableHandoff['status']) || 'handed_off',
    createdAtIso: typeof h.createdAt === 'string' ? h.createdAt : new Date().toISOString(),
  }));

  const existingAlerts: ExistingAlertKey[] = alertsRaw.map((a) => ({
    dedupeKey: typeof a.dedupeKey === 'string' ? a.dedupeKey : undefined,
    resolved: Boolean(a.resolved ?? false),
  }));

  const evalResult = evaluateProfileSchedule({
    profileId: profile.id,
    patientName: profile.fullName,
    todayDate,
    nowMinutesOfDay,
    nowEpochMs: now.getTime(),
    escalationGraceMinutes: params.escalationGraceMinutes ?? 30,
    handoffEscalationMinutes: 60,
    medications,
    doseLogs,
    handoffs,
    existingAlerts,
  });

  let alertsCreated = 0;
  for (const candidate of evalResult.candidates) {
    await dispatchCareAlert({
      profile,
      idToken,
      callerUid: uid,
      callerEmail,
      severity: candidate.severity,
      title: candidate.title,
      detail: candidate.detail,
      sourceType: candidate.sourceType,
      dedupeKey: candidate.dedupeKey,
    });
    alertsCreated += 1;
  }

  const runId = generateServerId('srun');
  const summary = `Checked ${evalResult.schedulesChecked} active medication(s); found ${evalResult.overdueFound} overdue dose(s), ${evalResult.handoffsEscalated} overdue Care Relay(s), dispatched ${alertsCreated} alert(s).`;

  await commitFirestoreWrites(
    [
      {
        type: 'create',
        collection: 'schedulerRuns',
        docId: runId,
        data: {
          id: runId,
          profileId: profile.id,
          ownerUid: profile.ownerUid,
          authorizedUids: profile.authorizedUids,
          triggeredByUid: uid,
          triggerType,
          schedulesChecked: evalResult.schedulesChecked,
          overdueFound: evalResult.overdueFound,
          alertsCreated,
          handoffsEscalated: evalResult.handoffsEscalated,
          summary: summary.slice(0, 400),
          createdAt: SERVER_TIMESTAMP,
        },
      },
    ],
    idToken,
  );

  logEvent('info', 'scheduler_profile_evaluated', {
    uid,
    meta: {
      profileId: profile.id,
      runId,
      triggerType,
      schedulesChecked: evalResult.schedulesChecked,
      overdueFound: evalResult.overdueFound,
      alertsCreated,
    },
  });

  return {
    runId,
    schedulesChecked: evalResult.schedulesChecked,
    overdueFound: evalResult.overdueFound,
    alertsCreated,
    handoffsEscalated: evalResult.handoffsEscalated,
    summary,
  };
}

async function runBackgroundTick(): Promise<void> {
  const now = Date.now();
  monitoringMetrics.schedulerTicks += 1;
  lastIntervalTickAt = new Date(now).toISOString();

  let evaluated = 0;
  let alerts = 0;

  for (const [uid, sess] of activeSessions.entries()) {
    if (sess.expiresAtMs <= now || !sess.emailVerified) {
      if (sess.expiresAtMs <= now) activeSessions.delete(uid);
      continue;
    }
    for (const profileId of sess.profileIds) {
      try {
        const { profile, role } = await authorizeProfileAccess({
          profileId,
          uid,
          idToken: sess.idToken,
          minLevel: 'clinical',
        });
        if (role === 'patient' || role === 'caregiver') {
          const res = await runSchedulerForProfile({
            profile,
            uid,
            callerEmail: sess.email,
            idToken: sess.idToken,
            triggerType: 'interval',
          });
          evaluated += 1;
          alerts += res.alertsCreated;
        }
      } catch (err) {
        logEvent('warn', 'scheduler_tick_profile_skipped', {
          uid,
          meta: {
            profileId,
            reason: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }

  lastTickResultSummary = `Tick #${monitoringMetrics.schedulerTicks}: evaluated ${evaluated} active clinical profile(s), dispatched ${alerts} alert(s).`;
}

export function startServerScheduler(): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    void runBackgroundTick();
  }, serverConfig.schedulerIntervalMs);
  logEvent('info', 'scheduler_started', {
    meta: { intervalMs: serverConfig.schedulerIntervalMs },
  });
}
