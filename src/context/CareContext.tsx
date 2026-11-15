import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth, testFirestoreConnection } from '../lib/firebase';
import {
  loginWithEmail,
  loginWithGoogle,
  logoutUser,
  mapFirebaseAuthError,
  refreshCurrentUser,
  registerWithEmail,
  resendVerificationEmail,
  sendPasswordReset,
} from '../services/authService';
import {
  acceptInvitationInFirestore,
  createPatientProfile,
  createProfileInvitationDoc,
  revokeInvitationDoc,
  revokeProfileMemberAccess,
  saveAiConversationDoc,
  subscribeToAuthorizedProfiles,
  subscribeToIncomingInvitations,
  subscribeToProfileCollections,
  subscribeToUserAccount,
  subscribeToUserPrivate,
  syncAcceptedInvitesForOwner,
  updateCaregiverAvailabilityDoc,
  updateCaregiverTierDoc,
  updateFamilyPermissionsAndSync,
  updatePatientProfileDetails,
  updateUserAccountDoc,
  updateUserPrivateDoc,
} from '../services/firestoreService';
import {
  apiAcknowledgeCareRelayHandoff,
  apiCreateAppointment,
  apiCreateCareAlert,
  apiCreateCareRelayHandoff,
  apiCreateEmergencyToken,
  apiCreateMedication,
  apiDeleteAppointment,
  apiDeleteMedication,
  apiDiscontinueMedication,
  apiNotifyUnconfirmedDoses,
  apiRecordAdherence,
  apiResolveAlert,
  apiRevokeEmergencyToken,
  apiRunSchedulerNow,
  apiToggleMedicationActive,
  apiUpdateAppointment,
  apiUpdateAppointmentStatus,
  apiUpdateMedication,
  notifySessionLogout,
  sendSessionHeartbeat,
} from '../services/backendApi';
import { getTodayIsoDate, ROLE_AVATARS } from '../data/seedData';
import type {
  Appointment,
  CareCircleMember,
  CaregiverAvailabilityStatus,
  CaregiverTier,
  CareRelayHandoff,
  CareUpdate,
  ClinicalAlert,
  CompanionMessage,
  DoseLog,
  DoseStatus,
  EmergencyHealthPassport,
  EmergencyTokenRecord,
  FamilyVisibilityPermissions,
  InvitationRecord,
  Medication,
  MedicationChangeEvent,
  NotificationCapabilityReport,
  NotificationDeliveryRecord,
  PatientProfileRecord,
  ScheduledDoseInstance,
  SchedulerRunRecord,
  SchedulerStatusInfo,
  UserAccount,
  UserPrivateInfo,
  UserProfile,
  UserRole,
  UserSettings,
} from '../types/pilluminati';
import { expandScheduledDosesForDate } from '../utils/medicationEngine';
import { resolveProfileRole } from '../utils/rbac';

