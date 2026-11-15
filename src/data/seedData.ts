import heroCareCircleImg from '../assets/images/hero_care_circle_1794726991916.jpg';
import avatarCaregiverMayaImg from '../assets/images/avatar_caregiver_maya_1794726992429.jpg';
import avatarFamilyDavidImg from '../assets/images/avatar_family_david_1794726993126.jpg';
import avatarPatientEleanorImg from '../assets/images/avatar_patient_eleanor_1794726991898.jpg';
import type {
  Appointment,
  CareCircleMember,
  CareRelayHandoff,
  CareUpdate,
  ClinicalAlert,
  DoseLog,
  EmergencyHealthPassport,
  FamilyVisibilityPermissions,
  Medication,
  UserProfile,
  UserRole,
  UserSettings,
} from '../types/pilluminati';

export const HERO_IMAGE_PATH = heroCareCircleImg;

export const ROLE_AVATARS: Record<UserRole, string> = {
  patient: avatarPatientEleanorImg,
  caregiver: avatarCaregiverMayaImg,
  family: avatarFamilyDavidImg,
};

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getPastIsoDates(days: number): string[] {
  const result: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    result.push(`${y}-${m}-${day}`);
  }
  return result;
}

export function getFutureIsoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const INITIAL_CARE_MEMBERS: CareCircleMember[] = [
  {
    id: 'member-eleanor',
    name: 'Eleanor Vance',
    role: 'patient',
    relation: 'Patient (Mother)',
    phone: '(503) 555-0142',
    email: 'eleanor.vance@example.com',
    avatarUrl: ROLE_AVATARS.patient,
    lastActive: 'Active today at 8:06 AM',
  },
  {
    id: 'member-maya',
    name: 'Maya Lin, RN',
    role: 'caregiver',
    relation: 'Primary Caregiver',
    phone: '(503) 555-0189',
    email: 'maya.lin@pilluminati.care',
    avatarUrl: ROLE_AVATARS.caregiver,
    isOnDuty: true,
    lastActive: 'On shift · 7:00 AM – 3:00 PM',
  },
  {
    id: 'member-david',
    name: 'David Vance',
    role: 'family',
    relation: 'Son & Care Proxy',
    phone: '(503) 555-0174',
    email: 'david.vance@example.com',
    avatarUrl: ROLE_AVATARS.family,
    lastActive: 'Checked in 1 hour ago',
  },
];

export const INITIAL_MEDICATIONS: Medication[] = [
  {
    id: 'med-lisinopril',
    name: 'Lisinopril',
    dosage: '10 mg',
    timeSlot: 'morning',
    scheduledTime: '08:00',
    instructions: 'Take 1 tablet with a full glass of water.',
    prescriber: 'Dr. Aris Thorne',
    pillAppearance: 'Small round pink tablet',
    supplyDays: 22,
    active: true,
  },
  {
    id: 'med-metformin',
    name: 'Metformin ER',
    dosage: '500 mg',
    timeSlot: 'midday',
    scheduledTime: '12:30',
    instructions: 'Take with lunch to avoid stomach upset.',
    prescriber: 'Dr. Aris Thorne',
    pillAppearance: 'Oval white tablet',
    supplyDays: 6,
    active: true,
  },
  {
    id: 'med-eliquis',
    name: 'Apixaban (Eliquis)',
    dosage: '5 mg',
    timeSlot: 'evening',
    scheduledTime: '18:00',
    instructions: 'Take evenly 12 hours apart with evening meal.',
    prescriber: 'Dr. Priya Patel',
    pillAppearance: 'Oval yellow tablet',
    supplyDays: 19,
    active: true,
  },
  {
    id: 'med-atorvastatin',
    name: 'Atorvastatin',
    dosage: '20 mg',
    timeSlot: 'bedtime',
    scheduledTime: '21:00',
    instructions: 'Take before sleep; avoid grapefruit juice.',
    prescriber: 'Dr. Aris Thorne',
    pillAppearance: 'White elliptical tablet',
    supplyDays: 28,
    active: true,
  },
];

