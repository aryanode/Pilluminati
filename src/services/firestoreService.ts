import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type {
  Appointment,
  CareCircleMember,
  CaregiverAvailabilityStatus,
  CaregiverTier,
  CareRelayHandoff,
  ClinicalAlert,
  CompanionMessage,
  DosageUnit,
  DoseLog,
  DoseStatus,
  EmergencyTokenRecord,
  FamilyVisibilityPermissions,
  FoodInstruction,
  InvitationRecord,
  Medication,
  MedicationChangeEvent,
  MedicationFrequency,
  MedicationSchedule,
  NotificationDeliveryRecord,
  PatientProfileRecord,
  SchedulerRunRecord,
  UserAccount,
  UserPrivateInfo,
  UserRole,
  UserSettings,
} from '../types/pilluminati';
import { ROLE_AVATARS } from '../data/seedData';
import { normalizeScheduledTimes } from '../utils/medicationEngine';
import { buildAuthorizedLists, generateSecureId } from '../utils/rbac';

function formatTimestamp(ts: unknown, fallback = 'Just now'): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return fallback;
}

function toIsoString(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  return new Date().toISOString();
}

function toMillis(ts: unknown): number {
  if (ts instanceof Timestamp) {
    return ts.toMillis();
  }
  return Date.now();
}

export async function getFreshIdToken(): Promise<string> {
  if (!auth.currentUser) {
    throw new Error('Please sign in first.');
  }
  return auth.currentUser.getIdToken();
}

export function subscribeToUserAccount(
  uid: string,
  onData: (account: UserAccount | null) => void,
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        uid: String(d.uid || uid),
        displayName: String(d.displayName || 'Care Circle Member'),
        accountRole: (d.accountRole as UserRole) || 'patient',
        activeProfileId: d.activeProfileId ? String(d.activeProfileId) : undefined,
        textScale: (d.textScale as UserSettings['textScale']) || 'standard',
        highContrast: Boolean(d.highContrast ?? false),
        reducedMotion: Boolean(d.reducedMotion ?? false),
        reminderLeadMinutes: ([15, 30, 60].includes(Number(d.reminderLeadMinutes))
          ? Number(d.reminderLeadMinutes)
          : 15) as UserSettings['reminderLeadMinutes'],
      });
    },
    (error) => handleFirestoreError(error, OperationType.GET, path),
  );
}

export function subscribeToUserPrivate(
  uid: string,
  onData: (priv: UserPrivateInfo | null) => void,
): Unsubscribe {
  const path = `users/${uid}/private/info`;
  return onSnapshot(
    doc(db, 'users', uid, 'private', 'info'),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        uid: String(d.uid || uid),
        email: String(d.email || ''),
        phone: String(d.phone || ''),
        address: String(d.address || ''),
      });
    },
    (error) => handleFirestoreError(error, OperationType.GET, path),
  );
}

export async function updateUserAccountDoc(
  uid: string,
  updates: Partial<{
    displayName: string;
    activeProfileId: string;
    textScale: UserSettings['textScale'];
    highContrast: boolean;
    reducedMotion: boolean;
    reminderLeadMinutes: 15 | 30 | 60;
  }>,
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.displayName !== undefined) {
      clean.displayName = updates.displayName.trim().slice(0, 120);
    }
    if (updates.activeProfileId !== undefined) {
      clean.activeProfileId = updates.activeProfileId;
    }
    if (updates.textScale !== undefined) clean.textScale = updates.textScale;
    if (updates.highContrast !== undefined) clean.highContrast = updates.highContrast;
    if (updates.reducedMotion !== undefined) clean.reducedMotion = updates.reducedMotion;
    if (updates.reminderLeadMinutes !== undefined) {
      clean.reminderLeadMinutes = updates.reminderLeadMinutes;
    }
    await updateDoc(doc(db, 'users', uid), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserPrivateDoc(
  uid: string,
  updates: Partial<{ email: string; phone: string; address: string }>,
): Promise<void> {
  const path = `users/${uid}/private/info`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.email !== undefined) clean.email = updates.email.trim().slice(0, 254);
    if (updates.phone !== undefined) clean.phone = updates.phone.trim().slice(0, 32);
    if (updates.address !== undefined) clean.address = updates.address.trim().slice(0, 300);
    await updateDoc(doc(db, 'users', uid, 'private', 'info'), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeToAuthorizedProfiles(
  uid: string,
  onData: (profiles: PatientProfileRecord[]) => void,
): Unsubscribe {
  const path = 'patientProfiles';
  const q = query(
    collection(db, 'patientProfiles'),
    where('authorizedUids', 'array-contains', uid),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: PatientProfileRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          ownerUid: String(d.ownerUid),
          authorizedUids: Array.isArray(d.authorizedUids) ? d.authorizedUids.map(String) : [],
          caregiverUids: Array.isArray(d.caregiverUids) ? d.caregiverUids.map(String) : [],
          familyUids: Array.isArray(d.familyUids) ? d.familyUids.map(String) : [],
          fullName: String(d.fullName || 'Patient'),
          dateOfBirth: String(d.dateOfBirth || ''),
          gender: String(d.gender || ''),
          bloodType: String(d.bloodType || ''),
          phone: String(d.phone || ''),
          allergiesText: String(d.allergiesText || ''),
          conditionsText: String(d.conditionsText || ''),
          primaryPhysician: String(d.primaryPhysician || ''),
          physicianPhone: String(d.physicianPhone || ''),
          pharmacyName: String(d.pharmacyName || ''),
          pharmacyPhone: String(d.pharmacyPhone || ''),
          emergencyContactName: String(d.emergencyContactName || ''),
          emergencyContactRelation: String(d.emergencyContactRelation || ''),
          emergencyContactPhone: String(d.emergencyContactPhone || ''),
          advanceDirectiveNote: String(d.advanceDirectiveNote || ''),
          passcodeEnabled: Boolean(d.passcodeEnabled ?? false),
          familyShowDetailedMeds: Boolean(d.familyShowDetailedMeds ?? true),
          familyShowAdherencePct: Boolean(d.familyShowAdherencePct ?? true),
          familyShowAppointments: Boolean(d.familyShowAppointments ?? true),
          familyShowCareUpdates: Boolean(d.familyShowCareUpdates ?? true),
          familyShowPassport: Boolean(d.familyShowPassport ?? true),
          updatedAtLabel: formatTimestamp(d.updatedAt, 'Today'),
        };
      });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path),
  );
}