const DEFAULT_SETTINGS: UserSettings = {
  textScale: 'standard',
  highContrast: false,
  reducedMotion: false,
  reminderLeadMinutes: 15,
  careRelayEscalationMinutes: 60,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

const WELCOME_MESSAGE: CompanionMessage = {
  id: 'welcome-pillu',
  sender: 'pillu',
  text: 'Hello! I am Pillu, your calm medication and care companion. Ask me about today’s doses, upcoming visits, or how to coordinate with your care circle.',
  timestamp: 'Now',
};

interface CareContextValue {
  firebaseUser: FirebaseUser | null;
  authLoading: boolean;
  dataLoading: boolean;
  emailVerified: boolean;
  userAccount: UserAccount | null;
  userPrivate: UserPrivateInfo | null;
  authorizedProfiles: PatientProfileRecord[];
  activePatientProfile: PatientProfileRecord | null;
  activeRole: UserRole;
  isProfileOwner: boolean;
  canEditClinical: boolean;
  activeProfile: UserProfile;
  selectActiveProfile: (profileId: string) => Promise<void>;
  createNewPatientProfile: (draft: {
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
  }) => Promise<string>;
  updateActiveProfile: (updates: Partial<UserProfile>) => Promise<void>;
  medications: Medication[];
  medicationChanges: MedicationChangeEvent[];
  scheduledDosesToday: ScheduledDoseInstance[];
  addMedication: (med: Omit<Medication, 'id'>) => Promise<void>;
  updateMedication: (
    medId: string,
    med: Omit<Medication, 'id'> & { changeNote?: string },
  ) => Promise<void>;
  discontinueMedication: (medId: string, reason: string) => Promise<void>;
  toggleMedicationActive: (medId: string) => Promise<void>;
  deleteMedication: (medId: string) => Promise<void>;
  doseLogs: DoseLog[];
  markDoseStatus: (
    medication: Medication,
    status: DoseStatus,
    note?: string,
  ) => Promise<void>;
  markDoseInstanceStatus: (
    instance: ScheduledDoseInstance,
    status: DoseStatus,
    opts?: {
      note?: string;
      correctedFromStatus?: DoseStatus;
      correctionReason?: string;
      actualConfirmedAt?: string;
    },
  ) => Promise<void>;
  justConfirmedDoseId: string | null;
  appointments: Appointment[];
  addAppointment: (appt: Omit<Appointment, 'id'>) => Promise<void>;
  updateAppointment: (
    apptId: string,
    appt: Omit<Appointment, 'id' | 'status'>,
  ) => Promise<void>;
  updateAppointmentStatus: (
    apptId: string,
    status: Appointment['status'],
  ) => Promise<void>;
  deleteAppointment: (apptId: string) => Promise<void>;
  members: CareCircleMember[];
  updateCaregiverAvailability: (
    relId: string,
    status: CaregiverAvailabilityStatus,
  ) => Promise<void>;
  updateCaregiverTier: (relId: string, tier: CaregiverTier) => Promise<void>;
  invitations: InvitationRecord[];
  incomingInvitations: InvitationRecord[];
  inviteMember: (input: {
    email: string;
    role: 'caregiver' | 'family';
    relation: string;
  }) => Promise<string>;
  revokeInvitation: (inviteId: string) => Promise<void>;
  acceptInvitationCode: (
    inviteCode: string,
  ) => Promise<{ accepted: boolean; pendingOwnerSync?: boolean }>;
  revokeMember: (member: CareCircleMember) => Promise<void>;
  handoffs: CareRelayHandoff[];
  createHandoff: (handoff: Omit<CareRelayHandoff, 'id' | 'createdAt'>) => Promise<void>;
  acknowledgeHandoff: (handoffId: string) => Promise<void>;
  careUpdates: CareUpdate[];
  addCareUpdate: (category: CareUpdate['category'], message: string) => Promise<void>;
  alerts: ClinicalAlert[];
  patientFeelingUnwell: boolean;
  reportPatientWellness: (unwell: boolean, note?: string) => Promise<void>;
  notificationDeliveries: NotificationDeliveryRecord[];
  schedulerRuns: SchedulerRunRecord[];
  schedulerStatus: SchedulerStatusInfo | null;
  runSchedulerNow: () => Promise<string>;
  notifyUnconfirmedDoses: () => Promise<{
    summary: string;
    overdueFound: number;
    alertsCreated: number;
    notifications: NotificationCapabilityReport;
    automaticOfflineEscalation: { implemented: boolean; note: string };
  }>;
  resolveAlert: (alertId: string) => Promise<void>;
  passport: EmergencyHealthPassport;
  updatePassport: (next: EmergencyHealthPassport) => Promise<void>;
  emergencyTokens: EmergencyTokenRecord[];
  latestQrByToken: Record<string, string>;
  createEmergencyToken: (params: {
    label: string;
    includeMedications: boolean;
    validHours: number;
  }) => Promise<string>;
  revokeEmergencyToken: (tokenId: string) => Promise<void>;
  familyPermissions: FamilyVisibilityPermissions;
  updateFamilyPermissions: (
    updates: Partial<FamilyVisibilityPermissions>,
  ) => Promise<void>;
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
  companionMessages: CompanionMessage[];
  appendCompanionMessage: (sender: 'user' | 'pillu', text: string) => Promise<void>;
  signInWithGoogle: (preferredRole?: UserRole) => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  registerWithEmailPassword: (params: {
    email: string;
    password: string;
    displayName: string;
    accountRole: UserRole;
  }) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshVerification: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  todayDate: string;
  authError: string | null;
  clearAuthError: () => void;
  dataError: string | null;
  clearDataError: () => void;
}

const CareContext = createContext<CareContextValue | null>(null);

export function CareProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [justConfirmedDoseId, setJustConfirmedDoseId] = useState<string | null>(null);

  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [userPrivate, setUserPrivate] = useState<UserPrivateInfo | null>(null);
  const [authorizedProfiles, setAuthorizedProfiles] = useState<PatientProfileRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationChanges, setMedicationChanges] = useState<MedicationChangeEvent[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [alerts, setAlerts] = useState<ClinicalAlert[]>([]);
  const [notificationDeliveries, setNotificationDeliveries] = useState<
    NotificationDeliveryRecord[]
  >([]);
  const [schedulerRuns, setSchedulerRuns] = useState<SchedulerRunRecord[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatusInfo | null>(
    null,
  );
  const [latestQrByToken, setLatestQrByToken] = useState<Record<string, string>>({});
  const [handoffs, setHandoffs] = useState<CareRelayHandoff[]>([]);
  const [caregiverMembers, setCaregiverMembers] = useState<CareCircleMember[]>([]);
  const [familyMembers, setFamilyMembers] = useState<CareCircleMember[]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [incomingInvitations, setIncomingInvitations] = useState<InvitationRecord[]>([]);
  const [emergencyTokens, setEmergencyTokens] = useState<EmergencyTokenRecord[]>([]);
  const [aiMessages, setAiMessages] = useState<CompanionMessage[]>([]);
  const [clockNow, setClockNow] = useState<Date>(() => new Date());

  const todayDate = useMemo(() => getTodayIsoDate(), [clockNow.getDate()]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Boot Firestore connection probe & Auth state listener
  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (!user) {
        setUserAccount(null);
        setUserPrivate(null);
        setAuthorizedProfiles([]);
        setSelectedProfileId(null);
        setMedications([]);
        setMedicationChanges([]);
        setDoseLogs([]);
        setAppointments([]);
        setAlerts([]);
        setNotificationDeliveries([]);
        setSchedulerRuns([]);
        setSchedulerStatus(null);
        setLatestQrByToken({});
        setHandoffs([]);
        setCaregiverMembers([]);
        setFamilyMembers([]);
        setInvitations([]);
        setIncomingInvitations([]);
        setEmergencyTokens([]);
        setAiMessages([]);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to user account, PII private info, authorized patient profiles, and incoming invites
  useEffect(() => {
    if (!firebaseUser) return;
    setDataLoading(true);
    const unsubs = [
      subscribeToUserAccount(firebaseUser.uid, (acc) => {
        setUserAccount(acc);
        if (acc?.activeProfileId) {
          setSelectedProfileId((curr) => curr ?? acc.activeProfileId!);
        }
      }),
      subscribeToUserPrivate(firebaseUser.uid, setUserPrivate),
      subscribeToAuthorizedProfiles(firebaseUser.uid, (profiles) => {
        setAuthorizedProfiles(profiles);
        setDataLoading(false);
      }),
      subscribeToIncomingInvitations(
        firebaseUser.emailVerified ? firebaseUser.email || '' : '',
        setIncomingInvitations,
      ),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [firebaseUser]);

  const activePatientProfile = useMemo(() => {
    if (authorizedProfiles.length === 0) return null;
    const preferred = selectedProfileId || userAccount?.activeProfileId;
    return (
      authorizedProfiles.find((p) => p.id === preferred) || authorizedProfiles[0]
    );
  }, [authorizedProfiles, selectedProfileId, userAccount?.activeProfileId]);

  const activeRole: UserRole = useMemo(() => {
    if (activePatientProfile && firebaseUser) {
      const derived = resolveProfileRole(activePatientProfile, firebaseUser.uid);
      if (derived) return derived;
    }
    return userAccount?.accountRole || 'patient';
  }, [activePatientProfile, firebaseUser, userAccount?.accountRole]);

  const isProfileOwner = Boolean(
    activePatientProfile &&
      firebaseUser &&
      activePatientProfile.ownerUid === firebaseUser.uid,
  );

  const canEditClinical = activeRole === 'patient' || activeRole === 'caregiver';

  // Subscribe to active profile collections
  useEffect(() => {
    if (!firebaseUser || !activePatientProfile) {
      setMedications([]);
      setMedicationChanges([]);
      setDoseLogs([]);
      setAppointments([]);
      setAlerts([]);
      setNotificationDeliveries([]);
      setSchedulerRuns([]);
      setHandoffs([]);
      setCaregiverMembers([]);
      setFamilyMembers([]);
      setInvitations([]);
      setEmergencyTokens([]);
      setAiMessages([]);
      return;
    }

    return subscribeToProfileCollections(
      activePatientProfile,
      firebaseUser.uid,
      activeRole,
      {
        onMedications: setMedications,
        onSchedules: () => {},
        onMedicationChanges: setMedicationChanges,
        onDoseLogs: setDoseLogs,
        onAppointments: setAppointments,
        onAlerts: setAlerts,
        onHandoffs: setHandoffs,
        onCaregivers: setCaregiverMembers,
        onFamilyMembers: setFamilyMembers,
        onInvitations: setInvitations,
        onEmergencyTokens: setEmergencyTokens,
        onAiMessages: setAiMessages,
        onNotificationDeliveries: setNotificationDeliveries,
        onSchedulerRuns: setSchedulerRuns,
      },
    );
  }, [firebaseUser, activePatientProfile, activeRole]);

  // Register active session with server scheduler and keep ID token fresh every 10 minutes
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    const ping = () => {
      sendSessionHeartbeat(activePatientProfile?.id)
        .then((res) => {
          if (!cancelled) setSchedulerStatus(res.scheduler);
        })
        .catch(() => {
          // Ignore transient heartbeat errors
        });
    };
    ping();
    const timer = window.setInterval(ping, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [firebaseUser, activePatientProfile?.id]);

  // If owner has invites accepted via client fallback, automatically sync them into profile lists
  useEffect(() => {
    if (!isProfileOwner || !activePatientProfile || invitations.length === 0) return;
    syncAcceptedInvitesForOwner(activePatientProfile, invitations).catch((err) => {
      console.warn('Pending invite sync note:', err);
    });
  }, [isProfileOwner, activePatientProfile, invitations]);

  const settings: UserSettings = useMemo(
    () => ({
      ...DEFAULT_SETTINGS,
      textScale: userAccount?.textScale || 'standard',
      highContrast: userAccount?.highContrast ?? false,
      reducedMotion: userAccount?.reducedMotion ?? false,
      reminderLeadMinutes: userAccount?.reminderLeadMinutes || 15,
    }),
    [userAccount],
  );

  // Apply elderly accessibility classes to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('text-scale-large', 'text-scale-xl', 'high-contrast');
    if (settings.textScale === 'large') {
      root.classList.add('text-scale-large');
    } else if (settings.textScale === 'xl') {
      root.classList.add('text-scale-xl');
    }
    if (settings.highContrast) {
      root.classList.add('high-contrast');
    }
  }, [settings.textScale, settings.highContrast]);

  const activeProfile: UserProfile = useMemo(() => {
    const name =
      userAccount?.displayName ||
      firebaseUser?.displayName ||
      firebaseUser?.email?.split('@')[0] ||
      'Care Circle Member';
    return {
      id: firebaseUser?.uid || '',
      displayName: name,
      email: userPrivate?.email || firebaseUser?.email || '',
      phone: userPrivate?.phone || '',
      address: userPrivate?.address || '',
      role: activeRole,
      relation:
        activeRole === 'patient'
          ? 'Profile Owner'
          : activeRole === 'caregiver'
            ? 'Authorized Caregiver'
            : 'Family Member',
      avatarUrl: ROLE_AVATARS[activeRole],
      emergencyContactName: activePatientProfile?.emergencyContactName || '',
      emergencyContactPhone: activePatientProfile?.emergencyContactPhone || '',
    };
  }, [userAccount, userPrivate, firebaseUser, activeRole, activePatientProfile]);

  const members: CareCircleMember[] = useMemo(() => {
    if (!activePatientProfile) return [];
    const ownerEntry: CareCircleMember = {
      id: activePatientProfile.ownerUid,
      uid: activePatientProfile.ownerUid,
      name: activePatientProfile.fullName,
      role: 'patient',
      relation: 'Patient Profile Owner',
      phone: activePatientProfile.phone,
      email: '',
      avatarUrl: ROLE_AVATARS.patient,
      lastActive: 'Profile Owner',
    };
    return [
      ownerEntry,
      ...caregiverMembers.filter((m) => m.status !== 'revoked'),
      ...familyMembers.filter((m) => m.status !== 'revoked'),
    ];
  }, [activePatientProfile, caregiverMembers, familyMembers]);

  const careUpdates: CareUpdate[] = useMemo(() => {
    return handoffs.map((h) => ({
      id: h.id,
      authorName: h.fromCaregiver,
      authorRole: 'caregiver',
      category: 'relay',
      message: `Care Relay to ${h.toCaregiver} (${h.shiftWindow}): ${h.summary}`,
      createdAt: h.createdAt,
    }));
  }, [handoffs]);

  const passport: EmergencyHealthPassport = useMemo(() => {
    if (!activePatientProfile) {
      return {
        patientFullName: '',
        dateOfBirth: '',
        bloodType: '',
        allergies: [],
        conditions: [],
        primaryPhysician: '',
        physicianPhone: '',
        pharmacyName: '',
        pharmacyPhone: '',
        emergencyContactName: '',
        emergencyContactRelation: '',
        emergencyContactPhone: '',
        advanceDirectiveNote: '',
        updatedAt: 'Today',
      };
    }
    return {
      patientFullName: activePatientProfile.fullName,
      dateOfBirth: activePatientProfile.dateOfBirth,
      bloodType: activePatientProfile.bloodType || 'Not specified',
      allergies: activePatientProfile.allergiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      conditions: activePatientProfile.conditionsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      primaryPhysician: activePatientProfile.primaryPhysician,
      physicianPhone: activePatientProfile.physicianPhone,
      pharmacyName: activePatientProfile.pharmacyName,
      pharmacyPhone: activePatientProfile.pharmacyPhone,
      emergencyContactName: activePatientProfile.emergencyContactName,
      emergencyContactRelation: activePatientProfile.emergencyContactRelation,
      emergencyContactPhone: activePatientProfile.emergencyContactPhone,
      advanceDirectiveNote: activePatientProfile.advanceDirectiveNote,
      updatedAt: activePatientProfile.updatedAtLabel,
    };
  }, [activePatientProfile]);

  const familyPermissions: FamilyVisibilityPermissions = useMemo(
    () => ({
      showDetailedMedications: activePatientProfile?.familyShowDetailedMeds ?? true,
      showAdherencePercentage: activePatientProfile?.familyShowAdherencePct ?? true,
      showAppointments: activePatientProfile?.familyShowAppointments ?? true,
      showCareUpdates: activePatientProfile?.familyShowCareUpdates ?? true,
      showEmergencyPassport: activePatientProfile?.familyShowPassport ?? true,
    }),
    [activePatientProfile],
  );

  const companionMessages = useMemo(
    () => (aiMessages.length > 0 ? aiMessages : [WELCOME_MESSAGE]),
    [aiMessages],
  );

  const runAction = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setDataError(null);
    try {
      return await fn();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Unable to save changes to Firestore.';
      setDataError(msg);
      throw error;
    }
  };

  const selectActiveProfile = async (profileId: string) => {
    setSelectedProfileId(profileId);
    if (firebaseUser) {
      await updateUserAccountDoc(firebaseUser.uid, { activeProfileId: profileId });
    }
  };

  const createNewPatientProfile = async (
    draft: Parameters<CareContextValue['createNewPatientProfile']>[0],
  ) => {
    if (!firebaseUser) throw new Error('Sign in required.');
    return runAction(async () => {
      const id = await createPatientProfile(firebaseUser.uid, draft);
      setSelectedProfileId(id);
      return id;
    });
  };

  const updateActiveProfile = async (updates: Partial<UserProfile>) => {
    if (!firebaseUser) return;
    await runAction(async () => {
      if (updates.displayName !== undefined) {
        await updateUserAccountDoc(firebaseUser.uid, {
          displayName: updates.displayName,
        });
      }
      if (
        updates.phone !== undefined ||
        updates.address !== undefined ||
        updates.email !== undefined
      ) {
        await updateUserPrivateDoc(firebaseUser.uid, {
          phone: updates.phone,
          address: updates.address,
          email: updates.email,
        });
      }
      if (
        activePatientProfile &&
        canEditClinical &&
        (updates.emergencyContactName !== undefined ||
          updates.emergencyContactPhone !== undefined)
      ) {
        await updatePatientProfileDetails(
          activePatientProfile.id,
          {
            emergencyContactName: updates.emergencyContactName,
            emergencyContactPhone: updates.emergencyContactPhone,
          },
          isProfileOwner,
        );
      }
    });
  };

  const scheduledDosesToday = useMemo(
    () => expandScheduledDosesForDate(medications, doseLogs, todayDate, clockNow),
    [medications, doseLogs, todayDate, clockNow],
  );

  const addMedication = async (med: Omit<Medication, 'id'>) => {
    if (!firebaseUser || !activePatientProfile) return;
    await runAction(() => apiCreateMedication(activePatientProfile.id, med));
  };

  const updateMedication = async (
    medId: string,
    med: Omit<Medication, 'id'> & { changeNote?: string },
  ) => {
    if (!firebaseUser || !activePatientProfile) return;
    await runAction(() => apiUpdateMedication(medId, med));
  };

  const discontinueMedication = async (medId: string, reason: string) => {
    if (!firebaseUser || !activePatientProfile) return;
    await runAction(() => apiDiscontinueMedication(medId, reason));
  };

  const toggleMedicationActive = async (medId: string) => {
    await runAction(() => apiToggleMedicationActive(medId));
  };

  const deleteMedication = async (medId: string) => {
    await runAction(() => apiDeleteMedication(medId));
  };

  const markDoseInstanceStatus = async (
    instance: ScheduledDoseInstance,
    status: DoseStatus,
    opts?: {
      note?: string;
      correctedFromStatus?: DoseStatus;
      correctionReason?: string;
      actualConfirmedAt?: string;
    },
  ) => {
    if (!firebaseUser || !activePatientProfile) return;

    if (status === 'taken' || status === 'corrected') {
      setJustConfirmedDoseId(instance.doseKey);
      window.setTimeout(() => {
        setJustConfirmedDoseId((curr) => (curr === instance.doseKey ? null : curr));
      }, 3200);
    }

    await runAction(() =>
      apiRecordAdherence({
        profileId: activePatientProfile.id,
        medicationId: instance.medication.id,
        scheduledDate: instance.scheduledDate,
        scheduledTime: instance.scheduledTime,
        status,
        existingLogId: instance.log?.id,
        actualConfirmedAt: opts?.actualConfirmedAt,
        correctedFromStatus: opts?.correctedFromStatus,
        correctionReason: opts?.correctionReason,
        note:
          opts?.note ??
          (status === 'taken'
            ? `Confirmed by ${activeProfile.displayName}`
            : status === 'corrected'
              ? opts?.correctionReason || `Corrected by ${activeProfile.displayName}`
              : ''),
      }),
    );
  };

  const markDoseStatus = async (
    medication: Medication,
    status: DoseStatus,
    note?: string,
  ) => {
    if (!firebaseUser || !activePatientProfile) return;
    const targetTime = medication.scheduledTime || '08:00';
    const existingLog =
      doseLogs.find(
        (l) =>
          l.medicationId === medication.id &&
          l.scheduledDate === todayDate &&
          l.scheduledTime === targetTime,
      ) ??
      doseLogs.find(
        (l) => l.medicationId === medication.id && l.scheduledDate === todayDate,
      );

    if (status === 'taken') {
      setJustConfirmedDoseId(medication.id);
      window.setTimeout(() => {
        setJustConfirmedDoseId((curr) => (curr === medication.id ? null : curr));
      }, 3200);
    }

    await runAction(() =>
      apiRecordAdherence({
        profileId: activePatientProfile.id,
        medicationId: medication.id,
        scheduledDate: todayDate,
        scheduledTime: targetTime,
        status,
        existingLogId: existingLog?.id,
        note: note ?? (status === 'taken' ? `Confirmed by ${activeProfile.displayName}` : ''),
      }),
    );
  };

  const addAppointment = async (appt: Omit<Appointment, 'id'>) => {
    if (!firebaseUser || !activePatientProfile) return;
    await runAction(() => apiCreateAppointment(activePatientProfile.id, appt));
  };

  const updateAppointment = async (
    apptId: string,
    appt: Omit<Appointment, 'id' | 'status'>,
  ) => {
    if (!firebaseUser || !activePatientProfile) return;
    await runAction(() => apiUpdateAppointment(apptId, appt));
  };

  const updateAppointmentStatus = async (
    apptId: string,
    status: Appointment['status'],
  ) => {
    await runAction(() => apiUpdateAppointmentStatus(apptId, status));
  };

  const deleteAppointment = async (apptId: string) => {
    await runAction(() => apiDeleteAppointment(apptId));
  };

  const updateCaregiverAvailability = async (
    relId: string,
    status: CaregiverAvailabilityStatus,
  ) => {
    await runAction(() => updateCaregiverAvailabilityDoc(relId, status));
  };

  const updateCaregiverTier = async (relId: string, tier: CaregiverTier) => {
    await runAction(() => updateCaregiverTierDoc(relId, tier));
  };

  const inviteMember = async (input: {
    email: string;
    role: 'caregiver' | 'family';
    relation: string;
  }) => {
    if (!firebaseUser || !activePatientProfile) {
      throw new Error('Select a patient profile first.');
    }
    return runAction(() =>
      createProfileInvitationDoc({
        profile: activePatientProfile,
        issuedByUid: firebaseUser.uid,
        targetEmail: input.email,
        targetRole: input.role,
        relation: input.relation,
      }),
    );
  };

  const revokeInvitation = async (inviteId: string) => {
    await runAction(() => revokeInvitationDoc(inviteId));
  };

  const acceptInvitationCode = async (inviteCode: string) => {
    return runAction(() => acceptInvitationInFirestore(inviteCode));
  };

  const revokeMember = async (member: CareCircleMember) => {
    if (!activePatientProfile) return;
    await runAction(() =>
      revokeProfileMemberAccess({ profile: activePatientProfile, member }),
    );
  };

  const createHandoff = async (
    handoff: Omit<CareRelayHandoff, 'id' | 'createdAt'>,
  ) => {
    if (!firebaseUser || !activePatientProfile) return;
    await runAction(() =>
      apiCreateCareRelayHandoff(activePatientProfile.id, handoff),
    );
  };

  const acknowledgeHandoff = async (handoffId: string) => {
    await runAction(() => apiAcknowledgeCareRelayHandoff(handoffId));
  };

  const addCareUpdate = async (
    category: CareUpdate['category'],
    message: string,
  ) => {
    if (!firebaseUser || !activePatientProfile) return;
    await runAction(() =>
      apiCreateCareAlert({
        profileId: activePatientProfile.id,
        severity: category === 'medication' ? 'warning' : 'info',
        title: `${activeProfile.displayName} Reminder`,
        detail: message,
      }),
    );
  };

  const resolveAlert = async (alertId: string) => {
    if (!firebaseUser) return;
    await runAction(() => apiResolveAlert(alertId));
  };

  const activeWellnessAlerts = useMemo(
    () =>
      alerts.filter(
        (a) => !a.resolved && a.title.toLowerCase().includes('feeling unwell'),
      ),
    [alerts],
  );
  const patientFeelingUnwell = activeWellnessAlerts.length > 0;

  const reportPatientWellness = async (unwell: boolean, note?: string) => {
    if (!firebaseUser || !activePatientProfile) return;
    if (unwell) {
      setJustConfirmedDoseId(null);
      if (activeWellnessAlerts.length > 0) return;
      await runAction(() =>
        apiCreateCareAlert({
          profileId: activePatientProfile.id,
          severity: 'warning',
          title: 'Wellness Check-In: Patient Feeling Unwell',
          detail:
            note?.trim() ||
            `${activePatientProfile.fullName || activeProfile.displayName} reported feeling unwell today. Please check in gently.`,
        }),
      );
    } else {
      if (activeWellnessAlerts.length === 0) return;
      await runAction(async () => {
        for (const alert of activeWellnessAlerts) {
          await apiResolveAlert(alert.id);
        }
      });
    }
  };

  const runSchedulerNow = async () => {
    if (!firebaseUser || !activePatientProfile) {
      throw new Error('Select a patient profile first.');
    }
    return runAction(async () => {
      const res = await apiRunSchedulerNow(activePatientProfile.id);
      setSchedulerStatus(res.scheduler);
      return res.summary;
    });
  };

  const notifyUnconfirmedDoses = async () => {
    if (!firebaseUser || !activePatientProfile) {
      throw new Error('Select a patient profile first.');
    }
    return runAction(async () => {
      const res = await apiNotifyUnconfirmedDoses(activePatientProfile.id);
      setSchedulerStatus(res.scheduler);
      return {
        summary: res.summary,
        overdueFound: res.overdueFound,
        alertsCreated: res.alertsCreated,
        notifications: res.notifications,
        automaticOfflineEscalation: res.automaticOfflineEscalation,
      };
    });
  };

  const updatePassport = async (next: EmergencyHealthPassport) => {
    if (!activePatientProfile) return;
    await runAction(() =>
      updatePatientProfileDetails(
        activePatientProfile.id,
        {
          fullName: next.patientFullName,
          dateOfBirth: next.dateOfBirth,
          bloodType: next.bloodType,
          allergiesText: next.allergies.join(', '),
          conditionsText: next.conditions.join(', '),
          primaryPhysician: next.primaryPhysician,
          physicianPhone: next.physicianPhone,
          pharmacyName: next.pharmacyName,
          pharmacyPhone: next.pharmacyPhone,
          emergencyContactName: next.emergencyContactName,
          emergencyContactRelation: next.emergencyContactRelation,
          emergencyContactPhone: next.emergencyContactPhone,
          advanceDirectiveNote: next.advanceDirectiveNote,
        },
        isProfileOwner,
      ),
    );
  };

  const createEmergencyToken = async (params: {
    label: string;
    includeMedications: boolean;
    validHours: number;
  }) => {
    if (!firebaseUser || !activePatientProfile) {
      throw new Error('Patient profile required.');
    }
    return runAction(async () => {
      const res = await apiCreateEmergencyToken({
        profileId: activePatientProfile.id,
        ...params,
      });
      setLatestQrByToken((prev) => ({ ...prev, [res.tokenId]: res.qrDataUrl }));
      return res.tokenId;
    });
  };

  const revokeEmergencyToken = async (tokenId: string) => {
    await runAction(() => apiRevokeEmergencyToken(tokenId));
  };

  const updateFamilyPermissions = async (
    updates: Partial<FamilyVisibilityPermissions>,
  ) => {
    if (!activePatientProfile) return;
    await runAction(() =>
      updateFamilyPermissionsAndSync(activePatientProfile, updates),
    );
  };

  const updateSettings = async (updates: Partial<UserSettings>) => {
    if (!firebaseUser) return;
    await runAction(() =>
      updateUserAccountDoc(firebaseUser.uid, {
        textScale: updates.textScale,
        highContrast: updates.highContrast,
        reducedMotion: updates.reducedMotion,
        reminderLeadMinutes: updates.reminderLeadMinutes,
      }),
    );
  };

  const appendCompanionMessage = async (
    sender: 'user' | 'pillu',
    text: string,
  ) => {
    if (!firebaseUser || !activePatientProfile) return;
    await saveAiConversationDoc({
      profile: activePatientProfile,
      uid: firebaseUser.uid,
      sender,
      text,
    });
  };

  const signInWithGoogle = async (preferredRole: UserRole = 'patient') => {
    setAuthError(null);
    try {
      await loginWithGoogle(preferredRole);
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const signInWithEmailPassword = async (email: string, password: string) => {
    setAuthError(null);
    try {
      await loginWithEmail(email, password);
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const registerWithEmailPassword = async (params: {
    email: string;
    password: string;
    displayName: string;
    accountRole: UserRole;
  }) => {
    setAuthError(null);
    try {
      await registerWithEmail(params);
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const requestPasswordReset = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordReset(email);
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const resendVerification = async () => {
    setAuthError(null);
    try {
      await resendVerificationEmail();
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const refreshVerification = async () => {
    const updated = await refreshCurrentUser();
    if (updated) {
      setFirebaseUser({ ...updated });
      return updated.emailVerified;
    }
    return false;
  };

  const signOutUser = async () => {
    await notifySessionLogout();
    await logoutUser();
  };

  const value: CareContextValue = {
    firebaseUser,
    authLoading,
    dataLoading,
    emailVerified: Boolean(firebaseUser?.emailVerified),
    userAccount,
    userPrivate,
    authorizedProfiles,
    activePatientProfile,
    activeRole,
    isProfileOwner,
    canEditClinical,
    activeProfile,
    selectActiveProfile,
    createNewPatientProfile,
    updateActiveProfile,
    medications,
    medicationChanges,
    scheduledDosesToday,
    addMedication,
    updateMedication,
    discontinueMedication,
    toggleMedicationActive,
    deleteMedication,
    doseLogs,
    markDoseStatus,
    markDoseInstanceStatus,
    justConfirmedDoseId,
    appointments,
    addAppointment,
    updateAppointment,
    updateAppointmentStatus,
    deleteAppointment,
    members,
    updateCaregiverAvailability,
    updateCaregiverTier,
    invitations,
    incomingInvitations,
    inviteMember,
    revokeInvitation,
    acceptInvitationCode,
    revokeMember,
    handoffs,
    createHandoff,
    acknowledgeHandoff,
    careUpdates,
    addCareUpdate,
    alerts,
    patientFeelingUnwell,
    reportPatientWellness,
    notificationDeliveries,
    schedulerRuns,
    schedulerStatus,
    runSchedulerNow,
    notifyUnconfirmedDoses,
    resolveAlert,
    passport,
    updatePassport,
    emergencyTokens,
    latestQrByToken,
    createEmergencyToken,
    revokeEmergencyToken,
    familyPermissions,
    updateFamilyPermissions,
    settings,
    updateSettings,
    companionMessages,
    appendCompanionMessage,
    signInWithGoogle,
    signInWithEmailPassword,
    registerWithEmailPassword,
    requestPasswordReset,
    resendVerification,
    refreshVerification,
    signOutUser,
    todayDate,
    authError,
    clearAuthError: () => setAuthError(null),
    dataError,
    clearDataError: () => setDataError(null),
  };

  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare(): CareContextValue {
  const ctx = useContext(CareContext);
  if (!ctx) {
    throw new Error('useCare must be used within a CareProvider');
  }
  return ctx;
}
