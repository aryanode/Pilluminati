import crypto from 'node:crypto';
import { ApiError } from '../middleware/errorHandler.ts';
import {
  inferTimeSlotFromTime,
  isValidTimeZone,
  normalizeScheduledTimes,
} from '../../src/utils/medicationEngine.ts';

const ID_REGEX = /^[a-zA-Z0-9_-]{16,128}$/;
const TOKEN_ID_REGEX = /^[a-zA-Z0-9_-]{20,128}$/;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const ALLOWED_FREQUENCIES = [
  'once_daily',
  'twice_daily',
  'three_times_daily',
  'specific_weekdays',
  'custom',
] as const;

const ALLOWED_FOOD_INSTRUCTIONS = [
  'before_food',
  'after_food',
  'with_food',
  'no_restriction',
] as const;

const ALLOWED_DOSE_STATUSES = [
  'pending',
  'upcoming',
  'due',
  'taken',
  'unconfirmed',
  'missed',
  'skipped',
  'corrected',
] as const;

export function generateServerId(prefix: string, byteLength = 12): string {
  const rand = crypto.randomBytes(byteLength).toString('base64url');
  return `${prefix}_${rand}`;
}

export function assertStrongId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !ID_REGEX.test(value.trim())) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid ${fieldName}.`);
  }
  return value.trim();
}

export function assertTokenId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !TOKEN_ID_REGEX.test(value.trim())) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid ${fieldName}.`);
  }
  return value.trim();
}

export function assertNonEmptyString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${fieldName} is required.`);
  }
  const clean = value.trim();
  if (clean.length > maxLength) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be at most ${maxLength} characters.`,
    );
  }
  return clean;
}

export function optionalString(
  value: unknown,
  fieldName: string,
  maxLength: number,
  fallback = '',
): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `${fieldName} must be text.`);
  }
  return value.trim().slice(0, maxLength);
}

function parseScheduledTimesPayload(body: Record<string, unknown>): string[] {
  const rawList = Array.isArray(body.scheduledTimes)
    ? body.scheduledTimes
    : typeof body.scheduledTime === 'string'
      ? [body.scheduledTime]
      : [];

  if (rawList.length === 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'At least one scheduled time in HH:mm (24h) is required.',
    );
  }
  if (rawList.length > 8) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Maximum 8 daily scheduled dose times are supported per medication.',
    );
  }

  for (const item of rawList) {
    if (typeof item !== 'string' || !TIME_24H_REGEX.test(item.trim())) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Every scheduled time must be in HH:mm (24h) format.',
      );
    }
  }

  return normalizeScheduledTimes(rawList.map((s) => String(s).trim()));
}