export async function createPatientProfile(
  ownerUid: string,
  draft: {
    fullName: string;
    dateOfBirth?: string;
    gender?: string;
    bloodType?: string;
    phone?: string;
    allergiesText?: string;
    conditionsText?: string;
    primaryPhysician?: string;
    physicianPhone?: string;
    pharmacyName?: string;
    pharmacyPhone?: string;
    emergencyContactName?: string;
    emergencyContactRelation?: string;
    emergencyContactPhone?: string;
    advanceDirectiveNote?: string;
  },
): Promise<string> {
  const profileId = generateSecureId('prof');
  const path = `patientProfiles/${profileId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'patientProfiles', profileId), {
      id: profileId,
      ownerUid,
      authorizedUids: [ownerUid],
      caregiverUids: [],
      familyUids: [],
      fullName: draft.fullName.trim().slice(0, 120),
      dateOfBirth: (draft.dateOfBirth || '').trim().slice(0, 20),
      gender: (draft.gender || '').trim().slice(0, 40),
      bloodType: (draft.bloodType || '').trim().slice(0, 20),
      phone: (draft.phone || '').trim().slice(0, 32),
      allergiesText: (draft.allergiesText || '').trim().slice(0, 500),
      conditionsText: (draft.conditionsText || '').trim().slice(0, 500),
      primaryPhysician: (draft.primaryPhysician || '').trim().slice(0, 120),
      physicianPhone: (draft.physicianPhone || '').trim().slice(0, 32),
      pharmacyName: (draft.pharmacyName || '').trim().slice(0, 120),
      pharmacyPhone: (draft.pharmacyPhone || '').trim().slice(0, 32),
      emergencyContactName: (draft.emergencyContactName || '').trim().slice(0, 120),
      emergencyContactRelation: (draft.emergencyContactRelation || '').trim().slice(0, 80),
      emergencyContactPhone: (draft.emergencyContactPhone || '').trim().slice(0, 32),
      advanceDirectiveNote: (draft.advanceDirectiveNote || '').trim().slice(0, 500),
      passcodeEnabled: false,
      familyShowDetailedMeds: true,
      familyShowAdherencePct: true,
      familyShowAppointments: true,
      familyShowCareUpdates: true,
      familyShowPassport: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', ownerUid), {
      activeProfileId: profileId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return profileId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePatientProfileDetails(
  profileId: string,
  updates: Partial<{
    fullName: string;
    dateOfBirth: string;
    gender: string;
    bloodType: string;
    phone: string;
    allergiesText: string;
    conditionsText: string;
    primaryPhysician: string;
    physicianPhone: string;
    pharmacyName: string;
    pharmacyPhone: string;
    emergencyContactName: string;
    emergencyContactRelation: string;
    emergencyContactPhone: string;
    advanceDirectiveNote: string;
  }>,
  isOwner: boolean,
): Promise<void> {
  const path = `patientProfiles/${profileId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (isOwner) {
      if (updates.fullName !== undefined) clean.fullName = updates.fullName.trim().slice(0, 120);
      if (updates.dateOfBirth !== undefined) clean.dateOfBirth = updates.dateOfBirth.trim().slice(0, 20);
      if (updates.gender !== undefined) clean.gender = updates.gender.trim().slice(0, 40);
      if (updates.bloodType !== undefined) clean.bloodType = updates.bloodType.trim().slice(0, 20);
      if (updates.phone !== undefined) clean.phone = updates.phone.trim().slice(0, 32);
    }
    if (updates.allergiesText !== undefined) clean.allergiesText = updates.allergiesText.trim().slice(0, 500);
    if (updates.conditionsText !== undefined) clean.conditionsText = updates.conditionsText.trim().slice(0, 500);
    if (updates.primaryPhysician !== undefined) clean.primaryPhysician = updates.primaryPhysician.trim().slice(0, 120);
    if (updates.physicianPhone !== undefined) clean.physicianPhone = updates.physicianPhone.trim().slice(0, 32);
    if (updates.pharmacyName !== undefined) clean.pharmacyName = updates.pharmacyName.trim().slice(0, 120);
    if (updates.pharmacyPhone !== undefined) clean.pharmacyPhone = updates.pharmacyPhone.trim().slice(0, 32);
    if (updates.emergencyContactName !== undefined) clean.emergencyContactName = updates.emergencyContactName.trim().slice(0, 120);
    if (updates.emergencyContactRelation !== undefined) clean.emergencyContactRelation = updates.emergencyContactRelation.trim().slice(0, 80);
    if (updates.emergencyContactPhone !== undefined) clean.emergencyContactPhone = updates.emergencyContactPhone.trim().slice(0, 32);
    if (updates.advanceDirectiveNote !== undefined) clean.advanceDirectiveNote = updates.advanceDirectiveNote.trim().slice(0, 500);

    await updateDoc(doc(db, 'patientProfiles', profileId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateFamilyPermissionsAndSync(
  profile: PatientProfileRecord,
  updates: Partial<FamilyVisibilityPermissions>,
): Promise<void> {
  const path = `patientProfiles/${profile.id}`;
  const next = {
    familyShowDetailedMeds:
      updates.showDetailedMedications ?? profile.familyShowDetailedMeds,
    familyShowAdherencePct:
      updates.showAdherencePercentage ?? profile.familyShowAdherencePct,
    familyShowAppointments:
      updates.showAppointments ?? profile.familyShowAppointments,
    familyShowCareUpdates:
      updates.showCareUpdates ?? profile.familyShowCareUpdates,
    familyShowPassport:
      updates.showEmergencyPassport ?? profile.familyShowPassport,
  };

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'patientProfiles', profile.id), {
      ...next,
      updatedAt: serverTimestamp(),
    });

    const syncCol = async (colName: string, allowed: boolean) => {
      const snap = await getDocs(
        query(
          collection(db, colName),
          where('profileId', '==', profile.id),
          where('clinicalUids', 'array-contains', auth.currentUser!.uid),
        ),
      );
      snap.docs.forEach((d) => {
        batch.update(d.ref, {
          authorizedUids: profile.authorizedUids,
          clinicalUids: [profile.ownerUid, ...profile.caregiverUids],
          familyAllowed: allowed,
          updatedAt: serverTimestamp(),
        });
      });
    };

    const syncColNoTimestamp = async (colName: string, allowed: boolean) => {
      const snap = await getDocs(
        query(
          collection(db, colName),
          where('profileId', '==', profile.id),
          where('clinicalUids', 'array-contains', auth.currentUser!.uid),
        ),
      );
      snap.docs.forEach((d) => {
        batch.update(d.ref, {
          authorizedUids: profile.authorizedUids,
          clinicalUids: [profile.ownerUid, ...profile.caregiverUids],
          familyAllowed: allowed,
        });
      });
    };

    await syncCol('medications', next.familyShowDetailedMeds);
    await syncCol('medicationSchedules', next.familyShowDetailedMeds);
    await syncCol('adherenceRecords', next.familyShowDetailedMeds && next.familyShowAdherencePct);
    await syncCol('appointments', next.familyShowAppointments);
    await syncColNoTimestamp('medicationChanges', next.familyShowDetailedMeds);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface ProfileSubscriptionsCallbacks {
  onMedications: (meds: Medication[]) => void;
  onSchedules: (schedules: MedicationSchedule[]) => void;
  onMedicationChanges: (changes: MedicationChangeEvent[]) => void;
  onDoseLogs: (logs: DoseLog[]) => void;
  onAppointments: (appts: Appointment[]) => void;
  onAlerts: (alerts: ClinicalAlert[]) => void;
  onHandoffs: (handoffs: CareRelayHandoff[]) => void;
  onCaregivers: (members: CareCircleMember[]) => void;
  onFamilyMembers: (members: CareCircleMember[]) => void;
  onInvitations: (invites: InvitationRecord[]) => void;
  onEmergencyTokens: (tokens: EmergencyTokenRecord[]) => void;
  onAiMessages: (msgs: CompanionMessage[]) => void;
  onNotificationDeliveries: (deliveries: NotificationDeliveryRecord[]) => void;
  onSchedulerRuns: (runs: SchedulerRunRecord[]) => void;
}

export function subscribeToProfileCollections(
  profile: PatientProfileRecord,
  uid: string,
  role: UserRole,
  callbacks: ProfileSubscriptionsCallbacks,
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  const isClinical = role === 'patient' || role === 'caregiver';
  const authField = isClinical ? 'clinicalUids' : 'authorizedUids';

  // Medications + Schedules
  if (isClinical || profile.familyShowDetailedMeds) {
    const medsConstraints = [
      where('profileId', '==', profile.id),
      where(authField, 'array-contains', uid),
      ...(!isClinical ? [where('familyAllowed', '==', true)] : []),
    ];
    const schedConstraints = [
      where('profileId', '==', profile.id),
      where(authField, 'array-contains', uid),
      ...(!isClinical ? [where('familyAllowed', '==', true)] : []),
    ];

    const schedMap = new Map<string, MedicationSchedule>();
    let latestMedsRaw: Record<string, unknown>[] = [];

    const mergeAndEmitMeds = () => {
      const allSchedules = Array.from(schedMap.values());
      const meds: Medication[] = latestMedsRaw.map((d) => {
        const medId = String(d.id);
        const matchingScheds = allSchedules.filter((s) => s.medicationId === medId);
        const rawMedTimes = Array.isArray(d.scheduledTimes)
          ? d.scheduledTimes.map(String)
          : [];
        const schedTimes = matchingScheds.map((s) => s.scheduledTime);
        const combinedTimes = normalizeScheduledTimes(
          rawMedTimes.length > 0 ? rawMedTimes : schedTimes,
          matchingScheds[0]?.scheduledTime || '08:00',
        );
        const primarySched =
          matchingScheds.find((s) => s.scheduledTime === combinedTimes[0]) ??
          matchingScheds[0];

        return {
          id: medId,
          profileId: String(d.profileId),
          name: String(d.name || ''),
          dosage: String(d.dosage || ''),
          dosageAmount: d.dosageAmount ? String(d.dosageAmount) : undefined,
          dosageUnit: d.dosageUnit ? (String(d.dosageUnit) as DosageUnit) : undefined,
          frequency: d.frequency
            ? (String(d.frequency) as MedicationFrequency)
            : primarySched?.frequency,
          timeSlot: primarySched?.timeSlot || 'morning',
          scheduledTime: combinedTimes[0],
          scheduledTimes: combinedTimes,
          weekdays: Array.isArray(d.weekdays)
            ? d.weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
            : primarySched?.weekdays,
          customIntervalDays:
            d.customIntervalDays !== undefined
              ? Number(d.customIntervalDays)
              : primarySched?.customIntervalDays,
          customScheduleNote: d.customScheduleNote
            ? String(d.customScheduleNote)
            : undefined,
          startDate: d.startDate ? String(d.startDate) : primarySched?.startDate,
          endDate: d.endDate ? String(d.endDate) : primarySched?.endDate,
          instructions: String(d.instructions || ''),
          foodInstruction: d.foodInstruction
            ? (String(d.foodInstruction) as FoodInstruction)
            : 'no_restriction',
          prescriber: String(d.prescriber || ''),
          pillAppearance: String(d.pillAppearance || 'Tablet'),
          prescriptionImageUrl: d.prescriptionImageUrl
            ? String(d.prescriptionImageUrl)
            : undefined,
          timezone: d.timezone
            ? String(d.timezone)
            : primarySched?.timezone || 'UTC',
          gracePeriodMinutes:
            d.gracePeriodMinutes !== undefined
              ? Number(d.gracePeriodMinutes)
              : 30,
          missedAfterMinutes:
            d.missedAfterMinutes !== undefined
              ? Number(d.missedAfterMinutes)
              : 180,
          supplyDays: Number(d.supplyDays ?? 30),
          active: Boolean(d.active ?? true),
          discontinued: Boolean(d.discontinued ?? false),
          discontinuedAt: d.discontinuedAt ? String(d.discontinuedAt) : undefined,
          discontinuedReason: d.discontinuedReason
            ? String(d.discontinuedReason)
            : undefined,
          lastChangeNote: d.lastChangeNote ? String(d.lastChangeNote) : undefined,
          scheduleId: primarySched?.id,
        };
      });
      callbacks.onMedications(meds);
    };

    unsubs.push(
      onSnapshot(
        query(collection(db, 'medicationSchedules'), ...schedConstraints),
        (snap) => {
          schedMap.clear();
          const list: MedicationSchedule[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            const item: MedicationSchedule = {
              id: docSnap.id,
              profileId: String(d.profileId),
              medicationId: String(d.medicationId),
              timeSlot: d.timeSlot || 'morning',
              scheduledTime: String(d.scheduledTime || '08:00'),
              frequency: d.frequency
                ? (String(d.frequency) as MedicationFrequency)
                : undefined,
              weekdays: Array.isArray(d.weekdays) ? d.weekdays.map(Number) : undefined,
              customIntervalDays:
                d.customIntervalDays !== undefined
                  ? Number(d.customIntervalDays)
                  : undefined,
              startDate: d.startDate ? String(d.startDate) : undefined,
              endDate: d.endDate ? String(d.endDate) : undefined,
              timezone: d.timezone ? String(d.timezone) : undefined,
              active: Boolean(d.active ?? true),
              discontinued: Boolean(d.discontinued ?? false),
            };
            schedMap.set(item.id, item);
            return item;
          });
          callbacks.onSchedules(list);
          mergeAndEmitMeds();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'medicationSchedules'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'medications'), ...medsConstraints),
        (snap) => {
          latestMedsRaw = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          mergeAndEmitMeds();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'medications'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'medicationChanges'), ...medsConstraints),
        (snap) => {
          const list: MedicationChangeEvent[] = snap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                profileId: String(d.profileId),
                medicationId: String(d.medicationId),
                medicationName: String(d.medicationName || 'Medication'),
                changeType:
                  (d.changeType as MedicationChangeEvent['changeType']) || 'edited',
                summary: String(d.summary || ''),
                changedByUid: String(d.changedByUid || ''),
                changedByName: String(d.changedByName || 'Care Team'),
                createdAt: formatTimestamp(d.createdAt, 'Just now'),
                createdAtMs: toMillis(d.createdAt),
              };
            })
            .sort((a, b) => b.createdAtMs - a.createdAtMs);
          callbacks.onMedicationChanges(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'medicationChanges'),
      ),
    );
  } else {
    callbacks.onMedications([]);
    callbacks.onSchedules([]);
    callbacks.onMedicationChanges([]);
  }

  // Adherence Records
  if (isClinical || (profile.familyShowDetailedMeds && profile.familyShowAdherencePct)) {
    const logConstraints = [
      where('profileId', '==', profile.id),
      where(authField, 'array-contains', uid),
      ...(!isClinical ? [where('familyAllowed', '==', true)] : []),
    ];
    unsubs.push(
      onSnapshot(
        query(collection(db, 'adherenceRecords'), ...logConstraints),
        (snap) => {
          const logs: DoseLog[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              profileId: String(d.profileId),
              medicationId: String(d.medicationId),
              scheduleId: d.scheduleId ? String(d.scheduleId) : undefined,
              medicationName: String(d.medicationName || ''),
              dosage: String(d.dosage || ''),
              scheduledDate: String(d.scheduledDate || ''),
              scheduledTime: String(d.scheduledTime || '08:00'),
              status: (d.status as DoseStatus) || 'pending',
              confirmedAt: d.confirmedAt ? String(d.confirmedAt) : undefined,
              actualConfirmedAt: d.actualConfirmedAt
                ? String(d.actualConfirmedAt)
                : undefined,
              confirmedBy: d.confirmedByName ? String(d.confirmedByName) : undefined,
              confirmedByUid: d.confirmedByUid ? String(d.confirmedByUid) : undefined,
              correctedFromStatus: d.correctedFromStatus
                ? (String(d.correctedFromStatus) as DoseStatus)
                : undefined,
              correctionReason: d.correctionReason
                ? String(d.correctionReason)
                : undefined,
              correctedAt: d.correctedAt ? String(d.correctedAt) : undefined,
              note: d.note ? String(d.note) : undefined,
            };
          });
          callbacks.onDoseLogs(logs);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'adherenceRecords'),
      ),
    );
  } else {
    callbacks.onDoseLogs([]);
  }

  // Appointments
  if (isClinical || profile.familyShowAppointments) {
    const apptConstraints = [
      where('profileId', '==', profile.id),
      where(authField, 'array-contains', uid),
      ...(!isClinical ? [where('familyAllowed', '==', true)] : []),
    ];
    unsubs.push(
      onSnapshot(
        query(collection(db, 'appointments'), ...apptConstraints),
        (snap) => {
          const appts: Appointment[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              profileId: String(d.profileId),
              title: String(d.title || ''),
              doctorName: String(d.doctorName || ''),
              specialty: String(d.specialty || 'Clinic Visit'),
              date: String(d.date || ''),
              time: String(d.time || '10:00'),
              location: String(d.location || ''),
              assignedCaregiver: String(d.assignedCaregiver || ''),
              notes: String(d.notes || ''),
              status: (d.status as Appointment['status']) || 'upcoming',
            };
          });
          callbacks.onAppointments(appts);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'),
      ),
    );
  } else {
    callbacks.onAppointments([]);
  }

  // Alerts
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'alerts'),
        where('profileId', '==', profile.id),
        where('authorizedUids', 'array-contains', uid),
      ),
      (snap) => {
        const list: ClinicalAlert[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              profileId: String(d.profileId),
              patientName: String(d.patientName || profile.fullName),
              severity: (d.severity as ClinicalAlert['severity']) || 'info',
              title: String(d.title || ''),
              detail: String(d.detail || ''),
              createdAt: formatTimestamp(d.createdAt, 'Today'),
              resolved: Boolean(d.resolved ?? false),
              sourceType: d.sourceType as ClinicalAlert['sourceType'],
              deliveryChannel: d.deliveryChannel as ClinicalAlert['deliveryChannel'],
              deliveryStatus: d.deliveryStatus as ClinicalAlert['deliveryStatus'],
              deliveryNote: d.deliveryNote ? String(d.deliveryNote) : undefined,
              _ms: toMillis(d.createdAt),
            };
          })
          .sort((a, b) => b._ms - a._ms)
          .map(({ _ms: _, ...rest }) => rest);
        callbacks.onAlerts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'alerts'),
    ),
  );

  // Notification Deliveries
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'notificationDeliveries'),
        where('profileId', '==', profile.id),
        where('authorizedUids', 'array-contains', uid),
      ),
      (snap) => {
        const list: NotificationDeliveryRecord[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              profileId: String(d.profileId),
              alertId: String(d.alertId || ''),
              channel:
                (d.channel as NotificationDeliveryRecord['channel']) ||
                'in_app_firestore',
              deliveryStatus:
                (d.deliveryStatus as NotificationDeliveryRecord['deliveryStatus']) ||
                'delivered',
              statusDetail: String(d.statusDetail || ''),
              createdAt: formatTimestamp(d.createdAt, 'Just now'),
              createdAtMs: toMillis(d.createdAt),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        callbacks.onNotificationDeliveries(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notificationDeliveries'),
    ),
  );

  // Server Scheduler Runs
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'schedulerRuns'),
        where('profileId', '==', profile.id),
        where('authorizedUids', 'array-contains', uid),
      ),
      (snap) => {
        const list: SchedulerRunRecord[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              profileId: String(d.profileId),
              triggeredByUid: String(d.triggeredByUid || ''),
              triggerType:
                (d.triggerType as SchedulerRunRecord['triggerType']) || 'manual',
              schedulesChecked: Number(d.schedulesChecked ?? 0),
              overdueFound: Number(d.overdueFound ?? 0),
              alertsCreated: Number(d.alertsCreated ?? 0),
              handoffsEscalated: Number(d.handoffsEscalated ?? 0),
              summary: String(d.summary || ''),
              createdAt: formatTimestamp(d.createdAt, 'Just now'),
              createdAtMs: toMillis(d.createdAt),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        callbacks.onSchedulerRuns(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'schedulerRuns'),
    ),
  );

  // Caregiver Availability & Care Relay
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'caregiverAvailability'),
        where('profileId', '==', profile.id),
        where('authorizedUids', 'array-contains', uid),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => {
        const list: CareRelayHandoff[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            profileId: String(d.profileId),
            fromCaregiver: String(d.fromCaregiver || ''),
            toCaregiver: String(d.toCaregiver || ''),
            shiftWindow: String(d.shiftWindow || ''),
            summary: String(d.summary || ''),
            status: (d.status as CareRelayHandoff['status']) || 'handed_off',
            createdAt: formatTimestamp(d.createdAt, 'Just now'),
          };
        });
        callbacks.onHandoffs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'caregiverAvailability'),
    ),
  );

  // Caregiver Relationships (visible to patient owner, caregivers, and family via authorizedUids)
  const mapCaregiverRelationship = (
    docSnap: { id: string; data: () => Record<string, unknown> },
  ): CareCircleMember => {
    const d = docSnap.data();
    const tier: CaregiverTier = d.tier === 'backup' ? 'backup' : 'primary';
    const availabilityStatus: CaregiverAvailabilityStatus =
      d.availabilityStatus === 'busy' || d.availabilityStatus === 'away'
        ? d.availabilityStatus
        : 'available';
    const defaultLabel = tier === 'backup' ? 'Backup Caregiver' : 'Primary Caregiver';
    return {
      id: docSnap.id,
      uid: String(d.caregiverUid),
      name: String(d.caregiverName || 'Caregiver'),
      role: 'caregiver',
      relation: String(d.relation || defaultLabel),
      phone: '',
      email: '',
      avatarUrl: ROLE_AVATARS.caregiver,
      isOnDuty: d.status === 'active' && availabilityStatus === 'available',
      status: d.status === 'revoked' ? 'revoked' : 'active',
      availabilityStatus,
      caregiverTier: tier,
      lastActive: String(d.shiftWindow || defaultLabel),
    };
  };

  if (role === 'patient') {
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'caregiverRelationships'),
          where('patientOwnerUid', '==', uid),
        ),
        (snap) => {
          const members: CareCircleMember[] = snap.docs
            .filter((docSnap) => docSnap.data().profileId === profile.id)
            .map((docSnap) =>
              mapCaregiverRelationship({
                id: docSnap.id,
                data: () => docSnap.data() as Record<string, unknown>,
              }),
            );
          callbacks.onCaregivers(members);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'caregiverRelationships'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'familyMemberships'),
          where('patientOwnerUid', '==', uid),
        ),
        (snap) => {
          const members: CareCircleMember[] = snap.docs
            .filter((docSnap) => docSnap.data().profileId === profile.id)
            .map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                uid: String(d.memberUid),
                name: String(d.memberName || 'Family Member'),
                role: 'family',
                relation: String(d.relation || 'Family Member'),
                phone: '',
                email: '',
                avatarUrl: ROLE_AVATARS.family,
                status: d.status,
                lastActive: d.status === 'active' ? 'Connected Family Member' : 'Revoked',
              };
            });
          callbacks.onFamilyMembers(members);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'familyMemberships'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'invitations'), where('issuedByUid', '==', uid)),
        (snap) => {
          const list: InvitationRecord[] = snap.docs
            .filter((docSnap) => docSnap.data().profileId === profile.id)
            .map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                profileId: String(d.profileId),
                patientName: String(d.patientName || profile.fullName),
                issuedByUid: String(d.issuedByUid),
                targetEmail: String(d.targetEmail || ''),
                targetRole: (d.targetRole as 'caregiver' | 'family') || 'family',
                relation: String(d.relation || ''),
                status: (d.status as InvitationRecord['status']) || 'pending',
                acceptedByUid: d.acceptedByUid ? String(d.acceptedByUid) : undefined,
                expiresAtIso: toIsoString(d.expiresAt),
              };
            });
          callbacks.onInvitations(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'invitations'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'emergencyTokens'), where('ownerUid', '==', uid)),
        (snap) => {
          const tokens: EmergencyTokenRecord[] = snap.docs
            .filter((docSnap) => docSnap.data().profileId === profile.id)
            .map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                profileId: String(d.profileId),
                ownerUid: String(d.ownerUid),
                label: String(d.label || 'Emergency Responders'),
                includeMedications: Boolean(d.includeMedications ?? true),
                revoked: Boolean(d.revoked ?? false),
                expiresAtIso: toIsoString(d.expiresAt),
              };
            });
          callbacks.onEmergencyTokens(tokens);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'emergencyTokens'),
      ),
    );
  } else if (role === 'caregiver') {
    const mergedById = new Map<string, CareCircleMember>();
    const emitMergedCaregivers = () => {
      callbacks.onCaregivers(Array.from(mergedById.values()));
    };

    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'caregiverRelationships'),
          where('caregiverUid', '==', uid),
        ),
        (snap) => {
          snap.docs
            .filter((docSnap) => docSnap.data().profileId === profile.id)
            .forEach((docSnap) => {
              mergedById.set(
                docSnap.id,
                mapCaregiverRelationship({
                  id: docSnap.id,
                  data: () => docSnap.data() as Record<string, unknown>,
                }),
              );
            });
          emitMergedCaregivers();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'caregiverRelationships'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'caregiverRelationships'),
          where('authorizedUids', 'array-contains', uid),
        ),
        (snap) => {
          snap.docs
            .filter((docSnap) => docSnap.data().profileId === profile.id)
            .forEach((docSnap) => {
              mergedById.set(
                docSnap.id,
                mapCaregiverRelationship({
                  id: docSnap.id,
                  data: () => docSnap.data() as Record<string, unknown>,
                }),
              );
            });
          emitMergedCaregivers();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'caregiverRelationships'),
      ),
    );

    callbacks.onFamilyMembers([]);
    callbacks.onInvitations([]);
    callbacks.onEmergencyTokens([]);
  } else {
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'caregiverRelationships'),
          where('authorizedUids', 'array-contains', uid),
        ),
        (snap) => {
          const members: CareCircleMember[] = snap.docs
            .filter((docSnap) => docSnap.data().profileId === profile.id)
            .map((docSnap) =>
              mapCaregiverRelationship({
                id: docSnap.id,
                data: () => docSnap.data() as Record<string, unknown>,
              }),
            );
          callbacks.onCaregivers(members);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'caregiverRelationships'),
      ),
    );
    callbacks.onFamilyMembers([]);
    callbacks.onInvitations([]);
    callbacks.onEmergencyTokens([]);
  }

  // AI Conversation History (per user + active profile)
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'aiConversations'),
        where('userId', '==', uid),
        orderBy('createdAt', 'asc'),
      ),
      (snap) => {
        const msgs: CompanionMessage[] = snap.docs
          .filter((docSnap) => docSnap.data().profileId === profile.id)
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              sender: (d.sender as 'user' | 'pillu') || 'pillu',
              text: String(d.text || ''),
              timestamp: formatTimestamp(d.createdAt, 'Now'),
            };
          });
        callbacks.onAiMessages(msgs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'aiConversations'),
    ),
  );

  return () => {
    unsubs.forEach((fn) => fn());
  };
}

