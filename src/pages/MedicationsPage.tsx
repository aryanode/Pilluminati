import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  CalendarDays,
  Camera,
  Clock,
  Edit3,
  Image as ImageIcon,
  Lock,
  MessageCircleHeart,
  Pause,
  Pill,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  Utensils,
  X,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { PilluMascot } from '../components/PilluMascot';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  Select,
  Textarea,
} from '../components/ui/Primitives';
import { apiGetAiStatus, apiScanPrescription } from '../services/backendApi';
import { useCare } from '../context/CareContext';
import type {
  DosageUnit,
  FoodInstruction,
  Medication,
  MedicationFrequency,
  PrescriptionScanDraft,
  TimeSlot,
} from '../types/pilluminati';
import {
  calculateDailyStatsFromInstances,
  formatFoodInstructionLabel,
  formatFrequencyLabel,
  formatTime12Hour,
  getBrowserTimeZone,
  getMedicationTimes,
  getNextUpcomingDose,
  getPilluContextualCopy,
  getPilluMoodForState,
  inferTimeSlotFromTime,
  isTimeInQuietHours,
  normalizeScheduledTimes,
  parseTimeToMinutes,
  validateMedicationInput,
} from '../utils/adherence';
import { cn } from '../utils/cn';

const SLOT_FILTERS: {
  value: 'all' | TimeSlot | 'discontinued';
  label: string;
}[] = [
  { value: 'all', label: 'All Active & Paused' },
  { value: 'morning', label: 'Morning' },
  { value: 'midday', label: 'Midday' },
  { value: 'evening', label: 'Evening' },
  { value: 'bedtime', label: 'Bedtime' },
  { value: 'discontinued', label: 'Discontinued' },
];

const DOSAGE_UNITS: { value: DosageUnit; label: string }[] = [
  { value: 'mg', label: 'mg' },
  { value: 'mcg', label: 'mcg' },
  { value: 'g', label: 'g' },
  { value: 'mL', label: 'mL' },
  { value: 'tablet', label: 'tablet' },
  { value: 'capsule', label: 'capsule' },
  { value: 'drops', label: 'drops' },
  { value: 'IU', label: 'IU' },
  { value: 'puff', label: 'puff' },
  { value: 'other', label: 'other' },
];

const FREQUENCY_OPTIONS: { value: MedicationFrequency; label: string }[] = [
  { value: 'once_daily', label: 'Once daily' },
  { value: 'twice_daily', label: 'Twice daily' },
  { value: 'three_times_daily', label: 'Three times daily' },
  { value: 'specific_weekdays', label: 'Specific weekdays' },
  { value: 'custom', label: 'Custom interval' },
];