export function buildInitialDoseLogs(): DoseLog[] {
  const dates = getPastIsoDates(7);
  const today = dates[dates.length - 1];
  const logs: DoseLog[] = [];

  // Historical 6 days
  dates.slice(0, -1).forEach((date, dayIdx) => {
    INITIAL_MEDICATIONS.forEach((med, medIdx) => {
      const skippedOnce = dayIdx === 2 && medIdx === 1;
      logs.push({
        id: `log-${date}-${med.id}`,
        medicationId: med.id,
        medicationName: med.name,
        dosage: med.dosage,
        scheduledDate: date,
        scheduledTime: med.scheduledTime,
        status: skippedOnce ? 'missed' : 'taken',
        confirmedAt: skippedOnce ? undefined : `${med.scheduledTime}`,
        confirmedBy: skippedOnce ? undefined : 'Eleanor Vance',
        note: skippedOnce ? 'Delayed lunch during clinic visit' : undefined,
      });
    });
  });

  // Today's initial deterministic state: Morning taken, Midday unconfirmed, Evening & Bedtime pending
  logs.push(
    {
      id: `log-${today}-med-lisinopril`,
      medicationId: 'med-lisinopril',
      medicationName: 'Lisinopril',
      dosage: '10 mg',
      scheduledDate: today,
      scheduledTime: '08:00',
      status: 'taken',
      confirmedAt: '08:06',
      confirmedBy: 'Eleanor Vance',
      note: 'Taken after breakfast tea',
    },
    {
      id: `log-${today}-med-metformin`,
      medicationId: 'med-metformin',
      medicationName: 'Metformin ER',
      dosage: '500 mg',
      scheduledDate: today,
      scheduledTime: '12:30',
      status: 'unconfirmed',
      note: 'Awaiting confirmation after lunch',
    },
    {
      id: `log-${today}-med-eliquis`,
      medicationId: 'med-eliquis',
      medicationName: 'Apixaban (Eliquis)',
      dosage: '5 mg',
      scheduledDate: today,
      scheduledTime: '18:00',
      status: 'pending',
    },
    {
      id: `log-${today}-med-atorvastatin`,
      medicationId: 'med-atorvastatin',
      medicationName: 'Atorvastatin',
      dosage: '20 mg',
      scheduledDate: today,
      scheduledTime: '21:00',
      status: 'pending',
    },
  );

  return logs;
}

export function buildInitialAppointments(): Appointment[] {
  return [
    {
      id: 'appt-cardiology',
      title: 'Cardiology Rhythm Review',
      doctorName: 'Dr. Priya Patel',
      specialty: 'Cardiology',
      date: getFutureIsoDate(3),
      time: '10:30',
      location: 'Cedar Valley Heart Clinic · Suite 410',
      assignedCaregiver: 'Maya Lin, RN',
      notes: 'Bring 7-day blood pressure log and updated Eliquis schedule.',
      status: 'upcoming',
    },
    {
      id: 'appt-primary',
      title: 'Quarterly Wellness & Lab Panel',
      doctorName: 'Dr. Aris Thorne',
      specialty: 'Geriatric Primary Care',
      date: getFutureIsoDate(9),
      time: '14:00',
      location: 'Oakridge Medical Commons · Room 2B',
      assignedCaregiver: 'David Vance',
      notes: 'Fasting lipid panel completed 48 hours prior.',
      status: 'upcoming',
    },
    {
      id: 'appt-optometry',
      title: 'Annual Vision Check',
      doctorName: 'Dr. Samuel Cho',
      specialty: 'Optometry',
      date: getPastIsoDates(7)[1],
      time: '11:00',
      location: 'ClearSight Eye Associates',
      assignedCaregiver: 'David Vance',
      notes: 'Updated reading prescription; no changes needed.',
      status: 'completed',
    },
  ];
}

export const INITIAL_RELAY_HANDOFFS: CareRelayHandoff[] = [
  {
    id: 'relay-1',
    fromCaregiver: 'Evening Aide (Clara Ortiz)',
    toCaregiver: 'Maya Lin, RN',
    shiftWindow: '7:00 AM – 3:00 PM Today',
    summary:
      'Slept well overnight. Morning Lisinopril taken at 8:06 AM with oatmeal and water. Metformin refill due in 6 days.',
    status: 'active',
    createdAt: 'Today · 7:15 AM',
  },
  {
    id: 'relay-2',
    fromCaregiver: 'Maya Lin, RN',
    toCaregiver: 'David Vance (Evening Family Check-in)',
    shiftWindow: '3:00 PM – 10:00 PM Today',
    summary:
      'Remind Mom to take Apixaban at 6:00 PM with dinner and verify lunch Metformin confirmation.',
    status: 'acknowledged',
    createdAt: 'Yesterday · 3:05 PM',
  },
];