export function subscribeToIncomingInvitations(
  email: string,
  onData: (invites: InvitationRecord[]) => void,
): Unsubscribe {
  if (!email) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, 'invitations'), where('targetEmail', '==', email.toLowerCase())),
    (snap) => {
      const list: InvitationRecord[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            profileId: String(d.profileId),
            patientName: String(d.patientName || 'Patient Profile'),
            issuedByUid: String(d.issuedByUid),
            targetEmail: String(d.targetEmail || ''),
            targetRole: (d.targetRole as 'caregiver' | 'family') || 'family',
            relation: String(d.relation || ''),
            status: (d.status as InvitationRecord['status']) || 'pending',
            acceptedByUid: d.acceptedByUid ? String(d.acceptedByUid) : undefined,
            expiresAtIso: toIsoString(d.expiresAt),
          };
        })
        .filter((inv) => inv.status === 'pending');
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'invitations'),
  );
}

export async function createMedicationWithSchedule(params: {
  profile: PatientProfileRecord;
  uid: string;
  draft: Omit<Medication, 'id'>;
}): Promise<void> {
  const { profile, uid, draft } = params;
  const medId = generateSecureId('med');
  const scheduleId = generateSecureId('sched');
  const clinicalUids = Array.from(
    new Set([profile.ownerUid, ...profile.caregiverUids]),
  );

  const batch = writeBatch(db);
  batch.set(doc(db, 'medications', medId), {
    id: medId,
    profileId: profile.id,
    ownerUid: profile.ownerUid,
    authorizedUids: profile.authorizedUids,
    clinicalUids,
    createdBy: uid,
    name: draft.name.trim().slice(0, 120),
    dosage: draft.dosage.trim().slice(0, 60),
    instructions: draft.instructions.trim().slice(0, 300),
    prescriber: draft.prescriber.trim().slice(0, 120),
    pillAppearance: draft.pillAppearance.trim().slice(0, 100),
    supplyDays: Math.min(365, Math.max(0, Math.round(draft.supplyDays))),
    active: draft.active,
    familyAllowed: profile.familyShowDetailedMeds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'medicationSchedules', scheduleId), {
    id: scheduleId,
    profileId: profile.id,
    medicationId: medId,
    ownerUid: profile.ownerUid,
    authorizedUids: profile.authorizedUids,
    clinicalUids,
    timeSlot: draft.timeSlot,
    scheduledTime: draft.scheduledTime,
    active: draft.active,
    familyAllowed: profile.familyShowDetailedMeds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `medications/${medId}`);
  }
}

