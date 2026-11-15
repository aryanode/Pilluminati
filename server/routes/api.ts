import { Router, type NextFunction, type Response } from 'express';
import QRCode from 'qrcode';
import { serverConfig } from '../config.ts';
import { getRecentLogs, logEvent, monitoringMetrics } from '../logger.ts';
import {
  requireAuth,
  requireProfileRole,
  requireVerifiedEmail,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { ApiError } from '../middleware/errorHandler.ts';
import {
  generateCareSummary,
  generateCompanionChatReply,
  getAiConfigurationStatus,
  scanPrescriptionImage,
} from '../services/aiService.ts';
import { authorizeProfileAccess } from '../services/authzService.ts';
import {
  commitFirestoreWrites,
  getFirestoreDoc,
  queryFirestoreCollection,
  SERVER_TIMESTAMP,
} from '../services/firestoreRest.ts';
import {
  dispatchCareAlert,
  getNotificationCapabilityReport,
} from '../services/notificationService.ts';
import {
  getSchedulerStatus,
  registerActiveSession,
  runSchedulerForProfile,
  unregisterSession,
} from '../services/schedulerService.ts';
import {
  getZonedNowParts,
  inferTimeSlotFromTime,
} from '../../src/utils/medicationEngine.ts';
import {
  buildPublicEmergencyResponse,
  extractActiveEmergencyMedications,
} from '../utils/emergencySnapshot.ts';
import {
  assertNonEmptyString,
  assertStrongId,
  assertTokenId,
  generateServerId,
  validateAdherenceBody,
  validateAlertBody,
  validateAppointmentBody,
  validateCreateMedicationBody,
  validateDiscontinueMedicationBody,
  validateEmergencyTokenBody,
  validateHandoffBody,
  validatePrescriptionScanBody,
  validateUpdateAppointmentBody,
  validateUpdateMedicationBody,
} from '../utils/validation.ts';

export function createApiRouter(): Router {
  const router = Router();

  const asyncRoute =
    (
      fn: (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction,
      ) => Promise<void>,
    ) =>
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  // --- Health & Diagnostics ---
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'pilluminati',
      aiConfigured: Boolean(serverConfig.geminiApiKey),
      resendConfigured: Boolean(serverConfig.resendApiKey),
      firebaseMode: 'client-token-rest-plus-firestore-rules',
      scheduler: getSchedulerStatus(),
      notifications: getNotificationCapabilityReport(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get(
    '/monitoring/status',
    requireAuth,
    asyncRoute(async (req, res) => {
      registerActiveSession(req.caller!);
      res.json({
        metrics: monitoringMetrics,
        scheduler: getSchedulerStatus(),
        notifications: getNotificationCapabilityReport(),
        recentLogs: getRecentLogs(30),
      });
    }),
  );

  // --- Session Heartbeat for Active-Session Server Scheduler ---
  router.post(
    '/session/heartbeat',
    requireAuth,
    asyncRoute(async (req, res) => {
      const rawProfileId = req.body?.profileId;
      let profileId: string | undefined;
      if (typeof rawProfileId === 'string' && rawProfileId.trim()) {
        profileId = assertStrongId(rawProfileId, 'profileId');
        await authorizeProfileAccess({
          profileId,
          uid: req.caller!.uid,
          idToken: req.caller!.idToken,
          minLevel: 'member',
        });
      }
      registerActiveSession(req.caller!, profileId);
      res.json({
        registered: true,
        scheduler: getSchedulerStatus(),
      });
    }),
  );

  router.post(
    '/session/logout',
    requireAuth,
    asyncRoute(async (req, res) => {
      unregisterSession(req.caller!.uid);
      res.json({ ok: true });
    }),
  );


  // --- Medications ---
  router.post(
    '/medications',
    requireAuth,
    requireVerifiedEmail,
    requireProfileRole('clinical', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const profile = req.authorizedProfile!;
      const input = validateCreateMedicationBody(req.body ?? {});
      registerActiveSession(caller, profile.id);

      const medId = generateServerId('med');
      const changeId = generateServerId('mchg');
      const clinicalUids = Array.from(
        new Set([profile.ownerUid, ...profile.caregiverUids]),
      );
      const actorName = (
        caller.name ||
        caller.email?.split('@')[0] ||
        'Care Team Member'
      ).slice(0, 120);
      const lastChangeNote = `Added ${input.name} (${input.dosage}) · ${input.scheduledTimes.join(', ')}`.slice(0, 240);

      const scheduleWrites = input.scheduledTimes.map((scheduledTime) => {
        const scheduleId = generateServerId('sched');
        const slot =
          input.scheduledTimes.length === 1
            ? input.timeSlot
            : inferTimeSlotFromTime(scheduledTime);
        return {
          scheduleId,
          write: {
            type: 'create' as const,
            collection: 'medicationSchedules',
            docId: scheduleId,
            data: {
              id: scheduleId,
              profileId: profile.id,
              medicationId: medId,
              ownerUid: profile.ownerUid,
              authorizedUids: profile.authorizedUids,
              clinicalUids,
              timeSlot: slot,
              scheduledTime,
              frequency: input.frequency,
              weekdays: input.weekdays,
              customIntervalDays: input.customIntervalDays,
              ...(input.startDate ? { startDate: input.startDate } : {}),
              ...(input.endDate ? { endDate: input.endDate } : {}),
              timezone: input.timezone,
              active: input.active,
              discontinued: false,
              familyAllowed: profile.familyShowDetailedMeds,
              createdAt: SERVER_TIMESTAMP,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
        };
      });

      await commitFirestoreWrites(
        [
          {
            type: 'create',
            collection: 'medications',
            docId: medId,
            data: {
              id: medId,
              profileId: profile.id,
              ownerUid: profile.ownerUid,
              authorizedUids: profile.authorizedUids,
              clinicalUids,
              createdBy: caller.uid,
              name: input.name,
              dosage: input.dosage,
              dosageAmount: input.dosageAmount,
              dosageUnit: input.dosageUnit,
              frequency: input.frequency,
              scheduledTimes: input.scheduledTimes,
              weekdays: input.weekdays,
              customIntervalDays: input.customIntervalDays,
              ...(input.customScheduleNote ? { customScheduleNote: input.customScheduleNote } : {}),
              ...(input.startDate ? { startDate: input.startDate } : {}),
              ...(input.endDate ? { endDate: input.endDate } : {}),
              instructions: input.instructions,
              foodInstruction: input.foodInstruction,
              prescriber: input.prescriber,
              pillAppearance: input.pillAppearance,
              ...(input.prescriptionImageUrl ? { prescriptionImageUrl: input.prescriptionImageUrl } : {}),
              timezone: input.timezone,
              gracePeriodMinutes: input.gracePeriodMinutes,
              missedAfterMinutes: input.missedAfterMinutes,
              supplyDays: input.supplyDays,
              active: input.active,
              discontinued: false,
              lastChangeNote,
              familyAllowed: profile.familyShowDetailedMeds,
              createdAt: SERVER_TIMESTAMP,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
          ...scheduleWrites.map((s) => s.write),
          {
            type: 'create',
            collection: 'medicationChanges',
            docId: changeId,
            data: {
              id: changeId,
              profileId: profile.id,
              medicationId: medId,
              ownerUid: profile.ownerUid,
              authorizedUids: profile.authorizedUids,
              clinicalUids,
              medicationName: input.name,
              changeType: 'added',
              summary: lastChangeNote.slice(0, 300),
              changedByUid: caller.uid,
              changedByName: actorName,
              familyAllowed: profile.familyShowDetailedMeds,
              createdAt: SERVER_TIMESTAMP,
            },
          },
        ],
        caller.idToken,
      );

      logEvent('info', 'medication_created', {
        uid: caller.uid,
        requestId: req.requestId,
        meta: {
          profileId: profile.id,
          medId,
          scheduleCount: scheduleWrites.length,
        },
      });

      res.status(201).json({
        id: medId,
        scheduleId: scheduleWrites[0].scheduleId,
        scheduleIds: scheduleWrites.map((s) => s.scheduleId),
        role: req.derivedRole,
      });
    }),
  );

  router.patch(
    '/medications/:medId',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const medId = assertStrongId(req.params.medId, 'medId');
      const med = await getFirestoreDoc<Record<string, unknown>>(
        'medications',
        medId,
        caller.idToken,
      );
      if (!med) {
        throw new ApiError(404, 'MEDICATION_NOT_FOUND', 'Medication not found.');
      }
      if (Boolean(med.discontinued)) {
        throw new ApiError(
          400,
          'MEDICATION_DISCONTINUED',
          'Discontinued medications cannot be edited to preserve historical clinical records.',
        );
      }

      const { profile } = await authorizeProfileAccess({
        profileId: String(med.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'clinical',
      });

      const input = validateUpdateMedicationBody(req.body ?? {});
      const clinicalUids = Array.from(
        new Set([profile.ownerUid, ...profile.caregiverUids]),
      );
      const existingScheds = await queryFirestoreCollection<Record<string, unknown>>(
        'medicationSchedules',
        [
          { field: 'profileId', op: 'EQUAL', value: profile.id },
          { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: caller.uid },
        ],
        caller.idToken,
      );
      const medScheds = existingScheds.filter(
        (s) => String(s.medicationId) === medId,
      );

      // Deduplicate & reconcile schedules cleanly by scheduledTime
      const reusedByTime = new Map<string, string>();
      const scheduleWrites: Array<
        | { type: 'update'; collection: string; docId: string; data: Record<string, unknown> }
        | { type: 'delete'; collection: string; docId: string }
        | { type: 'create'; collection: string; docId: string; data: Record<string, unknown> }
      > = [];

      for (const s of medScheds) {
        const sTime = String(s.scheduledTime || '');
        if (input.scheduledTimes.includes(sTime) && !reusedByTime.has(sTime)) {
          reusedByTime.set(sTime, String(s.id));
          const slot =
            input.scheduledTimes.length === 1
              ? input.timeSlot
              : inferTimeSlotFromTime(sTime);
          scheduleWrites.push({
            type: 'update',
            collection: 'medicationSchedules',
            docId: String(s.id),
            data: {
              timeSlot: slot,
              scheduledTime: sTime,
              frequency: input.frequency,
              weekdays: input.weekdays,
              customIntervalDays: input.customIntervalDays,
              startDate: input.startDate || '',
              endDate: input.endDate || '',
              timezone: input.timezone,
              active: input.active,
              discontinued: false,
              updatedAt: SERVER_TIMESTAMP,
            },
          });
        } else {
          scheduleWrites.push({
            type: 'delete',
            collection: 'medicationSchedules',
            docId: String(s.id),
          });
        }
      }

      for (const sTime of input.scheduledTimes) {
        if (reusedByTime.has(sTime)) continue;
        const scheduleId = generateServerId('sched');
        const slot =
          input.scheduledTimes.length === 1
            ? input.timeSlot
            : inferTimeSlotFromTime(sTime);
        scheduleWrites.push({
          type: 'create',
          collection: 'medicationSchedules',
          docId: scheduleId,
          data: {
            id: scheduleId,
            profileId: profile.id,
            medicationId: medId,
            ownerUid: profile.ownerUid,
            authorizedUids: profile.authorizedUids,
            clinicalUids,
            timeSlot: slot,
            scheduledTime: sTime,
            frequency: input.frequency,
            weekdays: input.weekdays,
            customIntervalDays: input.customIntervalDays,
            ...(input.startDate ? { startDate: input.startDate } : {}),
            ...(input.endDate ? { endDate: input.endDate } : {}),
            timezone: input.timezone,
            active: input.active,
            discontinued: false,
            familyAllowed: profile.familyShowDetailedMeds,
            createdAt: SERVER_TIMESTAMP,
            updatedAt: SERVER_TIMESTAMP,
          },
        });
      }

      const actorName = (
        caller.name ||
        caller.email?.split('@')[0] ||
        'Care Team Member'
      ).slice(0, 120);
      const lastChangeNote = (
        input.changeNote ||
        `Updated ${input.name} (${input.dosage}) · ${input.scheduledTimes.join(', ')}`
      ).slice(0, 240);
      const changeId = generateServerId('mchg');

      await commitFirestoreWrites(
        [
          {
            type: 'update',
            collection: 'medications',
            docId: medId,
            data: {
              name: input.name,
              dosage: input.dosage,
              dosageAmount: input.dosageAmount,
              dosageUnit: input.dosageUnit,
              frequency: input.frequency,
              scheduledTimes: input.scheduledTimes,
              weekdays: input.weekdays,
              customIntervalDays: input.customIntervalDays,
              customScheduleNote: input.customScheduleNote,
              startDate: input.startDate,
              endDate: input.endDate,
              instructions: input.instructions,
              foodInstruction: input.foodInstruction,
              prescriber: input.prescriber,
              pillAppearance: input.pillAppearance,
              prescriptionImageUrl: input.prescriptionImageUrl,
              timezone: input.timezone,
              gracePeriodMinutes: input.gracePeriodMinutes,
              missedAfterMinutes: input.missedAfterMinutes,
              supplyDays: input.supplyDays,
              active: input.active,
              lastChangeNote,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
          ...scheduleWrites,
          {
            type: 'create',
            collection: 'medicationChanges',
            docId: changeId,
            data: {
              id: changeId,
              profileId: profile.id,
              medicationId: medId,
              ownerUid: profile.ownerUid,
              authorizedUids: profile.authorizedUids,
              clinicalUids,
              medicationName: input.name,
              changeType: 'edited',
              summary: lastChangeNote.slice(0, 300),
              changedByUid: caller.uid,
              changedByName: actorName,
              familyAllowed: profile.familyShowDetailedMeds,
              createdAt: SERVER_TIMESTAMP,
            },
          },
        ],
        caller.idToken,
      );

      res.json({ id: medId, updated: true });
    }),
  );

  router.patch(
    '/medications/:medId/toggle',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const medId = assertStrongId(req.params.medId, 'medId');
      const med = await getFirestoreDoc<Record<string, unknown>>(
        'medications',
        medId,
        caller.idToken,
      );
      if (!med) {
        throw new ApiError(404, 'MEDICATION_NOT_FOUND', 'Medication not found.');
      }
      if (Boolean(med.discontinued)) {
        throw new ApiError(
          400,
          'MEDICATION_DISCONTINUED',
          'Discontinued medications cannot be resumed; add a new prescription to preserve history.',
        );
      }
      const { profile } = await authorizeProfileAccess({
        profileId: String(med.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'clinical',
      });

      const nextActive = !Boolean(med.active);
      const scheds = await queryFirestoreCollection<Record<string, unknown>>(
        'medicationSchedules',
        [
          { field: 'profileId', op: 'EQUAL', value: String(med.profileId) },
          { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: caller.uid },
        ],
        caller.idToken,
      );

      const actorName = (
        caller.name ||
        caller.email?.split('@')[0] ||
        'Care Team Member'
      ).slice(0, 120);
      const changeType = nextActive ? 'resumed' : 'paused';
      const changeSummary = `${nextActive ? 'Resumed' : 'Paused'} ${String(med.name || 'medication')} (${String(med.dosage || '')})`.slice(0, 240);
      const changeId = generateServerId('mchg');
      const clinicalUids = Array.from(
        new Set([profile.ownerUid, ...profile.caregiverUids]),
      );

      const writes = [
        {
          type: 'update' as const,
          collection: 'medications',
          docId: medId,
          data: {
            active: nextActive,
            lastChangeNote: changeSummary,
            updatedAt: SERVER_TIMESTAMP,
          },
        },
        ...scheds
          .filter((s) => String(s.medicationId) === medId)
          .map((s) => ({
            type: 'update' as const,
            collection: 'medicationSchedules',
            docId: s.id,
            data: { active: nextActive, updatedAt: SERVER_TIMESTAMP },
          })),
        {
          type: 'create' as const,
          collection: 'medicationChanges',
          docId: changeId,
          data: {
            id: changeId,
            profileId: profile.id,
            medicationId: medId,
            ownerUid: profile.ownerUid,
            authorizedUids: profile.authorizedUids,
            clinicalUids,
            medicationName: String(med.name || 'Medication').slice(0, 120),
            changeType,
            summary: changeSummary.slice(0, 300),
            changedByUid: caller.uid,
            changedByName: actorName,
            familyAllowed: profile.familyShowDetailedMeds,
            createdAt: SERVER_TIMESTAMP,
          },
        },
      ];

      await commitFirestoreWrites(writes, caller.idToken);
      res.json({ id: medId, active: nextActive });
    }),
  );

  router.patch(
    '/medications/:medId/discontinue',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const medId = assertStrongId(req.params.medId, 'medId');
      const med = await getFirestoreDoc<Record<string, unknown>>(
        'medications',
        medId,
        caller.idToken,
      );
      if (!med) {
        throw new ApiError(404, 'MEDICATION_NOT_FOUND', 'Medication not found.');
      }
      const { profile } = await authorizeProfileAccess({
        profileId: String(med.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'clinical',
      });

      const input = validateDiscontinueMedicationBody(req.body ?? {});
      const discontinuedAt = new Date().toISOString().slice(0, 40);
      const scheds = await queryFirestoreCollection<Record<string, unknown>>(
        'medicationSchedules',
        [
          { field: 'profileId', op: 'EQUAL', value: String(med.profileId) },
          { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: caller.uid },
        ],
        caller.idToken,
      );

      const actorName = (
        caller.name ||
        caller.email?.split('@')[0] ||
        'Care Team Member'
      ).slice(0, 120);
      const changeSummary = `Discontinued ${String(med.name || 'medication')}: ${input.reason}`.slice(0, 240);
      const changeId = generateServerId('mchg');
      const clinicalUids = Array.from(
        new Set([profile.ownerUid, ...profile.caregiverUids]),
      );

      await commitFirestoreWrites(
        [
          {
            type: 'update',
            collection: 'medications',
            docId: medId,
            data: {
              active: false,
              discontinued: true,
              discontinuedAt,
              discontinuedReason: input.reason,
              lastChangeNote: changeSummary,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
          ...scheds
            .filter((s) => String(s.medicationId) === medId)
            .map((s) => ({
              type: 'update' as const,
              collection: 'medicationSchedules',
              docId: s.id,
              data: {
                active: false,
                discontinued: true,
                updatedAt: SERVER_TIMESTAMP,
              },
            })),
          {
            type: 'create',
            collection: 'medicationChanges',
            docId: changeId,
            data: {
              id: changeId,
              profileId: profile.id,
              medicationId: medId,
              ownerUid: profile.ownerUid,
              authorizedUids: profile.authorizedUids,
              clinicalUids,
              medicationName: String(med.name || 'Medication').slice(0, 120),
              changeType: 'discontinued',
              summary: changeSummary.slice(0, 300),
              changedByUid: caller.uid,
              changedByName: actorName,
              familyAllowed: profile.familyShowDetailedMeds,
              createdAt: SERVER_TIMESTAMP,
            },
          },
        ],
        caller.idToken,
      );

      res.json({ id: medId, discontinued: true, discontinuedAt });
    }),
  );

  router.delete(
    '/medications/:medId',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const medId = assertStrongId(req.params.medId, 'medId');
      const med = await getFirestoreDoc<Record<string, unknown>>(
        'medications',
        medId,
        caller.idToken,
      );
      if (!med) {
        throw new ApiError(404, 'MEDICATION_NOT_FOUND', 'Medication not found.');
      }
      await authorizeProfileAccess({
        profileId: String(med.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'clinical',
      });

      const scheds = await queryFirestoreCollection<Record<string, unknown>>(
        'medicationSchedules',
        [
          { field: 'profileId', op: 'EQUAL', value: String(med.profileId) },
          { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: caller.uid },
        ],
        caller.idToken,
      );

      const writes = [
        ...scheds
          .filter((s) => String(s.medicationId) === medId)
          .map((s) => ({
            type: 'delete' as const,
            collection: 'medicationSchedules',
            docId: s.id,
          })),
        {
          type: 'delete' as const,
          collection: 'medications',
          docId: medId,
        },
      ];

      await commitFirestoreWrites(writes, caller.idToken);
      res.json({ deleted: medId });
    }),
  );

  // --- Adherence Records ---
  router.post(
    '/adherence',
    requireAuth,
    requireVerifiedEmail,
    requireProfileRole('clinical', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const profile = req.authorizedProfile!;
      const input = validateAdherenceBody(req.body ?? {});
      registerActiveSession(caller, profile.id);

      const med = await getFirestoreDoc<Record<string, unknown>>(
        'medications',
        input.medicationId,
        caller.idToken,
      );
      if (!med || String(med.profileId) !== profile.id) {
        throw new ApiError(
          404,
          'MEDICATION_NOT_FOUND',
          'Medication does not belong to this patient profile.',
        );
      }

      const [scheds, existingLogs] = await Promise.all([
        queryFirestoreCollection<Record<string, unknown>>(
          'medicationSchedules',
          [
            { field: 'profileId', op: 'EQUAL', value: profile.id },
            { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: caller.uid },
          ],
          caller.idToken,
        ),
        queryFirestoreCollection<Record<string, unknown>>(
          'adherenceRecords',
          [
            { field: 'profileId', op: 'EQUAL', value: profile.id },
            { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: caller.uid },
          ],
          caller.idToken,
        ),
      ]);

      const medScheds = scheds.filter((s) => String(s.medicationId) === med.id);
      const targetScheduledTime =
        input.scheduledTime ||
        String(
          (Array.isArray(med.scheduledTimes) && med.scheduledTimes[0]) ||
            medScheds[0]?.scheduledTime ||
            '08:00',
        );
      const sched =
        medScheds.find((s) => String(s.scheduledTime) === targetScheduledTime) ??
        medScheds[0];

      const now = new Date();
      const zoned = getZonedNowParts(
        now,
        typeof med.timezone === 'string' ? med.timezone : undefined,
      );
      const isConfirmedState =
        input.status === 'taken' || input.status === 'corrected';
      const confirmedAt = isConfirmedState
        ? (input.actualConfirmedAt || zoned.hhmm).slice(0, 20)
        : '';
      const actualConfirmedAt = isConfirmedState
        ? (input.actualConfirmedAt || now.toISOString()).slice(0, 40)
        : '';
      const actorName = (
        caller.name ||
        caller.email?.split('@')[0] ||
        'Care Circle Member'
      ).slice(0, 120);

      // Deduplicate: match explicit existingLogId OR existing record for same (med, date, time)
      const matchedExisting = input.existingLogId
        ? existingLogs.find((l) => l.id === input.existingLogId)
        : existingLogs.find(
            (l) =>
              String(l.medicationId) === med.id &&
              String(l.scheduledDate) === input.scheduledDate &&
              (String(l.scheduledTime) === targetScheduledTime ||
                (medScheds.length <= 1 && !input.scheduledTime)),
          );

      if (input.existingLogId && !matchedExisting) {
        throw new ApiError(404, 'RECORD_NOT_FOUND', 'Adherence record not found.');
      }

      const isCorrection =
        input.status === 'corrected' || Boolean(input.correctionReason);
      const correctedFromStatus = isCorrection
        ? input.correctedFromStatus ||
          (matchedExisting?.status as typeof input.status | undefined) ||
          'unconfirmed'
        : undefined;

      let recordId: string;
      if (matchedExisting) {
        recordId = String(matchedExisting.id);
        await commitFirestoreWrites(
          [
            {
              type: 'update',
              collection: 'adherenceRecords',
              docId: recordId,
              data: {
                status: input.status,
                confirmedAt,
                actualConfirmedAt,
                confirmedByUid: caller.uid,
                confirmedByName: actorName,
                ...(correctedFromStatus ? { correctedFromStatus } : {}),
                ...(input.correctionReason
                  ? { correctionReason: input.correctionReason }
                  : {}),
                ...(isCorrection ? { correctedAt: now.toISOString().slice(0, 40) } : {}),
                note: input.note,
                updatedAt: SERVER_TIMESTAMP,
              },
            },
          ],
          caller.idToken,
        );
      } else {
        recordId = generateServerId('adh');
        const clinicalUids = Array.from(
          new Set([profile.ownerUid, ...profile.caregiverUids]),
        );

        await commitFirestoreWrites(
          [
            {
              type: 'create',
              collection: 'adherenceRecords',
              docId: recordId,
              data: {
                id: recordId,
                profileId: profile.id,
                medicationId: med.id,
                ...(sched ? { scheduleId: sched.id } : {}),
                ownerUid: profile.ownerUid,
                authorizedUids: profile.authorizedUids,
                clinicalUids,
                medicationName: String(med.name || '').slice(0, 120),
                dosage: String(med.dosage || '').slice(0, 60),
                scheduledDate: input.scheduledDate,
                scheduledTime: targetScheduledTime,
                status: input.status,
                ...(confirmedAt ? { confirmedAt } : {}),
                ...(actualConfirmedAt ? { actualConfirmedAt } : {}),
                confirmedByUid: caller.uid,
                confirmedByName: actorName,
                ...(correctedFromStatus ? { correctedFromStatus } : {}),
                ...(input.correctionReason
                  ? { correctionReason: input.correctionReason }
                  : {}),
                ...(isCorrection ? { correctedAt: now.toISOString().slice(0, 40) } : {}),
                note: input.note,
                familyAllowed:
                  profile.familyShowDetailedMeds && profile.familyShowAdherencePct,
                createdAt: SERVER_TIMESTAMP,
                updatedAt: SERVER_TIMESTAMP,
              },
            },
          ],
          caller.idToken,
        );
      }

      if (input.status === 'missed') {
        await dispatchCareAlert({
          profile,
          idToken: caller.idToken,
          callerUid: caller.uid,
          callerEmail: caller.email,
          severity: 'warning',
          title: `Missed Dose Classified: ${String(med.name || 'Medication')} (${String(med.dosage || '')})`,
          detail: `${profile.fullName}'s ${targetScheduledTime} dose on ${input.scheduledDate} was classified as missed by ${actorName}. Do not encourage a double dose without clinician advice.`,
          sourceType: 'scheduler_dose',
          dedupeKey: `missed_${profile.id}_${med.id}_${input.scheduledDate}_${targetScheduledTime}`,
        });
      }

      res.status(matchedExisting ? 200 : 201).json({
        id: recordId,
        status: input.status,
        scheduledTime: targetScheduledTime,
        confirmedAt: confirmedAt || undefined,
      });
    }),
  );

  // --- Appointments ---
  router.post(
    '/appointments',
    requireAuth,
    requireVerifiedEmail,
    requireProfileRole('clinical', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const profile = req.authorizedProfile!;
      const input = validateAppointmentBody(req.body ?? {});

      const apptId = generateServerId('appt');
      const clinicalUids = Array.from(
        new Set([profile.ownerUid, ...profile.caregiverUids]),
      );

      await commitFirestoreWrites(
        [
          {
            type: 'create',
            collection: 'appointments',
            docId: apptId,
            data: {
              id: apptId,
              profileId: profile.id,
              ownerUid: profile.ownerUid,
              authorizedUids: profile.authorizedUids,
              clinicalUids,
              createdBy: caller.uid,
              title: input.title,
              doctorName: input.doctorName,
              specialty: input.specialty,
              date: input.date,
              time: input.time,
              location: input.location,
              assignedCaregiver: input.assignedCaregiver,
              notes: input.notes,
              status: 'upcoming',
              familyAllowed: profile.familyShowAppointments,
              createdAt: SERVER_TIMESTAMP,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
        ],
        caller.idToken,
      );

      res.status(201).json({ id: apptId, status: 'upcoming' });
    }),
  );

  router.patch(
    '/appointments/:apptId',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const apptId = assertStrongId(req.params.apptId, 'apptId');
      const input = validateUpdateAppointmentBody(req.body ?? {});

      const appt = await getFirestoreDoc<Record<string, unknown>>(
        'appointments',
        apptId,
        caller.idToken,
      );
      if (!appt) {
        throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }
      const { role } = await authorizeProfileAccess({
        profileId: String(appt.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'clinical',
      });

      if (
        role !== 'patient' &&
        (appt.status === 'completed' || appt.status === 'cancelled')
      ) {
        throw new ApiError(
          403,
          'TERMINAL_STATE_LOCKED',
          'Only the patient profile owner can edit a completed or cancelled appointment.',
        );
      }

      await commitFirestoreWrites(
        [
          {
            type: 'update',
            collection: 'appointments',
            docId: apptId,
            data: {
              title: input.title,
              doctorName: input.doctorName,
              specialty: input.specialty,
              date: input.date,
              time: input.time,
              location: input.location,
              assignedCaregiver: input.assignedCaregiver,
              notes: input.notes,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
        ],
        caller.idToken,
      );

      res.json({ id: apptId, updated: true });
    }),
  );

  router.patch(
    '/appointments/:apptId/status',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const apptId = assertStrongId(req.params.apptId, 'apptId');
      const status = req.body?.status;
      if (status !== 'upcoming' && status !== 'completed' && status !== 'cancelled') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid appointment status.');
      }

      const appt = await getFirestoreDoc<Record<string, unknown>>(
        'appointments',
        apptId,
        caller.idToken,
      );
      if (!appt) {
        throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }
      const { role } = await authorizeProfileAccess({
        profileId: String(appt.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'clinical',
      });

      if (
        role !== 'patient' &&
        (appt.status === 'completed' || appt.status === 'cancelled')
      ) {
        throw new ApiError(
          403,
          'TERMINAL_STATE_LOCKED',
          'Only the patient profile owner can modify a completed or cancelled appointment.',
        );
      }

      await commitFirestoreWrites(
        [
          {
            type: 'update',
            collection: 'appointments',
            docId: apptId,
            data: { status, updatedAt: SERVER_TIMESTAMP },
          },
        ],
        caller.idToken,
      );
      res.json({ id: apptId, status });
    }),
  );

  router.delete(
    '/appointments/:apptId',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const apptId = assertStrongId(req.params.apptId, 'apptId');

      const appt = await getFirestoreDoc<Record<string, unknown>>(
        'appointments',
        apptId,
        caller.idToken,
      );
      if (!appt) {
        throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      const { role } = await authorizeProfileAccess({
        profileId: String(appt.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'clinical',
      });

      if (
        role !== 'patient' &&
        (appt.status === 'completed' || appt.status === 'cancelled')
      ) {
        throw new ApiError(
          403,
          'TERMINAL_STATE_LOCKED',
          'Only the patient profile owner can delete a completed or cancelled appointment.',
        );
      }

      await commitFirestoreWrites(
        [
          {
            type: 'delete',
            collection: 'appointments',
            docId: apptId,
          },
        ],
        caller.idToken,
      );

      res.json({ deleted: apptId });
    }),
  );

  // --- Care Relay Handoffs ---
  router.post(
    '/care-relay',
    requireAuth,
    requireVerifiedEmail,
    requireProfileRole('clinical', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const profile = req.authorizedProfile!;
      const input = validateHandoffBody(req.body ?? {});

      const availId = generateServerId('relay');
      const fromCaregiver = (caller.name || caller.email?.split('@')[0] || 'Caregiver').slice(0, 120);

      await commitFirestoreWrites(
        [
          {
            type: 'create',
            collection: 'caregiverAvailability',
            docId: availId,
            data: {
              id: availId,
              profileId: profile.id,
              ownerUid: profile.ownerUid,
              authorizedUids: profile.authorizedUids,
              caregiverUid: caller.uid,
              fromCaregiver,
              toCaregiver: input.toCaregiver,
              shiftWindow: input.shiftWindow,
              summary: input.summary,
              status: 'handed_off',
              createdAt: SERVER_TIMESTAMP,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
        ],
        caller.idToken,
      );

      res.status(201).json({ id: availId, status: 'handed_off' });
    }),
  );

  router.patch(
    '/care-relay/:handoffId/acknowledge',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const handoffId = assertStrongId(req.params.handoffId, 'handoffId');
      const handoff = await getFirestoreDoc<Record<string, unknown>>(
        'caregiverAvailability',
        handoffId,
        caller.idToken,
      );
      if (!handoff) {
        throw new ApiError(404, 'HANDOFF_NOT_FOUND', 'Care Relay handoff not found.');
      }
      await authorizeProfileAccess({
        profileId: String(handoff.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'clinical',
      });

      await commitFirestoreWrites(
        [
          {
            type: 'update',
            collection: 'caregiverAvailability',
            docId: handoffId,
            data: { status: 'acknowledged', updatedAt: SERVER_TIMESTAMP },
          },
        ],
        caller.idToken,
      );

      res.json({ id: handoffId, status: 'acknowledged' });
    }),
  );

  router.post(
    '/care-relay/notify-unconfirmed',
    requireAuth,
    requireVerifiedEmail,
    requireProfileRole('clinical', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const profile = req.authorizedProfile!;
      registerActiveSession(caller, profile.id);
      const graceMinutes =
        typeof req.body?.escalationGraceMinutes === 'number' &&
        req.body.escalationGraceMinutes >= 0 &&
        req.body.escalationGraceMinutes <= 180
          ? req.body.escalationGraceMinutes
          : 30;

      const result = await runSchedulerForProfile({
        profile,
        uid: caller.uid,
        callerEmail: caller.email,
        idToken: caller.idToken,
        triggerType: 'manual',
        escalationGraceMinutes: graceMinutes,
      });

      res.json({
        ...result,
        scheduler: getSchedulerStatus(),
        notifications: getNotificationCapabilityReport(),
        automaticOfflineEscalation: {
          implemented: false,
          note: 'Automatic multi-step background escalation across signed-out devices is not implemented (no server push/worker credentials configured).',
        },
      });
    }),
  );

  // --- Alerts & Real Notification Delivery ---
  router.post(
    '/alerts',
    requireAuth,
    requireVerifiedEmail,
    requireProfileRole('clinical', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const input = validateAlertBody(req.body ?? {});
      const result = await dispatchCareAlert({
        profile: req.authorizedProfile!,
        idToken: req.caller!.idToken,
        callerUid: req.caller!.uid,
        callerEmail: req.caller!.email,
        severity: input.severity,
        title: input.title,
        detail: input.detail,
        sourceType: 'manual',
      });
      res.status(201).json(result);
    }),
  );

  router.patch(
    '/alerts/:alertId/resolve',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const alertId = assertStrongId(req.params.alertId, 'alertId');
      const alertDoc = await getFirestoreDoc<Record<string, unknown>>(
        'alerts',
        alertId,
        caller.idToken,
      );
      if (!alertDoc) {
        throw new ApiError(404, 'ALERT_NOT_FOUND', 'Alert not found.');
      }
      await authorizeProfileAccess({
        profileId: String(alertDoc.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'clinical',
      });

      await commitFirestoreWrites(
        [
          {
            type: 'update',
            collection: 'alerts',
            docId: alertId,
            data: {
              resolved: true,
              resolvedByUid: caller.uid,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
        ],
        caller.idToken,
      );

      res.json({ id: alertId, resolved: true });
    }),
  );

  // --- Real Server-Side Scheduler Execution ---
  router.get(
    '/scheduler/status',
    requireAuth,
    asyncRoute(async (_req, res) => {
      res.json(getSchedulerStatus());
    }),
  );

  router.post(
    '/scheduler/run',
    requireAuth,
    requireVerifiedEmail,
    requireProfileRole('clinical', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const profile = req.authorizedProfile!;
      registerActiveSession(caller, profile.id);
      const graceMinutes =
        typeof req.body?.escalationGraceMinutes === 'number' &&
        req.body.escalationGraceMinutes >= 0 &&
        req.body.escalationGraceMinutes <= 180
          ? req.body.escalationGraceMinutes
          : 30;

      const result = await runSchedulerForProfile({
        profile,
        uid: caller.uid,
        callerEmail: caller.email,
        idToken: caller.idToken,
        triggerType: 'manual',
        escalationGraceMinutes: graceMinutes,
      });

      res.json({
        ...result,
        scheduler: getSchedulerStatus(),
        notifications: getNotificationCapabilityReport(),
      });
    }),
  );

  // --- Controlled Emergency QR Tokens (Owner Issuance + Server-Side Token Resolution) ---
  router.post(
    '/emergency-tokens',
    requireAuth,
    requireVerifiedEmail,
    requireProfileRole('owner', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const profile = req.authorizedProfile!;
      const input = validateEmergencyTokenBody(req.body ?? {});

      const tokenId = generateServerId('emg', 18);
      const expiresAt = new Date(Date.now() + input.validHours * 3600 * 1000);

      let activeMedications: Array<{ name: string; dosage: string; instructions: string }> = [];
      if (input.includeMedications) {
        const medsRaw = await queryFirestoreCollection<Record<string, unknown>>(
          'medications',
          [
            { field: 'profileId', op: 'EQUAL', value: profile.id },
            { field: 'clinicalUids', op: 'ARRAY_CONTAINS', value: caller.uid },
          ],
          caller.idToken,
        );
        activeMedications = extractActiveEmergencyMedications(
          medsRaw,
          input.includeMedications,
        );
      }

      const allergies = (profile.allergiesText || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30);
      const conditions = (profile.conditionsText || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30);

      await commitFirestoreWrites(
        [
          {
            type: 'create',
            collection: 'emergencyTokens',
            docId: tokenId,
            data: {
              id: tokenId,
              profileId: profile.id,
              ownerUid: profile.ownerUid,
              label: input.label,
              includeMedications: input.includeMedications,
              revoked: false,
              expiresAt,
              createdAt: SERVER_TIMESTAMP,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
          {
            type: 'create',
            collection: 'publicEmergencySnapshots',
            docId: tokenId,
            data: {
              id: tokenId,
              profileId: profile.id,
              ownerUid: profile.ownerUid,
              label: input.label,
              patientFullName: profile.fullName.slice(0, 120),
              bloodType: (profile.bloodType || 'Not specified').slice(0, 20),
              allergies,
              conditions,
              primaryPhysician: (profile.primaryPhysician || '').slice(0, 120),
              physicianPhone: (profile.physicianPhone || '').slice(0, 32),
              emergencyContactName: (profile.emergencyContactName || '').slice(0, 120),
              emergencyContactRelation: (profile.emergencyContactRelation || '').slice(0, 80),
              emergencyContactPhone: (profile.emergencyContactPhone || '').slice(0, 32),
              advanceDirectiveNote: (profile.advanceDirectiveNote || '').slice(0, 500),
              includeMedications: input.includeMedications,
              activeMedications,
              revoked: false,
              expiresAt,
              createdAt: SERVER_TIMESTAMP,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
        ],
        caller.idToken,
      );

      const baseUrl =
        process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
          ? process.env.APP_URL.replace(/\/$/, '')
          : `${req.protocol}://${req.get('host')}`;
      const emergencyUrl = `${baseUrl}/emergency/${tokenId}`;
      const qrDataUrl = await QRCode.toDataURL(emergencyUrl, {
        width: 240,
        margin: 1,
        color: { dark: '#10373A', light: '#FFFFFF' },
      });

      res.status(201).json({
        tokenId,
        emergencyUrl,
        qrDataUrl,
        expiresAt: expiresAt.toISOString(),
      });
    }),
  );

  router.patch(
    '/emergency-tokens/:tokenId/revoke',
    requireAuth,
    requireVerifiedEmail,
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const tokenId = assertTokenId(req.params.tokenId, 'tokenId');
      const tokenDoc = await getFirestoreDoc<Record<string, unknown>>(
        'emergencyTokens',
        tokenId,
        caller.idToken,
      );
      if (!tokenDoc) {
        throw new ApiError(404, 'TOKEN_NOT_FOUND', 'Emergency token not found.');
      }
      await authorizeProfileAccess({
        profileId: String(tokenDoc.profileId),
        uid: caller.uid,
        idToken: caller.idToken,
        minLevel: 'owner',
      });

      await commitFirestoreWrites(
        [
          {
            type: 'update',
            collection: 'emergencyTokens',
            docId: tokenId,
            data: { revoked: true, updatedAt: SERVER_TIMESTAMP },
          },
          {
            type: 'update',
            collection: 'publicEmergencySnapshots',
            docId: tokenId,
            data: { revoked: true, updatedAt: SERVER_TIMESTAMP },
          },
        ],
        caller.idToken,
      );

      res.json({ tokenId, revoked: true });
    }),
  );

  // Unauthenticated Responder Lookup (Strictly gated by unguessable 24+ char token, revoked==false, expiresAt>now)
  router.get(
    '/emergency/:token',
    asyncRoute(async (req, res) => {
      const tokenId = assertTokenId(req.params.token, 'emergency token');
      let snapshot: Record<string, unknown> | null = null;
      try {
        snapshot = await getFirestoreDoc<Record<string, unknown>>(
          'publicEmergencySnapshots',
          tokenId,
        );
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 403) {
          throw new ApiError(
            403,
            'EMERGENCY_TOKEN_INVALID',
            'This emergency passport link has expired or been revoked by the patient owner.',
          );
        }
        throw err;
      }

      if (!snapshot || snapshot.revoked === true) {
        throw new ApiError(
          404,
          'EMERGENCY_TOKEN_NOT_FOUND',
          'Emergency health passport link not found, expired, or revoked.',
        );
      }

      const expMs = Date.parse(String(snapshot.expiresAt || ''));
      if (!Number.isFinite(expMs) || expMs <= Date.now()) {
        throw new ApiError(
          410,
          'EMERGENCY_TOKEN_EXPIRED',
          'This emergency health passport link has expired.',
        );
      }

      logEvent('info', 'emergency_qr_accessed', {
        requestId: req.requestId,
        meta: { tokenIdPrefix: tokenId.slice(0, 10) },
      });

      res.json(buildPublicEmergencyResponse(snapshot));
    }),
  );

  // --- Pillu Gemini AI Companion & Prescription Scanner (Server-Side) ---
  router.get(
    '/companion/status',
    requireAuth,
    asyncRoute(async (_req, res) => {
      res.json(getAiConfigurationStatus());
    }),
  );

  router.post(
    '/medications/scan-prescription',
    requireAuth,
    requireVerifiedEmail,
    requireProfileRole('clinical', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const input = validatePrescriptionScanBody(req.body ?? {});
      const result = await scanPrescriptionImage({
        profileId: req.authorizedProfile!.id,
        uid: caller.uid,
        mimeType: input.mimeType,
        base64Data: input.base64Data,
      });
      res.json(result);
    }),
  );

  router.post(
    '/companion/chat',
    requireAuth,
    requireProfileRole('member', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      const message = assertNonEmptyString(req.body?.message, 'Message', 2000);
      registerActiveSession(caller, req.authorizedProfile!.id);

      const history = Array.isArray(req.body?.history)
        ? req.body.history
            .slice(-8)
            .filter(
              (item: unknown): item is { role: 'user' | 'model'; text: string } =>
                Boolean(item) &&
                typeof item === 'object' &&
                ((item as { role?: unknown }).role === 'user' ||
                  (item as { role?: unknown }).role === 'model') &&
                typeof (item as { text?: unknown }).text === 'string' &&
                (item as { text: string }).text.trim().length > 0,
            )
        : [];

      const result = await generateCompanionChatReply({
        profile: req.authorizedProfile!,
        role: req.derivedRole!,
        uid: caller.uid,
        emailVerified: caller.emailVerified,
        idToken: caller.idToken,
        message,
        history,
      });

      res.json(result);
    }),
  );

  router.post(
    '/companion/summary',
    requireAuth,
    requireProfileRole('member', (req) => req.body?.profileId),
    asyncRoute(async (req, res) => {
      const caller = req.caller!;
      registerActiveSession(caller, req.authorizedProfile!.id);
      const result = await generateCareSummary({
        profile: req.authorizedProfile!,
        role: req.derivedRole!,
        uid: caller.uid,
        idToken: caller.idToken,
      });
      res.json(result);
    }),
  );

  return router;
}