function parseMedicationSharedFields(body: Record<string, unknown>) {
  const name = assertNonEmptyString(body.name, 'Medication name', 120);
  const dosageAmount = optionalString(body.dosageAmount, 'dosageAmount', 30);
  const dosageUnit = optionalString(body.dosageUnit, 'dosageUnit', 30);
  const rawDosage = optionalString(body.dosage, 'dosage', 60);
  const dosage =
    rawDosage ||
    [dosageAmount, dosageUnit].filter(Boolean).join(' ').slice(0, 60);

  if (!dosage) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Dosage is required.');
  }

  const frequencyRaw = body.frequency ?? 'once_daily';
  if (
    typeof frequencyRaw !== 'string' ||
    !(ALLOWED_FREQUENCIES as readonly string[]).includes(frequencyRaw)
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid medication frequency.');
  }
  const frequency = frequencyRaw as (typeof ALLOWED_FREQUENCIES)[number];

  const scheduledTimes = parseScheduledTimesPayload(body);
  const primaryScheduledTime = scheduledTimes[0];

  const rawTimeSlot = body.timeSlot;
  const timeSlot =
    rawTimeSlot === 'morning' ||
    rawTimeSlot === 'midday' ||
    rawTimeSlot === 'evening' ||
    rawTimeSlot === 'bedtime'
      ? rawTimeSlot
      : inferTimeSlotFromTime(primaryScheduledTime);

  let weekdays: number[] = [];
  if (Array.isArray(body.weekdays)) {
    const cleanDays = new Set<number>();
    for (const day of body.weekdays) {
      const n = Number(day);
      if (!Number.isInteger(n) || n < 0 || n > 6) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Weekdays must be integers from 0 (Sunday) to 6 (Saturday).',
        );
      }
      cleanDays.add(n);
    }
    weekdays = Array.from(cleanDays).sort((a, b) => a - b);
  }
  if (frequency === 'specific_weekdays' && weekdays.length === 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Select at least one weekday for specific-weekday schedules.',
    );
  }

  const customIntervalDaysRaw = Number(body.customIntervalDays ?? 2);
  if (
    !Number.isFinite(customIntervalDaysRaw) ||
    customIntervalDaysRaw < 1 ||
    customIntervalDaysRaw > 90
  ) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Custom interval days must be between 1 and 90.',
    );
  }
  const customIntervalDays = Math.round(customIntervalDaysRaw);

  const startDate = optionalString(body.startDate, 'startDate', 20);
  if (startDate && !DATE_ISO_REGEX.test(startDate)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'startDate must be YYYY-MM-DD.');
  }
  const endDate = optionalString(body.endDate, 'endDate', 20);
  if (endDate && !DATE_ISO_REGEX.test(endDate)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'endDate must be YYYY-MM-DD.');
  }
  if (startDate && endDate && endDate < startDate) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'End date cannot be earlier than start date.',
    );
  }

  const foodRaw = body.foodInstruction ?? 'no_restriction';
  if (
    typeof foodRaw !== 'string' ||
    !(ALLOWED_FOOD_INSTRUCTIONS as readonly string[]).includes(foodRaw)
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid food instruction.');
  }
  const foodInstruction = foodRaw as (typeof ALLOWED_FOOD_INSTRUCTIONS)[number];

  const timezone = optionalString(body.timezone, 'timezone', 64, 'UTC');
  if (timezone && !isValidTimeZone(timezone)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid IANA timezone.');
  }

  const gracePeriodRaw = Number(body.gracePeriodMinutes ?? 30);
  if (!Number.isFinite(gracePeriodRaw) || gracePeriodRaw < 5 || gracePeriodRaw > 120) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Grace period must be between 5 and 120 minutes.',
    );
  }
  const gracePeriodMinutes = Math.round(gracePeriodRaw);

  const missedAfterRaw = Number(body.missedAfterMinutes ?? 180);
  if (!Number.isFinite(missedAfterRaw) || missedAfterRaw < 30 || missedAfterRaw > 720) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Missed-dose threshold must be between 30 and 720 minutes.',
    );
  }
  const missedAfterMinutes = Math.max(gracePeriodMinutes + 15, Math.round(missedAfterRaw));

  const prescriptionImageUrl = optionalString(
    body.prescriptionImageUrl,
    'prescriptionImageUrl',
    120_000,
  );
  if (
    prescriptionImageUrl &&
    !prescriptionImageUrl.startsWith('https://') &&
    !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(prescriptionImageUrl)
  ) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Prescription image must be an HTTPS URL or compressed PNG/JPEG/WebP image.',
    );
  }

  const supplyNum = Number(body.supplyDays ?? 30);
  if (!Number.isFinite(supplyNum) || supplyNum < 0 || supplyNum > 365) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Supply days must be between 0 and 365.',
    );
  }

  return {
    name,
    dosage,
    dosageAmount: dosageAmount || dosage.split(' ')[0]?.slice(0, 30) || dosage.slice(0, 30),
    dosageUnit: dosageUnit || dosage.split(' ').slice(1).join(' ').slice(0, 30) || 'mg',
    frequency,
    timeSlot,
    scheduledTime: primaryScheduledTime,
    scheduledTimes,
    weekdays,
    customIntervalDays,
    customScheduleNote: optionalString(body.customScheduleNote, 'customScheduleNote', 160),
    startDate,
    endDate,
    instructions: optionalString(
      body.instructions,
      'instructions',
      300,
      'Take as prescribed.',
    ),
    foodInstruction,
    prescriber: optionalString(body.prescriber, 'prescriber', 120, 'Primary Physician'),
    pillAppearance: optionalString(body.pillAppearance, 'pillAppearance', 100, 'Tablet'),
    prescriptionImageUrl,
    timezone: timezone || 'UTC',
    gracePeriodMinutes,
    missedAfterMinutes,
    supplyDays: Math.round(supplyNum),
    active: body.active !== undefined ? Boolean(body.active) : true,
  };
}

export function validateCreateMedicationBody(body: Record<string, unknown>) {
  const profileId = assertStrongId(body.profileId, 'profileId');
  return {
    profileId,
    ...parseMedicationSharedFields(body),
  };
}

export function validateUpdateMedicationBody(body: Record<string, unknown>) {
  return {
    ...parseMedicationSharedFields(body),
    changeNote: optionalString(body.changeNote, 'changeNote', 240),
  };
}

export function validateDiscontinueMedicationBody(body: Record<string, unknown>) {
  return {
    reason: optionalString(
      body.reason,
      'reason',
      300,
      'Discontinued per clinical care plan.',
    ),
  };
}