export async function toggleMedicationActiveStatus(
  med: Medication,
  nextActive: boolean,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'medications', med.id), {
    active: nextActive,
    updatedAt: serverTimestamp(),
  });
  if (med.scheduleId) {
    batch.update(doc(db, 'medicationSchedules', med.scheduleId), {
      active: nextActive,
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `medications/${med.id}`);
  }
}

export async function deleteMedicationWithSchedules(med: Medication): Promise<void> {
  try {
    if (med.scheduleId) {
      await deleteDoc(doc(db, 'medicationSchedules', med.scheduleId));
    }
    await deleteDoc(doc(db, 'medications', med.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `medications/${med.id}`);
  }
}

export async function upsertDoseRecord(params: {
  profile: PatientProfileRecord;
  medication: Medication;
  existingLog?: DoseLog;
  scheduledDate: string;
  status: DoseStatus;
  uid: string;
  actorName: string;
  confirmedAt?: string;
  note?: string;
}): Promise<void> {
  const {
    profile,
    medication,
    existingLog,
    scheduledDate,
    status,
    uid,
    actorName,
    confirmedAt,
    note,
  } = params;
  const clinicalUids = Array.from(
    new Set([profile.ownerUid, ...profile.caregiverUids]),
  );

  if (existingLog) {
    const path = `adherenceRecords/${existingLog.id}`;
    try {
      await updateDoc(doc(db, 'adherenceRecords', existingLog.id), {
        status,
        confirmedAt: confirmedAt || '',
        confirmedByUid: uid,
        confirmedByName: actorName.slice(0, 120),
        note: (note || '').slice(0, 300),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  const recordId = generateSecureId('adh');
  const path = `adherenceRecords/${recordId}`;
  try {
    await setDoc(doc(db, 'adherenceRecords', recordId), {
      id: recordId,
      profileId: profile.id,
      medicationId: medication.id,
      ...(medication.scheduleId ? { scheduleId: medication.scheduleId } : {}),
      ownerUid: profile.ownerUid,
      authorizedUids: profile.authorizedUids,
      clinicalUids,
      medicationName: medication.name.slice(0, 120),
      dosage: medication.dosage.slice(0, 60),
      scheduledDate,
      scheduledTime: medication.scheduledTime,
      status,
      ...(confirmedAt ? { confirmedAt } : {}),
      confirmedByUid: uid,
      confirmedByName: actorName.slice(0, 120),
      note: (note || '').slice(0, 300),
      familyAllowed: profile.familyShowDetailedMeds && profile.familyShowAdherencePct,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createAppointmentDoc(params: {
  profile: PatientProfileRecord;
  uid: string;
  appt: Omit<Appointment, 'id'>;
}): Promise<void> {
  const { profile, uid, appt } = params;
  const apptId = generateSecureId('appt');
  const clinicalUids = Array.from(
    new Set([profile.ownerUid, ...profile.caregiverUids]),
  );
  const path = `appointments/${apptId}`;
  try {
    await setDoc(doc(db, 'appointments', apptId), {
      id: apptId,
      profileId: profile.id,
      ownerUid: profile.ownerUid,
      authorizedUids: profile.authorizedUids,
      clinicalUids,
      createdBy: uid,
      title: appt.title.trim().slice(0, 140),
      doctorName: appt.doctorName.trim().slice(0, 120),
      specialty: appt.specialty.trim().slice(0, 100),
      date: appt.date,
      time: appt.time,
      location: appt.location.trim().slice(0, 200),
      assignedCaregiver: appt.assignedCaregiver.trim().slice(0, 120),
      notes: appt.notes.trim().slice(0, 400),
      status: appt.status,
      familyAllowed: profile.familyShowAppointments,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAppointmentStatusDoc(
  apptId: string,
  status: Appointment['status'],
): Promise<void> {
  const path = `appointments/${apptId}`;
  try {
    await updateDoc(doc(db, 'appointments', apptId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createAlertDoc(params: {
  profile: PatientProfileRecord;
  severity: ClinicalAlert['severity'];
  title: string;
  detail: string;
}): Promise<void> {
  const alertId = generateSecureId('alrt');
  const path = `alerts/${alertId}`;
  try {
    await setDoc(doc(db, 'alerts', alertId), {
      id: alertId,
      profileId: params.profile.id,
      ownerUid: params.profile.ownerUid,
      authorizedUids: params.profile.authorizedUids,
      patientName: params.profile.fullName.slice(0, 120),
      severity: params.severity,
      title: params.title.slice(0, 140),
      detail: params.detail.slice(0, 400),
      resolved: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function resolveAlertDoc(alertId: string, uid: string): Promise<void> {
  const path = `alerts/${alertId}`;
  try {
    await updateDoc(doc(db, 'alerts', alertId), {
      resolved: true,
      resolvedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createCaregiverHandoffDoc(params: {
  profile: PatientProfileRecord;
  uid: string;
  handoff: Omit<CareRelayHandoff, 'id' | 'createdAt'>;
}): Promise<void> {
  const availId = generateSecureId('relay');
  const path = `caregiverAvailability/${availId}`;
  try {
    await setDoc(doc(db, 'caregiverAvailability', availId), {
      id: availId,
      profileId: params.profile.id,
      ownerUid: params.profile.ownerUid,
      authorizedUids: params.profile.authorizedUids,
      caregiverUid: params.uid,
      fromCaregiver: params.handoff.fromCaregiver.trim().slice(0, 120),
      toCaregiver: params.handoff.toCaregiver.trim().slice(0, 120),
      shiftWindow: params.handoff.shiftWindow.trim().slice(0, 80),
      summary: params.handoff.summary.trim().slice(0, 500),
      status: params.handoff.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function acknowledgeHandoffDoc(availId: string): Promise<void> {
  const path = `caregiverAvailability/${availId}`;
  try {
    await updateDoc(doc(db, 'caregiverAvailability', availId), {
      status: 'acknowledged',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCaregiverAvailabilityDoc(
  relId: string,
  availabilityStatus: CaregiverAvailabilityStatus,
): Promise<void> {
  const path = `caregiverRelationships/${relId}`;
  try {
    await updateDoc(doc(db, 'caregiverRelationships', relId), {
      availabilityStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCaregiverTierDoc(
  relId: string,
  tier: CaregiverTier,
): Promise<void> {
  const path = `caregiverRelationships/${relId}`;
  try {
    await updateDoc(doc(db, 'caregiverRelationships', relId), {
      tier,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createProfileInvitationDoc(params: {
  profile: PatientProfileRecord;
  issuedByUid: string;
  targetEmail: string;
  targetRole: 'caregiver' | 'family';
  relation: string;
}): Promise<string> {
  const inviteId = generateSecureId('inv');
  const path = `invitations/${inviteId}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
  try {
    await setDoc(doc(db, 'invitations', inviteId), {
      id: inviteId,
      profileId: params.profile.id,
      patientName: params.profile.fullName.slice(0, 120),
      issuedByUid: params.issuedByUid,
      targetEmail: params.targetEmail.trim().toLowerCase().slice(0, 254),
      targetRole: params.targetRole,
      relation: params.relation.trim().slice(0, 80),
      status: 'pending',
      expiresAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return inviteId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function revokeInvitationDoc(inviteId: string): Promise<void> {
  const path = `invitations/${inviteId}`;
  try {
    await updateDoc(doc(db, 'invitations', inviteId), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function acceptInvitationInFirestore(
  inviteCode: string,
): Promise<{ accepted: boolean; pendingOwnerSync: boolean }> {
  const cleanCode = inviteCode.trim();
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(cleanCode)) {
    throw new Error('Enter a valid Care Circle invitation code.');
  }
  if (!auth.currentUser) {
    throw new Error('Please sign in first.');
  }
  if (!auth.currentUser.emailVerified) {
    throw new Error('Verify your email address before accepting a Care Circle invitation.');
  }

  const path = `invitations/${cleanCode}`;
  try {
    await updateDoc(doc(db, 'invitations', cleanCode), {
      status: 'accepted',
      acceptedByUid: auth.currentUser.uid,
      updatedAt: serverTimestamp(),
    });
    return { accepted: true, pendingOwnerSync: true };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncAcceptedInvitesForOwner(
  profile: PatientProfileRecord,
  invitations: InvitationRecord[],
): Promise<void> {
  const toSync = invitations.filter(
    (inv) =>
      inv.status === 'accepted' &&
      inv.acceptedByUid &&
      !profile.authorizedUids.includes(inv.acceptedByUid),
  );
  if (toSync.length === 0) return;

  const caregiverUids = [...profile.caregiverUids];
  const familyUids = [...profile.familyUids];
  const pendingCaregiverWrites: Array<{
    relId: string;
    caregiverUid: string;
    caregiverName: string;
    relation: string;
    tier: CaregiverTier;
  }> = [];
  const pendingFamilyWrites: Array<{
    memId: string;
    memberUid: string;
    memberName: string;
    relation: string;
  }> = [];

  for (const inv of toSync) {
    const memberUid = inv.acceptedByUid!;
    if (inv.targetRole === 'caregiver') {
      const assignedTier: CaregiverTier = caregiverUids.length === 0 ? 'primary' : 'backup';
      caregiverUids.push(memberUid);
      pendingCaregiverWrites.push({
        relId: generateSecureId('rel'),
        caregiverUid: memberUid,
        caregiverName: inv.targetEmail.split('@')[0] || 'Caregiver',
        relation: inv.relation || (assignedTier === 'primary' ? 'Primary Caregiver' : 'Backup Caregiver'),
        tier: assignedTier,
      });
    } else {
      familyUids.push(memberUid);
      pendingFamilyWrites.push({
        memId: generateSecureId('fam'),
        memberUid,
        memberName: inv.targetEmail.split('@')[0] || 'Family Member',
        relation: inv.relation || 'Family Member',
      });
    }
  }

  const nextLists = buildAuthorizedLists({
    ownerUid: profile.ownerUid,
    caregiverUids,
    familyUids,
  });

  const batch = writeBatch(db);

  for (const cw of pendingCaregiverWrites) {
    batch.set(doc(db, 'caregiverRelationships', cw.relId), {
      id: cw.relId,
      profileId: profile.id,
      patientOwnerUid: profile.ownerUid,
      caregiverUid: cw.caregiverUid,
      caregiverName: cw.caregiverName,
      relation: cw.relation,
      status: 'active',
      tier: cw.tier,
      availabilityStatus: 'available',
      shiftWindow: cw.tier === 'backup' ? 'Backup Care Relay' : 'Primary Care Relay',
      authorizedUids: nextLists.authorizedUids,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const fw of pendingFamilyWrites) {
    batch.set(doc(db, 'familyMemberships', fw.memId), {
      id: fw.memId,
      profileId: profile.id,
      patientOwnerUid: profile.ownerUid,
      memberUid: fw.memberUid,
      memberName: fw.memberName,
      relation: fw.relation,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Keep authorizedUids synchronized on existing caregiverRelationships docs for this profile
  const existingCaregiverSnap = await getDocs(
    query(
      collection(db, 'caregiverRelationships'),
      where('patientOwnerUid', '==', profile.ownerUid),
    ),
  );
  existingCaregiverSnap.docs
    .filter((d) => d.data().profileId === profile.id)
    .forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
        updatedAt: serverTimestamp(),
      });
    });

  batch.update(doc(db, 'patientProfiles', profile.id), {
    caregiverUids: nextLists.caregiverUids,
    familyUids: nextLists.familyUids,
    authorizedUids: nextLists.authorizedUids,
    updatedAt: serverTimestamp(),
  });

  for (const colName of ['medications', 'medicationSchedules', 'adherenceRecords', 'appointments']) {
    const snap = await getDocs(
      query(
        collection(db, colName),
        where('profileId', '==', profile.id),
        where('clinicalUids', 'array-contains', profile.ownerUid),
      ),
    );
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
        clinicalUids: nextLists.clinicalUids,
        familyAllowed: Boolean(d.data().familyAllowed ?? true),
        updatedAt: serverTimestamp(),
      });
    });
  }

  for (const colName of ['alerts', 'caregiverAvailability']) {
    const snap = await getDocs(
      query(
        collection(db, colName),
        where('profileId', '==', profile.id),
        where('authorizedUids', 'array-contains', profile.ownerUid),
      ),
    );
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
        updatedAt: serverTimestamp(),
      });
    });
  }

  for (const colName of ['notificationDeliveries', 'schedulerRuns']) {
    const snap = await getDocs(
      query(
        collection(db, colName),
        where('profileId', '==', profile.id),
        where('authorizedUids', 'array-contains', profile.ownerUid),
      ),
    );
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
      });
    });
  }

  {
    const snap = await getDocs(
      query(
        collection(db, 'medicationChanges'),
        where('profileId', '==', profile.id),
        where('clinicalUids', 'array-contains', profile.ownerUid),
      ),
    );
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
        clinicalUids: nextLists.clinicalUids,
        familyAllowed: Boolean(d.data().familyAllowed ?? true),
      });
    });
  }

  await batch.commit();
}

export async function revokeProfileMemberAccess(params: {
  profile: PatientProfileRecord;
  member: CareCircleMember;
}): Promise<void> {
  const { profile, member } = params;
  if (!member.uid || member.uid === profile.ownerUid) return;

  const nextLists = buildAuthorizedLists({
    ownerUid: profile.ownerUid,
    caregiverUids: profile.caregiverUids.filter((u) => u !== member.uid),
    familyUids: profile.familyUids.filter((u) => u !== member.uid),
  });

  const batch = writeBatch(db);
  batch.update(doc(db, 'patientProfiles', profile.id), {
    caregiverUids: nextLists.caregiverUids,
    familyUids: nextLists.familyUids,
    authorizedUids: nextLists.authorizedUids,
    updatedAt: serverTimestamp(),
  });

  if (member.role === 'caregiver') {
    batch.update(doc(db, 'caregiverRelationships', member.id), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  } else if (member.role === 'family') {
    batch.update(doc(db, 'familyMemberships', member.id), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  }

  const existingCaregiverSnap = await getDocs(
    query(
      collection(db, 'caregiverRelationships'),
      where('patientOwnerUid', '==', profile.ownerUid),
    ),
  );
  existingCaregiverSnap.docs
    .filter((d) => d.data().profileId === profile.id && d.id !== member.id)
    .forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
        updatedAt: serverTimestamp(),
      });
    });

  for (const colName of ['medications', 'medicationSchedules', 'adherenceRecords', 'appointments']) {
    const snap = await getDocs(
      query(
        collection(db, colName),
        where('profileId', '==', profile.id),
        where('clinicalUids', 'array-contains', profile.ownerUid),
      ),
    );
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
        clinicalUids: nextLists.clinicalUids,
        familyAllowed: Boolean(d.data().familyAllowed ?? true),
        updatedAt: serverTimestamp(),
      });
    });
  }

  for (const colName of ['alerts', 'caregiverAvailability']) {
    const snap = await getDocs(
      query(
        collection(db, colName),
        where('profileId', '==', profile.id),
        where('authorizedUids', 'array-contains', profile.ownerUid),
      ),
    );
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
        updatedAt: serverTimestamp(),
      });
    });
  }

  for (const colName of ['notificationDeliveries', 'schedulerRuns']) {
    const snap = await getDocs(
      query(
        collection(db, colName),
        where('profileId', '==', profile.id),
        where('authorizedUids', 'array-contains', profile.ownerUid),
      ),
    );
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
      });
    });
  }

  {
    const snap = await getDocs(
      query(
        collection(db, 'medicationChanges'),
        where('profileId', '==', profile.id),
        where('clinicalUids', 'array-contains', profile.ownerUid),
      ),
    );
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        authorizedUids: nextLists.authorizedUids,
        clinicalUids: nextLists.clinicalUids,
        familyAllowed: Boolean(d.data().familyAllowed ?? true),
      });
    });
  }

  await batch.commit();
}

export async function createEmergencyTokenDoc(params: {
  profile: PatientProfileRecord;
  ownerUid: string;
  label: string;
  includeMedications: boolean;
  validHours: number;
}): Promise<string> {
  const tokenId = generateSecureId('emg', 16);
  const path = `emergencyTokens/${tokenId}`;
  const expiresAt = Timestamp.fromMillis(
    Date.now() + params.validHours * 60 * 60 * 1000,
  );
  try {
    await setDoc(doc(db, 'emergencyTokens', tokenId), {
      id: tokenId,
      profileId: params.profile.id,
      ownerUid: params.ownerUid,
      label: params.label.trim().slice(0, 100),
      includeMedications: params.includeMedications,
      revoked: false,
      expiresAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return tokenId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function revokeEmergencyTokenDoc(tokenId: string): Promise<void> {
  const path = `emergencyTokens/${tokenId}`;
  try {
    await updateDoc(doc(db, 'emergencyTokens', tokenId), {
      revoked: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveAiConversationDoc(params: {
  profile: PatientProfileRecord;
  uid: string;
  sender: 'user' | 'pillu';
  text: string;
}): Promise<void> {
  const msgId = generateSecureId('msg');
  const path = `aiConversations/${msgId}`;
  try {
    await setDoc(doc(db, 'aiConversations', msgId), {
      id: msgId,
      profileId: params.profile.id,
      ownerUid: params.profile.ownerUid,
      userId: params.uid,
      sender: params.sender,
      text: params.text.slice(0, 4000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
