export type UserRole = 'patient' | 'caregiver' | 'family';

export type TimeSlot = 'morning' | 'midday' | 'evening' | 'bedtime';

export type DoseStatus =
  | 'pending'
  | 'upcoming'
  | 'due'
  | 'taken'
  | 'unconfirmed'
  | 'missed'
  | 'skipped'
  | 'corrected';

export type DosageUnit =
  | 'mg'
  | 'mcg'
  | 'g'
  | 'mL'
  | 'tablet'
  | 'capsule'
  | 'drops'
  | 'IU'
  | 'puff'
  | 'other';

export type MedicationFrequency =
  | 'once_daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'specific_weekdays'
  | 'custom';

export type FoodInstruction =
  | 'before_food'
  | 'after_food'
  | 'with_food'
  | 'no_restriction';

export type PilluMoodState =
  | 'idle'
  | 'happy'
  | 'celebrating'
  | 'sleepy'
  | 'concerned'
  | 'encouraging'
  | 'caring'
  | 'reminding'
  | 'listening'
  | 'sleeping';

export interface PilluAnimationConfig {
  reducedMotion: boolean;
  breathDurationMs: number;
  allowIdleFloat: boolean;
}

export interface PilluMascotProps {
  state: PilluMoodState;
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  subMessage?: string;
  bounceOnHappy?: boolean;
  onInteract?: () => void;
  showStateControls?: boolean;
  onStateChange?: (nextState: PilluMoodState) => void;
  animationConfig?: Partial<PilluAnimationConfig>;
  className?: string;
}

export interface UserAccount {
  uid: string;
  displayName: string;
  accountRole: UserRole;
  activeProfileId?: string;
  textScale: 'standard' | 'large' | 'xl';
  highContrast: boolean;
  reducedMotion: boolean;
  reminderLeadMinutes: 15 | 30 | 60;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phone: string;
  address: string;
}

export interface PatientProfileRecord {
  id: string;
  ownerUid: string;
  authorizedUids: string[];
  caregiverUids: string[];
  familyUids: string[];
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
  passcodeEnabled: boolean;
  familyShowDetailedMeds: boolean;
  familyShowAdherencePct: boolean;
  familyShowAppointments: boolean;
  familyShowCareUpdates: boolean;
  familyShowPassport: boolean;
  updatedAtLabel: string;
}

export interface Medication {
  id: string;
  profileId?: string;
  name: string;
  dosage: string;
  dosageAmount?: string;
  dosageUnit?: DosageUnit;
  frequency?: MedicationFrequency;
  timeSlot: TimeSlot;
  scheduledTime: string; // Primary / earliest HH:mm (24h)
  scheduledTimes?: string[]; // Deduplicated sorted HH:mm entries for multi-dose meds
  weekdays?: number[]; // 0 (Sun) - 6 (Sat) when frequency === 'specific_weekdays'
  customIntervalDays?: number; // Every N days when frequency === 'custom'
  customScheduleNote?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD optional
  instructions: string;
  foodInstruction?: FoodInstruction;
  prescriber: string;
  pillAppearance: string;
  prescriptionImageUrl?: string;
  timezone?: string;
  gracePeriodMinutes?: number;
  missedAfterMinutes?: number;
  supplyDays: number;
  active: boolean;
  discontinued?: boolean;
  discontinuedAt?: string;
  discontinuedReason?: string;
  lastChangeNote?: string;
  scheduleId?: string;
}

export interface MedicationSchedule {
  id: string;
  profileId: string;
  medicationId: string;
  timeSlot: TimeSlot;
  scheduledTime: string;
  frequency?: MedicationFrequency;
  weekdays?: number[];
  customIntervalDays?: number;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  active: boolean;
  discontinued?: boolean;
}

export interface DoseLog {
  id: string;
  profileId?: string;
  medicationId: string;
  scheduleId?: string;
  medicationName: string;
  dosage: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  status: DoseStatus;
  confirmedAt?: string;
  actualConfirmedAt?: string;
  confirmedBy?: string;
  confirmedByUid?: string;
  correctedFromStatus?: DoseStatus;
  correctionReason?: string;
  correctedAt?: string;
  note?: string;
}

export interface ScheduledDoseInstance {
  doseKey: string;
  medication: Medication;
  scheduledDate: string;
  scheduledTime: string;
  timeSlot: TimeSlot;
  status: DoseStatus;
  log: DoseLog | null;
  minutesDelta: number;
  isDueNow: boolean;
  isUnconfirmedWindow: boolean;
  isMissedWindow: boolean;
  formattedCountdown: string;
}

export interface MedicationChangeEvent {
  id: string;
  profileId: string;
  medicationId: string;
  medicationName: string;
  changeType: 'added' | 'edited' | 'paused' | 'resumed' | 'discontinued';
  summary: string;
  changedByUid: string;
  changedByName: string;
  createdAt: string;
  createdAtMs: number;
}

export interface AdherenceCalendarDay {
  date: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  totalScheduled: number;
  takenCount: number;
  correctedCount: number;
  unconfirmedCount: number;
  missedCount: number;
  skippedCount: number;
  percentage: number;
}

export interface MedicationAdherenceSummary {
  medicationId: string;
  medicationName: string;
  dosage: string;
  active: boolean;
  discontinued: boolean;
  scheduledCount: number;
  takenCount: number;
  correctedCount: number;
  unconfirmedCount: number;
  missedCount: number;
  skippedCount: number;
  percentage: number;
}