export const INITIAL_CARE_UPDATES: CareUpdate[] = [
  {
    id: 'upd-1',
    authorName: 'Maya Lin, RN',
    authorRole: 'caregiver',
    category: 'medication',
    message: 'Morning Lisinopril 10 mg confirmed on schedule. Blood pressure steady at 124/76.',
    createdAt: 'Today · 8:12 AM',
  },
  {
    id: 'upd-2',
    authorName: 'Maya Lin, RN',
    authorRole: 'caregiver',
    category: 'wellness',
    message: 'Enjoyed a 15-minute garden walk after breakfast; good hydration.',
    createdAt: 'Today · 9:40 AM',
  },
  {
    id: 'upd-3',
    authorName: 'David Vance',
    authorRole: 'family',
    category: 'appointment',
    message: 'Confirmed Thursday morning ride to Dr. Patel’s cardiology office.',
    createdAt: 'Yesterday · 6:20 PM',
  },
];

export const INITIAL_ALERTS: ClinicalAlert[] = [
  {
    id: 'alert-unconfirmed-metformin',
    patientName: 'Eleanor Vance',
    severity: 'warning',
    title: 'Unconfirmed Midday Dose',
    detail: 'Metformin ER (500 mg) scheduled for 12:30 PM has not yet been confirmed.',
    createdAt: 'Today · 1:05 PM',
    resolved: false,
  },
  {
    id: 'alert-low-supply',
    patientName: 'Eleanor Vance',
    severity: 'info',
    title: 'Refill Window Approaching',
    detail: 'Metformin ER has 6 days of supply remaining at Cedar Pharmacy.',
    createdAt: 'Today · 8:30 AM',
    resolved: false,
  },
];

export const INITIAL_HEALTH_PASSPORT: EmergencyHealthPassport = {
  patientFullName: 'Eleanor Marie Vance',
  dateOfBirth: '1950-04-18',
  bloodType: 'O Positive (O+)',
  allergies: ['Penicillin (hives)', 'Sulfonamides / Sulfa drugs'],
  conditions: ['Hypertension', 'Atrial Fibrillation (controlled)', 'Type 2 Diabetes (diet + Metformin)', 'Mild Osteoarthritis'],
  primaryPhysician: 'Dr. Aris Thorne, MD',
  physicianPhone: '(503) 555-0199',
  pharmacyName: 'Cedar Community Pharmacy',
  pharmacyPhone: '(503) 555-0124',
  emergencyContactName: 'David Vance (Son)',
  emergencyContactRelation: 'Healthcare Proxy',
  emergencyContactPhone: '(503) 555-0174',
  advanceDirectiveNote: 'Full medical code; Healthcare Proxy on file with Oakridge Medical Commons.',
  updatedAt: 'Nov 14, 2026',
};

export const INITIAL_FAMILY_PERMISSIONS: FamilyVisibilityPermissions = {
  showDetailedMedications: true,
  showAdherencePercentage: true,
  showAppointments: true,
  showCareUpdates: true,
  showEmergencyPassport: true,
};

export const INITIAL_SETTINGS: UserSettings = {
  textScale: 'standard',
  highContrast: false,
  reducedMotion: false,
  reminderLeadMinutes: 15,
  careRelayEscalationMinutes: 60,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

export const ROLE_PROFILES: Record<UserRole, UserProfile> = {
  patient: {
    id: 'member-eleanor',
    displayName: 'Eleanor Vance',
    email: 'eleanor.vance@example.com',
    phone: '(503) 555-0142',
    address: '418 Willow Creek Lane, Portland, OR',
    role: 'patient',
    relation: 'Self (Patient)',
    avatarUrl: ROLE_AVATARS.patient,
    emergencyContactName: 'David Vance',
    emergencyContactPhone: '(503) 555-0174',
  },
  caregiver: {
    id: 'member-maya',
    displayName: 'Maya Lin, RN',
    email: 'maya.lin@pilluminati.care',
    phone: '(503) 555-0189',
    address: 'Cedar Home Care Associates, Portland, OR',
    role: 'caregiver',
    relation: 'Primary Caregiver',
    avatarUrl: ROLE_AVATARS.caregiver,
    emergencyContactName: 'Care Relay Dispatch',
    emergencyContactPhone: '(503) 555-0111',
  },
  family: {
    id: 'member-david',
    displayName: 'David Vance',
    email: 'david.vance@example.com',
    phone: '(503) 555-0174',
    address: '1024 Alder Street, Portland, OR',
    role: 'family',
    relation: 'Son & Healthcare Proxy',
    avatarUrl: ROLE_AVATARS.family,
    emergencyContactName: 'Maya Lin, RN',
    emergencyContactPhone: '(503) 555-0189',
  },
};