const FOOD_OPTIONS: { value: FoodInstruction; label: string }[] = [
  { value: 'no_restriction', label: 'No food restriction' },
  { value: 'before_food', label: 'Take before food' },
  { value: 'after_food', label: 'Take after food' },
  { value: 'with_food', label: 'Take with food' },
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function compressPrescriptionImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const maxDim = 640;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image compression unavailable in this browser.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.72;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 90_000 && quality > 0.35) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > 110_000) {
          reject(new Error('Image remains too large after compression. Try a smaller photo.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function prepareImageForVisionScan(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected prescription photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const maxDim = 1280;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image processing unavailable in this browser.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (dataUrl.length > 2_500_000) {
          reject(new Error('Prescription photo exceeds 2 MB limit. Try a closer crop.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function MedicationsPage() {
  const {
    medications,
    doseLogs,
    scheduledDosesToday,
    justConfirmedDoseId,
    patientFeelingUnwell,
    settings,
    addMedication,
    updateMedication,
    discontinueMedication,
    toggleMedicationActive,
    deleteMedication,
    activeRole,
    familyPermissions,
    activePatientProfile,
    emailVerified,
    todayDate,
  } = useCare();

  const browserTz = useMemo(() => getBrowserTimeZone(), []);
  const timezoneOptions = useMemo(() => {
    const common = [
      browserTz,
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Kolkata',
      'UTC',
    ];
    return Array.from(new Set(common)).map((tz) => ({ value: tz, label: tz }));
  }, [browserTz]);

  const [search, setSearch] = useState('');
  const [slotFilter, setSlotFilter] = useState<'all' | TimeSlot | 'discontinued'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [discontinueTarget, setDiscontinueTarget] = useState<Medication | null>(null);
  const [discontinueReason, setDiscontinueReason] = useState('');
  const [previewImageMed, setPreviewImageMed] = useState<Medication | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [dosageAmount, setDosageAmount] = useState('');
  const [dosageUnit, setDosageUnit] = useState<DosageUnit>('mg');
  const [frequency, setFrequency] = useState<MedicationFrequency>('once_daily');
  const [scheduledTimes, setScheduledTimes] = useState<string[]>(['08:00']);
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [customIntervalDays, setCustomIntervalDays] = useState('2');
  const [customScheduleNote, setCustomScheduleNote] = useState('');
  const [startDate, setStartDate] = useState(todayDate);
  const [endDate, setEndDate] = useState('');
  const [foodInstruction, setFoodInstruction] = useState<FoodInstruction>('no_restriction');
  const [instructions, setInstructions] = useState('');
  const [prescriber, setPrescriber] = useState('Dr. Aris Thorne');
  const [pillAppearance, setPillAppearance] = useState('Round tablet');
  const [supplyDays, setSupplyDays] = useState('30');
  const [timezone, setTimezone] = useState(browserTz);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState('30');
  const [missedAfterMinutes, setMissedAfterMinutes] = useState('180');
  const [prescriptionImageUrl, setPrescriptionImageUrl] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Phase 4 Prescription Scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerStatusBlocked, setScannerStatusBlocked] = useState<string | null>(null);
  const [scanVisionImage, setScanVisionImage] = useState('');
  const [scanStoredThumb, setScanStoredThumb] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanDraft, setScanDraft] = useState<PrescriptionScanDraft | null>(null);
  const [scanName, setScanName] = useState('');
  const [scanDosageAmount, setScanDosageAmount] = useState('');
  const [scanDosageUnit, setScanDosageUnit] = useState<DosageUnit | ''>('');
  const [scanFrequency, setScanFrequency] = useState<MedicationFrequency | ''>('');
  const [scanTimes, setScanTimes] = useState<string[]>(['08:00']);
  const [scanFood, setScanFood] = useState<FoodInstruction>('no_restriction');
  const [scanPrescriber, setScanPrescriber] = useState('');
  const [scanInstructions, setScanInstructions] = useState('');
  const [scanSupplyDays, setScanSupplyDays] = useState('30');
  const [scanCaregiverConfirmed, setScanCaregiverConfirmed] = useState(false);
  const [scanFormErrors, setScanFormErrors] = useState<Record<string, string>>({});

  const isRestrictedFamily =
    activeRole === 'family' && !familyPermissions.showDetailedMedications;
  const canEdit = activeRole !== 'family';

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const stats = useMemo(
    () => calculateDailyStatsFromInstances(scheduledDosesToday),
    [scheduledDosesToday],
  );
  const nextDose = useMemo(
    () => getNextUpcomingDose(medications, doseLogs, todayDate, nowMinutes, now),
    [medications, doseLogs, todayDate, nowMinutes],
  );
  const patientFirstName = (
    activePatientProfile?.fullName || 'Patient'
  ).split(' ')[0];
  const pilluMood = isRestrictedFamily
    ? patientFeelingUnwell
      ? 'caring'
      : 'idle'
    : getPilluMoodForState(
        stats,
        Boolean(nextDose?.isOverdue || stats.unconfirmedCount > 0),
        Boolean(justConfirmedDoseId),
        {
          hasUpcomingDose: Boolean(nextDose && !nextDose.isOverdue),
          patientFeelingUnwell,
          isQuietHours: isTimeInQuietHours(
            nowMinutes,
            settings.quietHoursStart,
            settings.quietHoursEnd,
          ),
        },
      );
  const pilluCopy = isRestrictedFamily
    ? {
        message: 'Medication names are kept private by patient family settings.',
      }
    : getPilluContextualCopy({
        mood: pilluMood,
        stats,
        nextDose,
        patientFirstName,
        role: activeRole,
      });

  const resetForm = () => {
    setEditingMed(null);
    setName('');
    setDosageAmount('');
    setDosageUnit('mg');
    setFrequency('once_daily');
    setScheduledTimes(['08:00']);
    setWeekdays([1, 3, 5]);
    setCustomIntervalDays('2');
    setCustomScheduleNote('');
    setStartDate(todayDate);
    setEndDate('');
    setFoodInstruction('no_restriction');
    setInstructions('');
    setPrescriber('Dr. Aris Thorne');
    setPillAppearance('Round tablet');
    setSupplyDays('30');
    setTimezone(browserTz);
    setGracePeriodMinutes('30');
    setMissedAfterMinutes('180');
    setPrescriptionImageUrl('');
    setChangeNote('');
    setErrors({});
  };

  const openCreateModal = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditModal = (med: Medication) => {
    setEditingMed(med);
    setName(med.name);
    if (med.dosageAmount) {
      setDosageAmount(med.dosageAmount);
      setDosageUnit(med.dosageUnit || 'mg');
    } else {
      const parts = med.dosage.trim().split(/\s+/);
      setDosageAmount(parts[0] || med.dosage);
      const maybeUnit = parts.slice(1).join(' ') as DosageUnit;
      setDosageUnit(
        DOSAGE_UNITS.some((u) => u.value === maybeUnit) ? maybeUnit : 'mg',
      );
    }
    setFrequency(med.frequency || 'once_daily');
    setScheduledTimes(getMedicationTimes(med));
    setWeekdays(med.weekdays && med.weekdays.length > 0 ? med.weekdays : [1, 3, 5]);
    setCustomIntervalDays(String(med.customIntervalDays ?? 2));
    setCustomScheduleNote(med.customScheduleNote || '');
    setStartDate(med.startDate || todayDate);
    setEndDate(med.endDate || '');
    setFoodInstruction(med.foodInstruction || 'no_restriction');
    setInstructions(med.instructions || '');
    setPrescriber(med.prescriber || 'Primary Physician');
    setPillAppearance(med.pillAppearance || 'Tablet');
    setSupplyDays(String(med.supplyDays ?? 30));
    setTimezone(med.timezone || browserTz);
    setGracePeriodMinutes(String(med.gracePeriodMinutes ?? 30));
    setMissedAfterMinutes(String(med.missedAfterMinutes ?? 180));
    setPrescriptionImageUrl(med.prescriptionImageUrl || '');
    setChangeNote('');
    setErrors({});
    setIsFormOpen(true);
  };

  const handleFrequencyChange = (nextFreq: MedicationFrequency) => {
    setFrequency(nextFreq);
    if (!editingMed) {
      if (nextFreq === 'once_daily' && scheduledTimes.length > 1) {
        setScheduledTimes([scheduledTimes[0] || '08:00']);
      } else if (nextFreq === 'twice_daily' && scheduledTimes.length < 2) {
        setScheduledTimes(['08:00', '20:00']);
      } else if (nextFreq === 'three_times_daily' && scheduledTimes.length < 3) {
        setScheduledTimes(['08:00', '13:00', '20:00']);
      }
    }
  };

  const handleTimeChange = (idx: number, val: string) => {
    setScheduledTimes((prev) => prev.map((t, i) => (i === idx ? val : t)));
  };

  const addTimeSlotRow = () => {
    if (scheduledTimes.length >= 8) return;
    const candidateDefaults = ['08:00', '12:00', '18:00', '21:00', '10:00', '15:00', '20:00', '22:00'];
    const nextTime =
      candidateDefaults.find((c) => !scheduledTimes.includes(c)) || '12:00';
    setScheduledTimes((prev) => [...prev, nextTime]);
  };

  const removeTimeSlotRow = (idx: number) => {
    if (scheduledTimes.length <= 1) return;
    setScheduledTimes((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleWeekday = (dayIdx: number) => {
    setWeekdays((prev) =>
      prev.includes(dayIdx)
        ? prev.filter((d) => d !== dayIdx)
        : [...prev, dayIdx].sort((a, b) => a - b),
    );
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPrescriptionImage(file);
      setPrescriptionImageUrl(compressed);
      setErrors((prev) => {
        const next = { ...prev };
        delete next.prescriptionImageUrl;
        return next;
      });
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        prescriptionImageUrl:
          err instanceof Error ? err.message : 'Unable to attach prescription image.',
      }));
    }
  };

  const filtered = useMemo(() => {
    return medications
      .filter((m) => {
        const isDiscontinued = Boolean(m.discontinued);
        if (slotFilter === 'discontinued') {
          if (!isDiscontinued) return false;
        } else {
          if (isDiscontinued) return false;
          if (slotFilter !== 'all') {
            const times = getMedicationTimes(m);
            const matchesAnySlot =
              m.timeSlot === slotFilter ||
              times.some((t) => inferTimeSlotFromTime(t) === slotFilter);
            if (!matchesAnySlot) return false;
          }
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            m.name.toLowerCase().includes(q) ||
            m.dosage.toLowerCase().includes(q) ||
            m.prescriber.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .slice()
      .sort(
        (a, b) =>
          parseTimeToMinutes(a.scheduledTime) - parseTimeToMinutes(b.scheduledTime),
      );
  }, [medications, slotFilter, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedDosage = [dosageAmount.trim(), dosageUnit.trim()]
      .filter(Boolean)
      .join(' ')
      .trim();

    const draftInput = {
      name,
      dosage: combinedDosage,
      dosageAmount,
      dosageUnit,
      frequency,
      timeSlot: inferTimeSlotFromTime(scheduledTimes[0] || '08:00'),
      scheduledTime: scheduledTimes[0] || '08:00',
      scheduledTimes,
      weekdays: frequency === 'specific_weekdays' ? weekdays : [],
      customIntervalDays:
        frequency === 'custom' ? Number(customIntervalDays || 2) : 1,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      timezone,
      instructions,
      prescriber,
      supplyDays: Number(supplyDays),
      prescriptionImageUrl: prescriptionImageUrl || undefined,
    };

    const nextErrors = validateMedicationInput(draftInput);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const normalizedTimes = normalizeScheduledTimes(scheduledTimes);
    const payload: Omit<Medication, 'id'> & { changeNote?: string } = {
      name: name.trim(),
      dosage: combinedDosage,
      dosageAmount: dosageAmount.trim(),
      dosageUnit,
      frequency,
      timeSlot: inferTimeSlotFromTime(normalizedTimes[0]),
      scheduledTime: normalizedTimes[0],
      scheduledTimes: normalizedTimes,
      weekdays: frequency === 'specific_weekdays' ? weekdays : [],
      customIntervalDays:
        frequency === 'custom' ? Math.max(1, Number(customIntervalDays || 2)) : 1,
      customScheduleNote:
        frequency === 'custom' ? customScheduleNote.trim() : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      instructions: instructions.trim() || 'Take as prescribed.',
      foodInstruction,
      prescriber: prescriber.trim() || 'Primary Physician',
      pillAppearance: pillAppearance.trim() || 'Tablet',
      prescriptionImageUrl: prescriptionImageUrl.trim() || undefined,
      timezone,
      gracePeriodMinutes: Math.max(5, Math.min(120, Number(gracePeriodMinutes || 30))),
      missedAfterMinutes: Math.max(30, Math.min(720, Number(missedAfterMinutes || 180))),
      supplyDays: Number(supplyDays),
      active: editingMed ? editingMed.active : true,
      ...(editingMed && changeNote.trim() ? { changeNote: changeNote.trim() } : {}),
    };

    setSubmitting(true);
    try {
      if (editingMed) {
        await updateMedication(editingMed.id, payload);
      } else {
        await addMedication(payload);
      }
      resetForm();
      setIsFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDiscontinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discontinueTarget) return;
    setSubmitting(true);
    try {
      await discontinueMedication(
        discontinueTarget.id,
        discontinueReason.trim() || 'Discontinued per clinical care plan.',
      );
      setDiscontinueTarget(null);
      setDiscontinueReason('');
    } finally {
      setSubmitting(false);
    }
  };

  const resetScanner = () => {
    setScanVisionImage('');
    setScanStoredThumb('');
    setScanning(false);
    setScanError(null);
    setScanDraft(null);
    setScanName('');
    setScanDosageAmount('');
    setScanDosageUnit('');
    setScanFrequency('');
    setScanTimes(['08:00']);
    setScanFood('no_restriction');
    setScanPrescriber('');
    setScanInstructions('');
    setScanSupplyDays('30');
    setScanCaregiverConfirmed(false);
    setScanFormErrors({});
  };

  const openScannerModal = () => {
    resetScanner();
    setScannerStatusBlocked(null);
    setIsScannerOpen(true);
    apiGetAiStatus()
      .then((status) => {
        if (!status.configured) {
          setScannerStatusBlocked(
            status.reason ||
              'GEMINI_API_KEY is not configured in server environment Secrets.',
          );
        }
      })
      .catch(() => {
        // Real backend errors will still surface on scan execution.
      });
  };

  const runPrescriptionScan = async (imageDataUrl: string) => {
    if (!activePatientProfile) return;
    setScanError(null);
    setScanning(true);
    setScanCaregiverConfirmed(false);
    try {
      const res = await apiScanPrescription({
        profileId: activePatientProfile.id,
        imageDataUrl,
      });
      const d = res.draft;
      setScanDraft(d);
      setScanName(d.medicineName);
      setScanDosageAmount(d.dosageAmount);
      setScanDosageUnit(
        DOSAGE_UNITS.some((u) => u.value === d.dosageUnit)
          ? (d.dosageUnit as DosageUnit)
          : '',
      );
      setScanFrequency(d.frequency);
      setScanTimes(
        d.suggestedTimes.length > 0
          ? d.suggestedTimes
          : d.frequency === 'twice_daily'
            ? ['08:00', '20:00']
            : d.frequency === 'three_times_daily'
              ? ['08:00', '13:00', '20:00']
              : ['08:00'],
      );
      setScanFood(d.foodInstruction || 'no_restriction');
      setScanPrescriber(d.prescriber);
      setScanInstructions(d.instructions);
      setScanFormErrors({});
    } catch (err) {
      setScanDraft(null);
      setScanError(
        err instanceof Error
          ? err.message
          : 'Unable to scan prescription image with Gemini Vision.',
      );
    } finally {
      setScanning(false);
    }
  };

  const handleScannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    try {
      const visionUrl = await prepareImageForVisionScan(file);
      setScanVisionImage(visionUrl);
      compressPrescriptionImage(file)
        .then((thumb) => setScanStoredThumb(thumb))
        .catch(() => setScanStoredThumb(''));
      await runPrescriptionScan(visionUrl);
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Unable to prepare prescription photo.',
      );
    }
  };

  const handleSaveScannedMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanCaregiverConfirmed) {
      setScanFormErrors({
        caregiverConfirmed:
          'Caregiver confirmation is required before saving scanned medication details.',
      });
      return;
    }

    const nextErrors: Record<string, string> = {};
    if (!scanDosageUnit) {
      nextErrors.dosageUnit = 'Please select the dosage unit manually.';
    }
    if (!scanFrequency) {
      nextErrors.frequency = 'Please select the dosing frequency manually.';
    }

    const combinedDosage = [scanDosageAmount.trim(), scanDosageUnit.trim()]
      .filter(Boolean)
      .join(' ')
      .trim();

    const baseValidation = validateMedicationInput({
      name: scanName,
      dosage: combinedDosage,
      dosageAmount: scanDosageAmount,
      dosageUnit: (scanDosageUnit || 'mg') as DosageUnit,
      frequency: (scanFrequency || 'once_daily') as MedicationFrequency,
      timeSlot: inferTimeSlotFromTime(scanTimes[0] || '08:00'),
      scheduledTime: scanTimes[0] || '08:00',
      scheduledTimes: scanTimes,
      startDate: todayDate,
      timezone: browserTz,
      instructions: scanInstructions,
      prescriber: scanPrescriber || 'Primary Physician',
      supplyDays: Number(scanSupplyDays),
      prescriptionImageUrl: scanStoredThumb || undefined,
    });

    const mergedErrors = { ...baseValidation, ...nextErrors };
    if (Object.keys(mergedErrors).length > 0) {
      setScanFormErrors(mergedErrors);
      return;
    }

    const normalizedTimes = normalizeScheduledTimes(scanTimes);
    const chosenFreq = scanFrequency as MedicationFrequency;
    const chosenUnit = scanDosageUnit as DosageUnit;

    setSubmitting(true);
    try {
      await addMedication({
        name: scanName.trim(),
        dosage: combinedDosage,
        dosageAmount: scanDosageAmount.trim(),
        dosageUnit: chosenUnit,
        frequency: chosenFreq,
        timeSlot: inferTimeSlotFromTime(normalizedTimes[0]),
        scheduledTime: normalizedTimes[0],
        scheduledTimes: normalizedTimes,
        weekdays: chosenFreq === 'specific_weekdays' ? [1, 3, 5] : [],
        customIntervalDays: 1,
        startDate: todayDate,
        instructions: scanInstructions.trim() || 'Take as prescribed.',
        foodInstruction: scanFood,
        prescriber: scanPrescriber.trim() || 'Primary Physician',
        pillAppearance: 'Scanned Rx label',
        prescriptionImageUrl: scanStoredThumb || undefined,
        timezone: browserTz,
        gracePeriodMinutes: 30,
        missedAfterMinutes: 180,
        supplyDays: Number(scanSupplyDays || 30),
        active: true,
      });
      setIsScannerOpen(false);
      resetScanner();
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Unable to save scanned medication.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Medication Management"
      subtitle="Manage multi-dose schedules, meal timing, prescription details, and safe discontinuations."
      primaryAction={
        canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!emailVerified}
              onClick={openScannerModal}
              data-testid="scan-prescription-btn"
            >
              <Camera className="h-4 w-4" />
              Scan Prescription
            </Button>
            <Button
              size="sm"
              disabled={!emailVerified}
              onClick={openCreateModal}
              data-testid="add-medication-btn"
            >
              <Plus className="h-4 w-4" />
              Add Medication
            </Button>
          </div>
        ) : undefined
      }
    >
      {isRestrictedFamily ? (
        <Card tone="lavender" className="p-8 flex items-start gap-4">
          <Lock className="h-6 w-6 text-[#5D4A96] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-xl font-bold text-[#10373A]">
              Detailed Medication List Is Private
            </h2>
            <p className="mt-2 text-base text-[#2C5E63]">
              Current privacy settings restrict individual medication names and
              dosages for Family members. You can view aggregate adherence
              progress on the Family Dashboard.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Pillu Schedule Companion Strip */}
          <Card
            tone={patientFeelingUnwell ? 'warm' : 'mint'}
            className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <PilluMascot
              state={pilluMood}
              size="sm"
              message={pilluCopy.message}
              subMessage={pilluCopy.subMessage}
              bounceOnHappy={Boolean(justConfirmedDoseId)}
              animationConfig={{ reducedMotion: settings.reducedMotion }}
              className="flex-1"
            />
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link to="/dashboard">
                <Button size="sm" variant="secondary">
                  Daily Checklist
                </Button>
              </Link>
              <Link to="/companion">
                <Button size="sm" variant="secondary">
                  <MessageCircleHeart className="h-4 w-4" />
                  Ask Pillu
                </Button>
              </Link>
            </div>
          </Card>

          {/* Search & Time Slot Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-[#4B7478]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search medication, dosage, or prescriber..."
                aria-label="Search medications"
                className="min-h-[46px] w-full rounded-xl border border-[#C9D8D4] bg-white pl-10 pr-4 text-base text-[#10373A] placeholder:text-[#6B8A8D]"
              />
            </div>

            <div
              className="flex flex-wrap items-center gap-1 rounded-xl bg-[#EBF6F1] p-1"
              role="group"
              aria-label="Filter medications by time or status"
            >
              {SLOT_FILTERS.map((slot) => (
                <button
                  key={slot.value}
                  type="button"
                  onClick={() => setSlotFilter(slot.value)}
                  className={cn(
                    'min-h-[42px] sm:min-h-[38px] rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0',
                    slotFilter === slot.value
                      ? 'bg-white text-[#10373A] shadow-sm font-semibold'
                      : 'text-[#2C5E63] hover:text-[#10373A]',
                  )}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Pill className="h-6 w-6" />}
              title={
                slotFilter === 'discontinued'
                  ? 'No discontinued medications'
                  : 'No medications match this filter'
              }
              description={
                slotFilter === 'discontinued'
                  ? 'Safely discontinued prescriptions appear here while preserving all historical adherence logs.'
                  : 'Try clearing your search filter or add a new prescription to the care circle.'
              }
              actionLabel={
                canEdit && slotFilter !== 'discontinued' ? 'Add Medication' : undefined
              }
              onAction={
                canEdit && slotFilter !== 'discontinued' ? openCreateModal : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5" data-testid="medications-grid">
              {filtered.map((med) => {
                const times = getMedicationTimes(med);
                const timesLabel = times.map(formatTime12Hour).join(', ');
                const freqLabel = formatFrequencyLabel(
                  med.frequency,
                  med.weekdays,
                  med.customIntervalDays,
                );
                const isDiscontinued = Boolean(med.discontinued);

                return (
                  <Card
                    key={med.id}
                    tone={isDiscontinued ? 'warm' : med.active ? 'white' : 'warm'}
                    className="p-6 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-[#1A7A68] tabular-nums">
                          {timesLabel} · {freqLabel}
                        </span>
                        <span
                          className={cn(
                            'text-xs font-semibold tabular-nums',
                            isDiscontinued
                              ? 'text-[#6B7280]'
                              : med.supplyDays <= 7
                                ? 'text-[#9E5A00]'
                                : 'text-[#4B7478]',
                          )}
                        >
                          {isDiscontinued
                            ? `Discontinued ${med.discontinuedAt ? med.discontinuedAt.slice(0, 10) : ''}`
                            : `${med.active ? 'Active' : 'Paused'} · ${med.supplyDays}d supply`}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-display text-xl font-bold text-[#10373A]">
                          {med.name} · {med.dosage}
                        </h3>
                        <p className="mt-1 text-base text-[#2C5E63]">{med.instructions}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[#4B7478]">
                        <span className="inline-flex items-center gap-1.5 font-medium text-[#10373A]">
                          <Utensils className="h-3.5 w-3.5 text-[#1A7A68]" />
                          {formatFoodInstructionLabel(med.foodInstruction)}
                        </span>
                        {(med.startDate || med.endDate) && (
                          <span className="inline-flex items-center gap-1.5 tabular-nums">
                            <CalendarDays className="h-3.5 w-3.5 text-[#5D4A96]" />
                            {med.startDate || 'Start'}
                            {med.endDate ? ` → ${med.endDate}` : ' → Ongoing'}
                          </span>
                        )}
                        {med.timezone && (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-[#4B7478]" />
                            {med.timezone}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-[#4B7478]">
                        Prescriber: {med.prescriber} · {med.pillAppearance}
                      </p>

                      {med.prescriptionImageUrl && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setPreviewImageMed(med)}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A7A68] hover:underline underline-offset-4 cursor-pointer"
                          >
                            <ImageIcon className="h-4 w-4" />
                            View Prescription Photo
                          </button>
                        </div>
                      )}

                      {isDiscontinued && med.discontinuedReason && (
                        <p className="rounded-xl bg-[#F3F4F6] px-3.5 py-2 text-xs text-[#374151]">
                          Discontinued: {med.discontinuedReason} (Historical logs preserved)
                        </p>
                      )}

                      {!isDiscontinued && med.lastChangeNote && (
                        <p className="text-xs text-[#4B7478]">
                          Last update: {med.lastChangeNote}
                        </p>
                      )}
                    </div>

                    {canEdit && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EBF0EE] pt-4">
                        {isDiscontinued ? (
                          <span className="text-xs font-medium text-[#6B7280]">
                            Historical records preserved
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!emailVerified}
                              onClick={() => openEditModal(med)}
                            >
                              <Edit3 className="h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!emailVerified}
                              onClick={() => toggleMedicationActive(med.id)}
                            >
                              {med.active ? (
                                <>
                                  <Pause className="h-4 w-4" />
                                  Pause
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4" />
                                  Resume
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="lavender"
                              disabled={!emailVerified}
                              onClick={() => {
                                setDiscontinueTarget(med);
                                setDiscontinueReason('');
                              }}
                            >
                              <Ban className="h-4 w-4" />
                              Discontinue
                            </Button>
                          </div>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!emailVerified}
                          onClick={() => deleteMedication(med.id)}
                          aria-label={`Delete ${med.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-[#B42318]" />
                          <span className="text-[#B42318]">Remove</span>
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create / Safe Edit Medication Modal */}
      <Modal
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          resetForm();
        }}
        title={editingMed ? `Edit ${editingMed.name}` : 'Add Scheduled Medication'}
        description={
          editingMed
            ? `Update dosage, daily schedule times, or instructions safely without creating duplicate doses.`
            : `Add a prescription or supplement to ${activePatientProfile?.fullName || 'this patient'}’s care schedule.`
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Medication Name"
            placeholder="e.g., Levothyroxine"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Input
                label="Prescribed Dosage"
                placeholder="e.g., 50 or 500"
                value={dosageAmount}
                onChange={(e) => setDosageAmount(e.target.value)}
                error={errors.dosage}
              />
            </div>
            <Select
              label="Dosage Unit"
              value={dosageUnit}
              onChange={(e) => setDosageUnit(e.target.value as DosageUnit)}
              options={DOSAGE_UNITS}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Frequency"
              value={frequency}
              onChange={(e) =>
                handleFrequencyChange(e.target.value as MedicationFrequency)
              }
              options={FREQUENCY_OPTIONS}
            />
            <Select
              label="Meal Timing"
              value={foodInstruction}
              onChange={(e) =>
                setFoodInstruction(e.target.value as FoodInstruction)
              }
              options={FOOD_OPTIONS}
            />
          </div>

          {/* Dynamic Multi-Dose Scheduled Times */}
          <div className="space-y-2 rounded-xl border border-[#DCE5E2] bg-[#FAF9F6] p-4">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-semibold text-[#10373A]">
                Scheduled Times ({scheduledTimes.length} daily)
              </label>
              {scheduledTimes.length < 8 && (
                <button
                  type="button"
                  onClick={addTimeSlotRow}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#1A7A68] hover:underline cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Dose Time
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {scheduledTimes.map((timeVal, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={timeVal}
                    onChange={(e) => handleTimeChange(idx, e.target.value)}
                    aria-label={`Dose time ${idx + 1}`}
                    className="min-h-[42px] flex-1 rounded-xl border border-[#C9D8D4] bg-white px-3 py-2 text-sm text-[#10373A] tabular-nums"
                  />
                  {scheduledTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTimeSlotRow(idx)}
                      aria-label={`Remove dose time ${idx + 1}`}
                      className="min-h-[42px] min-w-[38px] flex items-center justify-center rounded-xl border border-[#DCE5E2] bg-white text-[#B42318] hover:bg-[#FEF2F2] cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {errors.scheduledTime && (
              <p className="text-xs font-medium text-[#B42318]">
                {errors.scheduledTime}
              </p>
            )}
          </div>

          {/* Specific Weekdays Selector */}
          {frequency === 'specific_weekdays' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#10373A]">
                Select Active Weekdays
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, dayIdx) => {
                  const selected = weekdays.includes(dayIdx);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleWeekday(dayIdx)}
                      aria-pressed={selected}
                      className={cn(
                        'min-h-[40px] min-w-[48px] rounded-xl px-3 text-sm font-semibold border transition-colors cursor-pointer whitespace-nowrap',
                        selected
                          ? 'bg-[#10373A] text-white border-[#10373A]'
                          : 'bg-white text-[#2C5E63] border-[#C9D8D4] hover:bg-[#EBF6F1]',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {errors.weekdays && (
                <p className="text-xs font-medium text-[#B42318]">{errors.weekdays}</p>
              )}
            </div>
          )}

          {/* Custom Interval */}
          {frequency === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Repeat Every (days)"
                type="number"
                min={1}
                max={90}
                value={customIntervalDays}
                onChange={(e) => setCustomIntervalDays(e.target.value)}
                error={errors.customIntervalDays}
              />
              <Input
                label="Custom Schedule Note"
                placeholder="e.g., Alternating mornings"
                value={customScheduleNote}
                onChange={(e) => setCustomScheduleNote(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              error={errors.startDate}
            />
            <Input
              label="End Date (Optional)"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              error={errors.endDate}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Schedule Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={timezoneOptions}
            />
            <Input
              label="Supply Remaining (days)"
              type="number"
              min={0}
              max={365}
              value={supplyDays}
              onChange={(e) => setSupplyDays(e.target.value)}
              error={errors.supplyDays}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Grace Window (minutes)"
              type="number"
              min={5}
              max={120}
              value={gracePeriodMinutes}
              onChange={(e) => setGracePeriodMinutes(e.target.value)}
              helperText="Time after scheduled dose before marking unconfirmed"
            />
            <Input
              label="Missed Review After (minutes)"
              type="number"
              min={30}
              max={720}
              value={missedAfterMinutes}
              onChange={(e) => setMissedAfterMinutes(e.target.value)}
              helperText="When unconfirmed window prompts caregiver review"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Prescribing Doctor"
              value={prescriber}
              onChange={(e) => setPrescriber(e.target.value)}
            />
            <Input
              label="Pill Appearance"
              value={pillAppearance}
              onChange={(e) => setPillAppearance(e.target.value)}
            />
          </div>

          <Textarea
            label="Clinical Instructions"
            placeholder="e.g., Take 30 minutes before breakfast with a full glass of water."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />

          {/* Optional Prescription Photo */}
          <div className="space-y-2 rounded-xl border border-[#DCE5E2] bg-[#FAF9F6] p-4">
            <label className="text-sm font-semibold text-[#10373A]">
              Prescription Image (Optional)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[#C6E3D5] bg-[#EBF6F1] px-3.5 py-2 text-sm font-medium text-[#10373A] hover:bg-[#D8EDE3] cursor-pointer">
                <Upload className="h-4 w-4" />
                Upload Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="sr-only"
                />
              </label>
              {prescriptionImageUrl && (
                <button
                  type="button"
                  onClick={() => setPrescriptionImageUrl('')}
                  className="text-xs font-semibold text-[#B42318] hover:underline cursor-pointer"
                >
                  Clear image
                </button>
              )}
            </div>
            {prescriptionImageUrl && (
              <img
                src={prescriptionImageUrl}
                alt="Prescription label preview"
                className="mt-2 h-24 w-auto rounded-lg border border-[#DCE5E2] object-cover"
              />
            )}
            {errors.prescriptionImageUrl && (
              <p className="text-xs font-medium text-[#B42318]">
                {errors.prescriptionImageUrl}
              </p>
            )}
          </div>

          {editingMed && (
            <Input
              label="Change Note (Optional)"
              placeholder="e.g., Evening dose adjusted per cardiology check-in"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
            />
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setIsFormOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Saving...'
                : editingMed
                  ? 'Save Changes'
                  : 'Save Medication'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Safe Discontinue Medication Modal */}
      <Modal
        open={Boolean(discontinueTarget)}
        onClose={() => setDiscontinueTarget(null)}
        title={`Discontinue ${discontinueTarget?.name || 'Medication'}`}
        description="Discontinuing stops all future scheduled reminders while keeping every past adherence record intact in your history."
      >
        <form onSubmit={handleConfirmDiscontinue} className="space-y-4">
          <Input
            label="Reason for Discontinuation"
            placeholder="e.g., Course completed or switched by Dr. Thorne"
            value={discontinueReason}
            onChange={(e) => setDiscontinueReason(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setDiscontinueTarget(null)}>
              Keep Active
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {submitting ? 'Updating...' : 'Confirm Discontinue'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Prescription Image Preview Modal */}
      <Modal
        open={Boolean(previewImageMed)}
        onClose={() => setPreviewImageMed(null)}
        title={previewImageMed ? `${previewImageMed.name} Prescription` : 'Prescription'}
      >
        {previewImageMed?.prescriptionImageUrl && (
          <img
            src={previewImageMed.prescriptionImageUrl}
            alt={`Prescription for ${previewImageMed.name}`}
            className="w-full max-h-[65vh] rounded-xl object-contain border border-[#DCE5E2]"
          />
        )}
      </Modal>

      {/* Phase 4: Gemini Vision Prescription Scanner Modal */}
      <Modal
        open={isScannerOpen}
        onClose={() => {
          setIsScannerOpen(false);
          resetScanner();
        }}
        title="Prescription Scanner (Gemini Vision)"
        description="Upload a prescription bottle or label photo to draft fields for caregiver review. Missing or unclear details are never guessed and must be entered manually."
      >
        <div className="space-y-4">
          {scannerStatusBlocked && (
            <ErrorBanner
              title="Gemini AI Configuration Blocked"
              message={scannerStatusBlocked}
            />
          )}

          {scanError && (
            <ErrorBanner
              title="Prescription Scanner Unavailable"
              message={scanError}
              onDismiss={() => setScanError(null)}
            />
          )}

          <div className="rounded-xl border border-[#DCE5E2] bg-[#FAF9F6] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[#C6E3D5] bg-[#EBF6F1] px-4 py-2 text-sm font-semibold text-[#10373A] hover:bg-[#D8EDE3] cursor-pointer">
                <Upload className="h-4 w-4" />
                {scanVisionImage ? 'Choose Different Photo' : 'Upload Prescription Photo'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={scanning || Boolean(scannerStatusBlocked)}
                  onChange={handleScannerFileChange}
                  className="sr-only"
                  data-testid="prescription-scan-input"
                />
              </label>

              {scanVisionImage && !scanning && !scannerStatusBlocked && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => runPrescriptionScan(scanVisionImage)}
                >
                  Re-scan Photo
                </Button>
              )}
            </div>

            {scanning && (
              <p className="text-sm font-medium text-[#1A7A68]">
                Reading printed label with Gemini Vision...
              </p>
            )}

            {scanVisionImage && (
              <img
                src={scanVisionImage}
                alt="Uploaded prescription for review"
                className="max-h-44 w-auto rounded-lg border border-[#DCE5E2] object-contain"
              />
            )}
          </div>

          {scanDraft && (
            <form onSubmit={handleSaveScannedMedication} className="space-y-4">
              {scanDraft.uncertainFields.length > 0 && (
                <div className="rounded-xl border border-[#F5D08A] bg-[#FFFBEB] px-4 py-3 text-sm text-[#7A4400]">
                  <p className="font-semibold">
                    Manual entry required for uncertain fields:{' '}
                    {scanDraft.uncertainFields.join(', ')}
                  </p>
                  {scanDraft.extractionNotes && (
                    <p className="mt-1 text-xs">{scanDraft.extractionNotes}</p>
                  )}
                </div>
              )}

              {scanDraft.uncertainFields.length === 0 && scanDraft.extractionNotes && (
                <p className="text-xs text-[#4B7478]">{scanDraft.extractionNotes}</p>
              )}

              <Input
                label="Medication Name"
                value={scanName}
                onChange={(e) => setScanName(e.target.value)}
                error={scanFormErrors.name}
                helperText={
                  scanDraft.uncertainFields.includes('medicineName')
                    ? 'Unclear on label — please verify or enter manually'
                    : undefined
                }
                className={
                  scanDraft.uncertainFields.includes('medicineName') || !scanName.trim()
                    ? 'border-[#D97706] bg-[#FFFDF7]'
                    : undefined
                }
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Input
                    label="Prescribed Dosage"
                    placeholder="Enter dosage manually if blank"
                    value={scanDosageAmount}
                    onChange={(e) => setScanDosageAmount(e.target.value)}
                    error={scanFormErrors.dosage}
                    helperText={
                      scanDraft.uncertainFields.includes('dosageAmount') ||
                      !scanDosageAmount.trim()
                        ? 'Needs manual entry — missing or unclear on photo'
                        : undefined
                    }
                    className={
                      scanDraft.uncertainFields.includes('dosageAmount') ||
                      !scanDosageAmount.trim()
                        ? 'border-[#D97706] bg-[#FFFDF7]'
                        : undefined
                    }
                  />
                </div>
                <Select
                  label="Dosage Unit"
                  value={scanDosageUnit}
                  onChange={(e) => setScanDosageUnit(e.target.value as DosageUnit | '')}
                  options={[
                    { value: '', label: 'Select unit manually...' },
                    ...DOSAGE_UNITS,
                  ]}
                  error={scanFormErrors.dosageUnit}
                  className={
                    scanDraft.uncertainFields.includes('dosageUnit') || !scanDosageUnit
                      ? 'border-[#D97706] bg-[#FFFDF7]'
                      : undefined
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Frequency"
                  value={scanFrequency}
                  onChange={(e) =>
                    setScanFrequency(e.target.value as MedicationFrequency | '')
                  }
                  options={[
                    { value: '', label: 'Select frequency manually...' },
                    ...FREQUENCY_OPTIONS,
                  ]}
                  error={scanFormErrors.frequency}
                  helperText={
                    scanDraft.frequencyText
                      ? `Label text: "${scanDraft.frequencyText}"`
                      : scanDraft.uncertainFields.includes('frequency')
                        ? 'Unclear on label — select manually'
                        : undefined
                  }
                  className={
                    scanDraft.uncertainFields.includes('frequency') || !scanFrequency
                      ? 'border-[#D97706] bg-[#FFFDF7]'
                      : undefined
                  }
                />
                <Select
                  label="Meal Timing"
                  value={scanFood}
                  onChange={(e) => setScanFood(e.target.value as FoodInstruction)}
                  options={FOOD_OPTIONS}
                />
              </div>

              <div className="space-y-2 rounded-xl border border-[#DCE5E2] bg-[#FAF9F6] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-semibold text-[#10373A]">
                    Scheduled Times ({scanTimes.length} daily)
                  </label>
                  {scanTimes.length < 8 && (
                    <button
                      type="button"
                      onClick={() =>
                        setScanTimes((prev) => [...prev, '20:00'])
                      }
                      className="text-xs font-semibold text-[#1A7A68] hover:underline cursor-pointer"
                    >
                      + Add Time
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {scanTimes.map((t, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={t}
                        onChange={(e) =>
                          setScanTimes((prev) =>
                            prev.map((val, i) => (i === idx ? e.target.value : val)),
                          )
                        }
                        aria-label={`Scanned dose time ${idx + 1}`}
                        className="min-h-[40px] flex-1 rounded-xl border border-[#C9D8D4] bg-white px-3 text-sm text-[#10373A] tabular-nums"
                      />
                      {scanTimes.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setScanTimes((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label={`Remove scanned time ${idx + 1}`}
                          className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-xl border border-[#DCE5E2] bg-white text-[#B42318] cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Prescribing Doctor"
                  placeholder="Optional"
                  value={scanPrescriber}
                  onChange={(e) => setScanPrescriber(e.target.value)}
                />
                <Input
                  label="Supply Remaining (days)"
                  type="number"
                  min={0}
                  max={365}
                  value={scanSupplyDays}
                  onChange={(e) => setScanSupplyDays(e.target.value)}
                  error={scanFormErrors.supplyDays}
                />
              </div>

              <Textarea
                label="Clinical Instructions"
                placeholder="Enter exact administration instructions from label"
                value={scanInstructions}
                onChange={(e) => setScanInstructions(e.target.value)}
                helperText={
                  scanDraft.uncertainFields.includes('instructions') ||
                  !scanInstructions.trim()
                    ? 'Needs manual review — verify exact instructions on bottle'
                    : undefined
                }
                className={
                  scanDraft.uncertainFields.includes('instructions') ||
                  !scanInstructions.trim()
                    ? 'border-[#D97706] bg-[#FFFDF7]'
                    : undefined
                }
              />

              <label className="flex items-start gap-3 rounded-xl border border-[#CBE4D8] bg-[#F1F8F5] p-3.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scanCaregiverConfirmed}
                  onChange={(e) => setScanCaregiverConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#10373A]"
                  data-testid="scan-caregiver-confirm-checkbox"
                />
                <span className="text-sm font-medium text-[#10373A]">
                  I have compared this draft against the physical prescription label
                  and confirm the medication name, dosage, and schedule are accurate.
                </span>
              </label>
              {scanFormErrors.caregiverConfirmed && (
                <p className="text-xs font-medium text-[#B42318]">
                  {scanFormErrors.caregiverConfirmed}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsScannerOpen(false);
                    resetScanner();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || !scanCaregiverConfirmed}
                  data-testid="save-scanned-medication-btn"
                >
                  {submitting ? 'Saving...' : 'Confirm & Save Medication'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </AppShell>
  );
}