export interface AdherenceStreakInfo {
  currentStreakDays: number;
  bestStreakDays: number;
  evaluatedDays: number;
}

export interface Appointment {
  id: string;
  profileId?: string;
  title: string;
  doctorName: string;
  specialty: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  location: string;
  assignedCaregiver: string;
  notes: string;
  status: 'upcoming' | 'completed' | 'cancelled';
}

export type CaregiverAvailabilityStatus = 'available' | 'busy' | 'away';

export type CaregiverTier = 'primary' | 'backup';

export interface CareCircleMember {
  id: string;
  uid?: string;
  name: string;
  role: UserRole;
  relation: string;
  phone: string;
  email: string;
  avatarUrl: string;
  isOnDuty?: boolean;
  status?: 'active' | 'revoked';
  availabilityStatus?: CaregiverAvailabilityStatus;
  caregiverTier?: CaregiverTier;
  lastActive: string;
}

export interface InvitationRecord {
  id: string;
  profileId: string;
  patientName: string;
  issuedByUid: string;
  targetEmail: string;
  targetRole: 'caregiver' | 'family';
  relation: string;
  status: 'pending' | 'accepted' | 'revoked';
  acceptedByUid?: string;
  expiresAtIso: string;
}

export interface EmergencyTokenRecord {
  id: string;
  profileId: string;
  ownerUid: string;
  label: string;
  includeMedications: boolean;
  revoked: boolean;
  expiresAtIso: string;
}

export interface CareRelayHandoff {
  id: string;
  profileId?: string;
  fromCaregiver: string;
  toCaregiver: string;
  shiftWindow: string;
  summary: string;
  status: 'active' | 'handed_off' | 'acknowledged';
  createdAt: string;
}

export interface CareUpdate {
  id: string;
  authorName: string;
  authorRole: UserRole;
  category: 'medication' | 'wellness' | 'appointment' | 'relay';
  message: string;
  createdAt: string;
}

export interface ClinicalAlert {
  id: string;
  profileId?: string;
  patientName: string;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  detail: string;
  createdAt: string;
  resolved: boolean;
  sourceType?: 'manual' | 'scheduler_dose' | 'scheduler_relay';
  deliveryChannel?: 'in_app_firestore' | 'sms' | 'email' | 'push';
  deliveryStatus?: 'delivered' | 'blocked';
  deliveryNote?: string;
}

export interface NotificationDeliveryRecord {
  id: string;
  profileId: string;
  alertId: string;
  channel: 'in_app_firestore' | 'sms' | 'email' | 'push';
  deliveryStatus: 'delivered' | 'blocked';
  statusDetail: string;
  createdAt: string;
  createdAtMs: number;
}

export interface SchedulerRunRecord {
  id: string;
  profileId: string;
  triggeredByUid: string;
  triggerType: 'interval' | 'manual';
  schedulesChecked: number;
  overdueFound: number;
  alertsCreated: number;
  handoffsEscalated: number;
  summary: string;
  createdAt: string;
  createdAtMs: number;
}

export interface SchedulerStatusInfo {
  running: boolean;
  intervalSeconds: number;
  activeAuthenticatedSessions: number;
  totalTicksExecuted: number;
  lastTickAt: string | null;
  lastSummary: string;
  sessionScope: 'active_sessions_only';
  scopeNote: string;
}

export interface NotificationCapabilityReport {
  inAppFirestore: { status: 'delivered'; detail: string };
  emailChannel: {
    provider: 'resend';
    status: 'configured' | 'blocked';
    detail: string;
  };
}

export interface EmergencyHealthPassport {
  patientFullName: string;
  dateOfBirth: string;
  bloodType: string;
  allergies: string[];
  conditions: string[];
  primaryPhysician: string;
  physicianPhone: string;
  pharmacyName: string;
  pharmacyPhone: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  advanceDirectiveNote: string;
  updatedAt: string;
}

export interface FamilyVisibilityPermissions {
  showDetailedMedications: boolean;
  showAdherencePercentage: boolean;
  showAppointments: boolean;
  showCareUpdates: boolean;
  showEmergencyPassport: boolean;
}

export interface UserSettings {
  textScale: 'standard' | 'large' | 'xl';
  highContrast: boolean;
  reducedMotion: boolean;
  reminderLeadMinutes: 15 | 30 | 60;
  careRelayEscalationMinutes: 30 | 60 | 120;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  address: string;
  role: UserRole;
  relation: string;
  avatarUrl: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export interface CompanionMessage {
  id: string;
  sender: 'user' | 'pillu';
  text: string;
  timestamp: string;
  isError?: boolean;
}

export interface DailyAdherenceStats {
  totalScheduled: number;
  takenCount: number;
  correctedCount: number;
  pendingCount: number;
  dueCount: number;
  unconfirmedCount: number;
  missedOrSkippedCount: number;
  missedCount: number;
  skippedCount: number;
  percentage: number;
}

export interface UpcomingDoseInfo {
  medication: Medication;
  scheduledTime: string;
  doseKey: string;
  status: DoseStatus;
  log: DoseLog | null;
  minutesDelta: number;
  isOverdue: boolean;
  formattedCountdown: string;
}

export interface PrescriptionScanDraft {
  medicineName: string;
  dosageAmount: string;
  dosageUnit: string;
  frequency: MedicationFrequency | '';
  frequencyText: string;
  suggestedTimes: string[];
  instructions: string;
  foodInstruction: FoodInstruction | '';
  prescriber: string;
  uncertainFields: string[];
  extractionNotes: string;
}

