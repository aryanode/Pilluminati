import { getFreshIdToken } from './firestoreService';
import type {
  Appointment,
  CareRelayHandoff,
  ClinicalAlert,
  DoseStatus,
  Medication,
  NotificationCapabilityReport,
  PrescriptionScanDraft,
  SchedulerStatusInfo,
} from '../types/pilluminati';

async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    authenticated?: boolean;
  } = {},
): Promise<T> {
  const { method = 'GET', body, authenticated = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (authenticated) {
    const token = await getFreshIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  } & T;

  if (!res.ok) {
    throw new Error(
      payload.error || `Backend request failed with HTTP ${res.status}.`,
    );
  }
  return payload;
}

export async function sendSessionHeartbeat(profileId?: string): Promise<{
  registered: boolean;
  scheduler: SchedulerStatusInfo;
}> {
  return apiRequest('/api/session/heartbeat', {
    method: 'POST',
    body: profileId ? { profileId } : {},
  });
}

export async function notifySessionLogout(): Promise<void> {
  try {
    await apiRequest('/api/session/logout', { method: 'POST', body: {} });
  } catch {
    // Ignore logout cleanup failure when token is already cleared
  }
}

export async function apiCreateMedication(
  profileId: string,
  draft: Omit<Medication, 'id'>,
): Promise<{ id: string; scheduleId: string; scheduleIds?: string[] }> {
  return apiRequest('/api/medications', {
    method: 'POST',
    body: {
      profileId,
      name: draft.name,
      dosage: draft.dosage,
      dosageAmount: draft.dosageAmount,
      dosageUnit: draft.dosageUnit,
      frequency: draft.frequency,
      timeSlot: draft.timeSlot,
      scheduledTime: draft.scheduledTime,
      scheduledTimes: draft.scheduledTimes,
      weekdays: draft.weekdays,
      customIntervalDays: draft.customIntervalDays,
      customScheduleNote: draft.customScheduleNote,
      startDate: draft.startDate,
      endDate: draft.endDate,
      instructions: draft.instructions,
      foodInstruction: draft.foodInstruction,
      prescriber: draft.prescriber,
      pillAppearance: draft.pillAppearance,
      prescriptionImageUrl: draft.prescriptionImageUrl,
      timezone: draft.timezone,
      gracePeriodMinutes: draft.gracePeriodMinutes,
      missedAfterMinutes: draft.missedAfterMinutes,
      supplyDays: draft.supplyDays,
      active: draft.active,
    },
  });
}

export async function apiUpdateMedication(
  medId: string,
  draft: Omit<Medication, 'id'> & { changeNote?: string },
): Promise<{ id: string; updated: boolean }> {
  return apiRequest(`/api/medications/${encodeURIComponent(medId)}`, {
    method: 'PATCH',
    body: {
      name: draft.name,
      dosage: draft.dosage,
      dosageAmount: draft.dosageAmount,
      dosageUnit: draft.dosageUnit,
      frequency: draft.frequency,
      timeSlot: draft.timeSlot,
      scheduledTime: draft.scheduledTime,
      scheduledTimes: draft.scheduledTimes,
      weekdays: draft.weekdays,
      customIntervalDays: draft.customIntervalDays,
      customScheduleNote: draft.customScheduleNote,
      startDate: draft.startDate,
      endDate: draft.endDate,
      instructions: draft.instructions,
      foodInstruction: draft.foodInstruction,
      prescriber: draft.prescriber,
      pillAppearance: draft.pillAppearance,
      prescriptionImageUrl: draft.prescriptionImageUrl,
      timezone: draft.timezone,
      gracePeriodMinutes: draft.gracePeriodMinutes,
      missedAfterMinutes: draft.missedAfterMinutes,
      supplyDays: draft.supplyDays,
      active: draft.active,
      changeNote: draft.changeNote,
    },
  });
}

export async function apiDiscontinueMedication(
  medId: string,
  reason: string,
): Promise<{ id: string; discontinued: boolean; discontinuedAt: string }> {
  return apiRequest(`/api/medications/${encodeURIComponent(medId)}/discontinue`, {
    method: 'PATCH',
    body: { reason },
  });
}

export async function apiToggleMedicationActive(
  medId: string,
): Promise<{ id: string; active: boolean }> {
  return apiRequest(`/api/medications/${encodeURIComponent(medId)}/toggle`, {
    method: 'PATCH',
    body: {},
  });
}

export async function apiDeleteMedication(medId: string): Promise<void> {
  await apiRequest(`/api/medications/${encodeURIComponent(medId)}`, {
    method: 'DELETE',
  });
}

export async function apiRecordAdherence(params: {
  profileId: string;
  medicationId: string;
  scheduledDate: string;
  scheduledTime?: string;
  status: DoseStatus;
  existingLogId?: string;
  actualConfirmedAt?: string;
  correctedFromStatus?: DoseStatus;
  correctionReason?: string;
  note?: string;
}): Promise<{ id: string; status: DoseStatus; alertCreated?: boolean }> {
  return apiRequest('/api/adherence', {
    method: 'POST',
    body: params,
  });
}

export async function apiCreateAppointment(
  profileId: string,
  appt: Omit<Appointment, 'id'>,
): Promise<{ id: string; status: Appointment['status'] }> {
  return apiRequest('/api/appointments', {
    method: 'POST',
    body: {
      profileId,
      title: appt.title,
      doctorName: appt.doctorName,
      specialty: appt.specialty,
      date: appt.date,
      time: appt.time,
      location: appt.location,
      assignedCaregiver: appt.assignedCaregiver,
      notes: appt.notes,
    },
  });
}

export async function apiUpdateAppointment(
  apptId: string,
  appt: Omit<Appointment, 'id' | 'status'>,
): Promise<{ id: string; updated: boolean }> {
  return apiRequest(`/api/appointments/${encodeURIComponent(apptId)}`, {
    method: 'PATCH',
    body: {
      title: appt.title,
      doctorName: appt.doctorName,
      specialty: appt.specialty,
      date: appt.date,
      time: appt.time,
      location: appt.location,
      assignedCaregiver: appt.assignedCaregiver,
      notes: appt.notes,
    },
  });
}

export async function apiUpdateAppointmentStatus(
  apptId: string,
  status: Appointment['status'],
): Promise<{ id: string; status: Appointment['status'] }> {
  return apiRequest(`/api/appointments/${encodeURIComponent(apptId)}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export async function apiDeleteAppointment(apptId: string): Promise<void> {
  await apiRequest(`/api/appointments/${encodeURIComponent(apptId)}`, {
    method: 'DELETE',
  });
}

export async function apiCreateCareRelayHandoff(
  profileId: string,
  handoff: Omit<CareRelayHandoff, 'id' | 'createdAt'>,
): Promise<{ id: string; status: CareRelayHandoff['status'] }> {
  return apiRequest('/api/care-relay', {
    method: 'POST',
    body: {
      profileId,
      toCaregiver: handoff.toCaregiver,
      shiftWindow: handoff.shiftWindow,
      summary: handoff.summary,
    },
  });
}

export async function apiAcknowledgeCareRelayHandoff(
  handoffId: string,
): Promise<{ id: string; status: CareRelayHandoff['status'] }> {
  return apiRequest(
    `/api/care-relay/${encodeURIComponent(handoffId)}/acknowledge`,
    {
      method: 'PATCH',
      body: {},
    },
  );
}

export async function apiCreateCareAlert(params: {
  profileId: string;
  severity: ClinicalAlert['severity'];
  title: string;
  detail: string;
}): Promise<{
  alertId: string;
  deliveryReport: NotificationCapabilityReport;
}> {
  return apiRequest('/api/alerts', {
    method: 'POST',
    body: params,
  });
}

export async function apiResolveAlert(alertId: string): Promise<void> {
  await apiRequest(`/api/alerts/${encodeURIComponent(alertId)}/resolve`, {
    method: 'PATCH',
    body: {},
  });
}

export async function apiGetSchedulerStatus(): Promise<SchedulerStatusInfo> {
  return apiRequest('/api/scheduler/status');
}

export async function apiRunSchedulerNow(
  profileId: string,
  escalationGraceMinutes = 30,
): Promise<{
  runId: string;
  schedulesChecked: number;
  overdueFound: number;
  alertsCreated: number;
  handoffsEscalated: number;
  summary: string;
  scheduler: SchedulerStatusInfo;
  notifications: NotificationCapabilityReport;
}> {
  return apiRequest('/api/scheduler/run', {
    method: 'POST',
    body: { profileId, escalationGraceMinutes },
  });
}

export async function apiNotifyUnconfirmedDoses(
  profileId: string,
  escalationGraceMinutes = 30,
): Promise<{
  runId: string;
  schedulesChecked: number;
  overdueFound: number;
  alertsCreated: number;
  handoffsEscalated: number;
  summary: string;
  scheduler: SchedulerStatusInfo;
  notifications: NotificationCapabilityReport;
  automaticOfflineEscalation: {
    implemented: boolean;
    note: string;
  };
}> {
  return apiRequest('/api/care-relay/notify-unconfirmed', {
    method: 'POST',
    body: { profileId, escalationGraceMinutes },
  });
}

export async function apiCreateEmergencyToken(params: {
  profileId: string;
  label: string;
  includeMedications: boolean;
  validHours: number;
}): Promise<{
  tokenId: string;
  emergencyUrl: string;
  qrDataUrl: string;
  expiresAt: string;
}> {
  return apiRequest('/api/emergency-tokens', {
    method: 'POST',
    body: params,
  });
}

export async function apiRevokeEmergencyToken(tokenId: string): Promise<void> {
  await apiRequest(
    `/api/emergency-tokens/${encodeURIComponent(tokenId)}/revoke`,
    {
      method: 'PATCH',
      body: {},
    },
  );
}

export async function apiGetAiStatus(): Promise<{
  configured: boolean;
  model: string;
  reason?: string;
}> {
  return apiRequest('/api/companion/status');
}

export async function apiScanPrescription(params: {
  profileId: string;
  imageDataUrl: string;
}): Promise<{
  draft: PrescriptionScanDraft;
  model: string;
}> {
  return apiRequest('/api/medications/scan-prescription', {
    method: 'POST',
    body: params,
  });
}

export async function apiCompanionChat(params: {
  profileId: string;
  message: string;
  history: { role: 'user' | 'model'; text: string }[];
}): Promise<{
  reply: string;
  model: string;
}> {
  return apiRequest('/api/companion/chat', {
    method: 'POST',
    body: params,
  });
}

export async function apiGenerateCareSummary(profileId: string): Promise<{
  summary: string;
  model: string;
}> {
  return apiRequest('/api/companion/summary', {
    method: 'POST',
    body: { profileId },
  });
}

export async function apiGetMonitoringStatus(): Promise<{
  scheduler: SchedulerStatusInfo;
  notifications: NotificationCapabilityReport;
}> {
  return apiRequest('/api/monitoring/status');
}