export function validateAdherenceBody(body: Record<string, unknown>) {
  const profileId = assertStrongId(body.profileId, 'profileId');
  const medicationId = assertStrongId(body.medicationId, 'medicationId');
  const status = body.status;
  if (
    typeof status !== 'string' ||
    !(ALLOWED_DOSE_STATUSES as readonly string[]).includes(status)
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid dose status.');
  }
  if (typeof body.scheduledDate !== 'string' || !DATE_ISO_REGEX.test(body.scheduledDate.trim())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'scheduledDate must be YYYY-MM-DD.');
  }

  let scheduledTime = optionalString(body.scheduledTime, 'scheduledTime', 10);
  if (scheduledTime && !TIME_24H_REGEX.test(scheduledTime)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'scheduledTime must be HH:mm (24h).');
  }

  const correctedFromStatusRaw = body.correctedFromStatus;
  let correctedFromStatus: (typeof ALLOWED_DOSE_STATUSES)[number] | undefined;
  if (correctedFromStatusRaw !== undefined && correctedFromStatusRaw !== null && correctedFromStatusRaw !== '') {
    if (
      typeof correctedFromStatusRaw !== 'string' ||
      !(ALLOWED_DOSE_STATUSES as readonly string[]).includes(correctedFromStatusRaw)
    ) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid correctedFromStatus.');
    }
    correctedFromStatus = correctedFromStatusRaw as (typeof ALLOWED_DOSE_STATUSES)[number];
  }

  return {
    profileId,
    medicationId,
    status: status as (typeof ALLOWED_DOSE_STATUSES)[number],
    scheduledDate: body.scheduledDate.trim(),
    scheduledTime,
    actualConfirmedAt: optionalString(body.actualConfirmedAt, 'actualConfirmedAt', 40),
    correctedFromStatus,
    correctionReason: optionalString(body.correctionReason, 'correctionReason', 300),
    note: optionalString(body.note, 'note', 300),
    existingLogId:
      typeof body.existingLogId === 'string' && body.existingLogId.trim()
        ? assertStrongId(body.existingLogId, 'existingLogId')
        : undefined,
  };
}

function parseAppointmentSharedFields(body: Record<string, unknown>) {
  const doctorName = assertNonEmptyString(body.doctorName, 'Doctor name', 120);
  const specialty = optionalString(body.specialty, 'specialty', 100, 'Clinic Visit');
  const rawTitle = optionalString(body.title, 'title', 140);
  const title = (
    rawTitle ||
    (specialty && specialty !== 'Clinic Visit'
      ? `${specialty} — ${doctorName}`
      : `Visit with ${doctorName}`)
  ).slice(0, 140);

  if (typeof body.date !== 'string' || !DATE_ISO_REGEX.test(body.date.trim())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Appointment date must be YYYY-MM-DD.');
  }
  if (typeof body.time !== 'string' || !TIME_24H_REGEX.test(body.time.trim())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Appointment time must be HH:mm.');
  }

  return {
    title,
    doctorName,
    specialty: specialty || 'Clinic Visit',
    date: body.date.trim(),
    time: body.time.trim(),
    location: optionalString(body.location, 'location', 200, 'Primary Clinic'),
    assignedCaregiver: optionalString(
      body.assignedCaregiver,
      'assignedCaregiver',
      120,
      'Care Team',
    ),
    notes: optionalString(body.notes, 'notes', 400),
  };
}

export function validateAppointmentBody(body: Record<string, unknown>) {
  const profileId = assertStrongId(body.profileId, 'profileId');
  return {
    profileId,
    ...parseAppointmentSharedFields(body),
  };
}

export function validateUpdateAppointmentBody(body: Record<string, unknown>) {
  return parseAppointmentSharedFields(body);
}

export function validateHandoffBody(body: Record<string, unknown>) {
  const profileId = assertStrongId(body.profileId, 'profileId');
  const toCaregiver = assertNonEmptyString(body.toCaregiver, 'Recipient caregiver', 120);
  const shiftWindow = assertNonEmptyString(body.shiftWindow, 'Shift window', 80);
  const summary = assertNonEmptyString(body.summary, 'Handoff summary', 500);
  return { profileId, toCaregiver, shiftWindow, summary };
}

export function validateEmergencyTokenBody(body: Record<string, unknown>) {
  const profileId = assertStrongId(body.profileId, 'profileId');
  const label = assertNonEmptyString(body.label, 'Recipient label', 100);
  const validHoursRaw = Number(body.validHours ?? 24);
  if (!Number.isFinite(validHoursRaw) || validHoursRaw < 1 || validHoursRaw > 168) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'validHours must be between 1 and 168.');
  }
  return {
    profileId,
    label,
    includeMedications: Boolean(body.includeMedications ?? true),
    validHours: Math.round(validHoursRaw),
  };
}

export function validateAlertBody(body: Record<string, unknown>) {
  const profileId = assertStrongId(body.profileId, 'profileId');
  const severity = body.severity;
  if (severity !== 'info' && severity !== 'warning' && severity !== 'urgent') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid alert severity.');
  }
  const title = assertNonEmptyString(body.title, 'Alert title', 140);
  const detail = assertNonEmptyString(body.detail, 'Alert detail', 400);
  return {
    profileId,
    severity: severity as 'info' | 'warning' | 'urgent',
    title,
    detail,
  };
}

export function validatePrescriptionScanBody(body: Record<string, unknown>) {
  const profileId = assertStrongId(body.profileId, 'profileId');
  const rawImage = body.imageDataUrl;
  if (typeof rawImage !== 'string' || !rawImage.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Prescription image is required.');
  }
  const clean = rawImage.trim();
  const match = clean.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i,
  );
  if (!match) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Upload a valid PNG, JPEG, or WebP prescription image.',
    );
  }
  if (clean.length > 3_000_000) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Prescription image exceeds maximum allowed size (2 MB).',
    );
  }
  return {
    profileId,
    mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
    base64Data: match[2],
  };
}

