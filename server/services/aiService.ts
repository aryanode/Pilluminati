import { GoogleGenAI, Type } from '@google/genai';
import type {
  FoodInstruction,
  MedicationFrequency,
  PrescriptionScanDraft,
} from '../../src/types/pilluminati.ts';
import { serverConfig } from '../config.ts';
import { logEvent, monitoringMetrics } from '../logger.ts';
import { ApiError } from '../middleware/errorHandler.ts';
import { generateServerId } from '../utils/validation.ts';
import type { AuthoritativeProfile, DerivedProfileRole } from './authzService.ts';
import {
  commitFirestoreWrites,
  queryFirestoreCollection,
  SERVER_TIMESTAMP,
} from './firestoreRest.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';

export function getAiConfigurationStatus(): {
  configured: boolean;
  model: string;
  reason?: string;
} {
  return {
    configured: Boolean(serverConfig.geminiApiKey),
    model: GEMINI_MODEL,
    ...(serverConfig.geminiApiKey
      ? {}
      : {
          reason:
            'GEMINI_API_KEY is not configured in server environment Secrets.',
        }),
  };
}

function getGeminiClient(): GoogleGenAI {
  if (!serverConfig.geminiApiKey) {
    throw new ApiError(
      503,
      'GEMINI_NOT_CONFIGURED',
      'Gemini API key is not configured in server environment Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey: serverConfig.geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function loadAuthoritativeAiContext(params: {
  profile: AuthoritativeProfile;
  role: DerivedProfileRole;
  uid: string;
  idToken: string;
}) {
  const { profile, role, uid, idToken } = params;
  const isClinical = role === 'patient' || role === 'caregiver';
  const authField = isClinical ? 'clinicalUids' : 'authorizedUids';

  const canSeeMeds = isClinical || profile.familyShowDetailedMeds;
  const canSeeAdherence =
    isClinical || (profile.familyShowDetailedMeds && profile.familyShowAdherencePct);
  const canSeeAppointments = isClinical || profile.familyShowAppointments;

  const [medsRaw, schedsRaw, logsRaw, apptsRaw] = await Promise.all([
    canSeeMeds
      ? queryFirestoreCollection<Record<string, unknown>>(
          'medications',
          [
            { field: 'profileId', op: 'EQUAL', value: profile.id },
            { field: authField, op: 'ARRAY_CONTAINS', value: uid },
            ...(!isClinical ? [{ field: 'familyAllowed', op: 'EQUAL' as const, value: true }] : []),
          ],
          idToken,
        )
      : Promise.resolve([]),
    canSeeMeds
      ? queryFirestoreCollection<Record<string, unknown>>(
          'medicationSchedules',
          [
            { field: 'profileId', op: 'EQUAL', value: profile.id },
            { field: authField, op: 'ARRAY_CONTAINS', value: uid },
            ...(!isClinical ? [{ field: 'familyAllowed', op: 'EQUAL' as const, value: true }] : []),
          ],
          idToken,
        )
      : Promise.resolve([]),
    canSeeAdherence
      ? queryFirestoreCollection<Record<string, unknown>>(
          'adherenceRecords',
          [
            { field: 'profileId', op: 'EQUAL', value: profile.id },
            { field: authField, op: 'ARRAY_CONTAINS', value: uid },
            ...(!isClinical ? [{ field: 'familyAllowed', op: 'EQUAL' as const, value: true }] : []),
          ],
          idToken,
        )
      : Promise.resolve([]),
    canSeeAppointments
      ? queryFirestoreCollection<Record<string, unknown>>(
          'appointments',
          [
            { field: 'profileId', op: 'EQUAL', value: profile.id },
            { field: authField, op: 'ARRAY_CONTAINS', value: uid },
            ...(!isClinical ? [{ field: 'familyAllowed', op: 'EQUAL' as const, value: true }] : []),
          ],
          idToken,
        )
      : Promise.resolve([]),
  ]);

  const now = new Date();
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const activeMeds = medsRaw
    .filter((m) => Boolean(m.active ?? true) && !Boolean(m.discontinued ?? false))
    .map((m) => {
      const medScheds = schedsRaw.filter((s) => String(s.medicationId) === m.id);
      const times = Array.isArray(m.scheduledTimes)
        ? m.scheduledTimes.map(String)
        : medScheds.map((s) => String(s.scheduledTime || '08:00'));
      return {
        name: String(m.name || ''),
        dosage: String(m.dosage || ''),
        scheduledTimes: times.length > 0 ? times : ['08:00'],
        frequency: String(m.frequency || 'once_daily'),
        foodInstruction: String(m.foodInstruction || 'no_restriction'),
        instructions: String(m.instructions || ''),
      };
    });

  const todayTaken = logsRaw.filter(
    (l) =>
      String(l.scheduledDate) === todayDate &&
      (l.status === 'taken' || l.status === 'corrected'),
  ).length;

  const upcomingAppointments = apptsRaw
    .filter((a) => a.status === 'upcoming')
    .map((a) => ({
      title: String(a.title || ''),
      doctor: String(a.doctorName || ''),
      date: String(a.date || ''),
      time: String(a.time || ''),
    }));

  return {
    patientName: profile.fullName,
    callerRole: role,
    adherenceToday: canSeeAdherence
      ? `${todayTaken} confirmed dose(s) today across ${activeMeds.length} active medication(s) (${todayDate})`
      : 'Hidden by patient family privacy settings',
    activeMedications: canSeeMeds
      ? activeMeds
      : 'Hidden by patient family privacy settings',
    upcomingAppointments: canSeeAppointments
      ? upcomingAppointments
      : 'Hidden by patient family privacy settings',
  };
}

export async function generateCompanionChatReply(params: {
  profile: AuthoritativeProfile;
  role: DerivedProfileRole;
  uid: string;
  emailVerified: boolean;
  idToken: string;
  message: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
}): Promise<{ reply: string; model: string }> {
  const ai = getGeminiClient();
  const context = await loadAuthoritativeAiContext({
    profile: params.profile,
    role: params.role,
    uid: params.uid,
    idToken: params.idToken,
  });

  const roleLabel =
    params.role === 'caregiver'
      ? 'Primary Caregiver'
      : params.role === 'family'
        ? 'Family Member'
        : 'Patient Owner';

  const systemInstruction = [
    'You are Pillu, the warm, calm, and clear care companion inside PILLUMINATI.',
    'Tagline: "Because remembering meds shouldn\'t be a family conspiracy."',
    `You are speaking with an authenticated ${roleLabel}.`,
    'You answer general medication-management, schedule coordination, and wellness questions in short, plain-language sentences suitable for elderly users and busy caregivers.',
    'STRICT CLINICAL SAFETY RULES: You must NEVER diagnose conditions, NEVER prescribe treatments, NEVER recommend changing or adjusting a medication dosage, NEVER override a doctor or pharmacist, and NEVER advise taking a double dose or extra tablets for a missed or unconfirmed dose.',
    'Never invent medications not present in the provided care context, and remind users to consult their licensed physician or pharmacist for medical decisions.',
    `Authoritative Firestore Care Context (already scoped to caller permissions):\n${JSON.stringify(context)}`,
  ].join('\n\n');

  const formattedHistory = params.history
    .slice(-8)
    .map((item) => ({
      role: item.role,
      parts: [{ text: item.text }],
    }));

  monitoringMetrics.geminiCalls += 1;
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        ...formattedHistory,
        { role: 'user', parts: [{ text: params.message }] },
      ],
      config: { systemInstruction },
    });

    const reply = response.text?.trim();
    if (!reply) {
      throw new ApiError(502, 'GEMINI_EMPTY_RESPONSE', 'Pillu received an empty response from Gemini.');
    }

    if (params.emailVerified) {
      const userMsgId = generateServerId('msg');
      const aiMsgId = generateServerId('msg');
      await commitFirestoreWrites(
        [
          {
            type: 'create',
            collection: 'aiConversations',
            docId: userMsgId,
            data: {
              id: userMsgId,
              profileId: params.profile.id,
              ownerUid: params.profile.ownerUid,
              userId: params.uid,
              sender: 'user',
              text: params.message.slice(0, 4000),
              createdAt: SERVER_TIMESTAMP,
            },
          },
          {
            type: 'create',
            collection: 'aiConversations',
            docId: aiMsgId,
            data: {
              id: aiMsgId,
              profileId: params.profile.id,
              ownerUid: params.profile.ownerUid,
              userId: params.uid,
              sender: 'pillu',
              text: reply.slice(0, 4000),
              createdAt: SERVER_TIMESTAMP,
            },
          },
        ],
        params.idToken,
      );
    }

    logEvent('info', 'gemini_companion_reply', {
      uid: params.uid,
      meta: { profileId: params.profile.id, model: GEMINI_MODEL },
    });

    return { reply, model: GEMINI_MODEL };
  } catch (err) {
    monitoringMetrics.geminiFailures += 1;
    if (err instanceof ApiError) throw err;
    const msg = err instanceof Error ? err.message : 'Unable to reach Gemini API.';
    logEvent('error', 'gemini_companion_error', {
      uid: params.uid,
      meta: { message: msg },
    });
    throw new ApiError(502, 'GEMINI_API_ERROR', msg);
  }
}

export async function generateCareSummary(params: {
  profile: AuthoritativeProfile;
  role: DerivedProfileRole;
  uid: string;
  idToken: string;
}): Promise<{ summary: string; model: string }> {
  const ai = getGeminiClient();
  const context = await loadAuthoritativeAiContext(params);

  monitoringMetrics.geminiCalls += 1;
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Summarize today's medication adherence, active medications, and upcoming appointments into 3 clear, encouraging bullet points for the family care circle.\n\nAuthoritative Context:\n${JSON.stringify(context)}`,
      config: {
        systemInstruction:
          'You are Pillu, a calm elderly-care assistant. Be concise, warm, accurate to the provided Firestore numbers, and never invent medications or override privacy restrictions.',
      },
    });
    const summary = response.text?.trim();
    if (!summary) {
      throw new ApiError(502, 'GEMINI_EMPTY_RESPONSE', 'Gemini returned an empty summary.');
    }
    return { summary, model: GEMINI_MODEL };
  } catch (err) {
    monitoringMetrics.geminiFailures += 1;
    if (err instanceof ApiError) throw err;
    const msg = err instanceof Error ? err.message : 'Unable to generate summary.';
    throw new ApiError(502, 'GEMINI_API_ERROR', msg);
  }
}

const ALLOWED_FREQS = new Set<MedicationFrequency>([
  'once_daily',
  'twice_daily',
  'three_times_daily',
  'specific_weekdays',
  'custom',
]);

const ALLOWED_FOODS = new Set<FoodInstruction>([
  'before_food',
  'after_food',
  'with_food',
  'no_restriction',
]);

const ALLOWED_UNITS = new Set([
  'mg',
  'mcg',
  'g',
  'mL',
  'tablet',
  'capsule',
  'drops',
  'IU',
  'puff',
  'other',
]);

function isUncertainText(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const clean = value.trim().toLowerCase();
  return (
    !clean ||
    clean === 'uncertain' ||
    clean === 'unknown' ||
    clean === 'n/a' ||
    clean === 'none' ||
    clean === 'illegible' ||
    clean === 'not specified'
  );
}

export function sanitizePrescriptionScanPayload(
  raw: Record<string, unknown>,
): PrescriptionScanDraft {
  const uncertain = new Set<string>(
    Array.isArray(raw.uncertainFields)
      ? raw.uncertainFields.map((x) => String(x).trim()).filter(Boolean)
      : [],
  );

  const medicineName = isUncertainText(raw.medicineName)
    ? ''
    : String(raw.medicineName).trim().slice(0, 120);
  if (!medicineName) uncertain.add('medicineName');

  const dosageAmount = isUncertainText(raw.dosageAmount)
    ? ''
    : String(raw.dosageAmount).trim().slice(0, 30);
  if (!dosageAmount) uncertain.add('dosageAmount');

  const rawUnit = isUncertainText(raw.dosageUnit)
    ? ''
    : String(raw.dosageUnit).trim();
  const matchedUnit = Array.from(ALLOWED_UNITS).find(
    (u) => u.toLowerCase() === rawUnit.toLowerCase(),
  );
  const dosageUnit = matchedUnit || '';
  if (!dosageUnit) uncertain.add('dosageUnit');

  const rawFreq = String(raw.frequency || '').trim();
  const frequency = ALLOWED_FREQS.has(rawFreq as MedicationFrequency)
    ? (rawFreq as MedicationFrequency)
    : '';
  if (!frequency) uncertain.add('frequency');

  const frequencyText = isUncertainText(raw.frequencyText)
    ? ''
    : String(raw.frequencyText).trim().slice(0, 120);

  const suggestedTimes = Array.isArray(raw.suggestedTimes)
    ? Array.from(
        new Set(
          raw.suggestedTimes
            .map((t) => String(t).trim())
            .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)),
        ),
      ).slice(0, 8)
    : [];

  const instructions = isUncertainText(raw.instructions)
    ? ''
    : String(raw.instructions).trim().slice(0, 300);
  if (!instructions) uncertain.add('instructions');

  const rawFood = String(raw.foodInstruction || '').trim();
  const foodInstruction = ALLOWED_FOODS.has(rawFood as FoodInstruction)
    ? (rawFood as FoodInstruction)
    : '';

  const prescriber = isUncertainText(raw.prescriber)
    ? ''
    : String(raw.prescriber).trim().slice(0, 120);

  const extractionNotes =
    typeof raw.extractionNotes === 'string'
      ? raw.extractionNotes.trim().slice(0, 400)
      : '';

  return {
    medicineName,
    dosageAmount,
    dosageUnit,
    frequency,
    frequencyText,
    suggestedTimes,
    instructions,
    foodInstruction,
    prescriber,
    uncertainFields: Array.from(uncertain),
    extractionNotes,
  };
}

export async function scanPrescriptionImage(params: {
  profileId: string;
  uid: string;
  mimeType: string;
  base64Data: string;
}): Promise<{ draft: PrescriptionScanDraft; model: string }> {
  const ai = getGeminiClient();
  monitoringMetrics.geminiCalls += 1;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType,
              data: params.base64Data,
            },
          },
          {
            text: 'Extract the prescription label fields into JSON. Never guess or invent any dosage numbers, units, frequencies, or instructions that are blurred, cut off, or missing. If a field is unclear or absent, return an empty string "" and include that field name in uncertainFields.',
          },
        ],
      },
      config: {
        systemInstruction:
          'You are a careful prescription-label reader assisting caregivers. Read only what is visibly printed on the image. NEVER invent or extrapolate missing dosage values, units, frequencies, or clinical directions. Flag any unclear or missing fields in uncertainFields for manual caregiver verification.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            medicineName: {
              type: Type.STRING,
              description: 'Printed medication name, or empty string if unclear.',
            },
            dosageAmount: {
              type: Type.STRING,
              description:
                'Printed numeric strength/amount (e.g., "10", "500"), or empty string if missing or blurry. Never invent.',
            },
            dosageUnit: {
              type: Type.STRING,
              description:
                'One of: mg, mcg, g, mL, tablet, capsule, drops, IU, puff, other, or empty string if uncertain.',
            },
            frequency: {
              type: Type.STRING,
              description:
                'One of: once_daily, twice_daily, three_times_daily, specific_weekdays, custom, or empty string if unclear.',
            },
            frequencyText: {
              type: Type.STRING,
              description: 'Exact frequency phrase printed on the label, if visible.',
            },
            suggestedTimes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                'Only include HH:mm 24h times if explicitly indicated on label; otherwise empty array.',
            },
            instructions: {
              type: Type.STRING,
              description: 'Administration directions from the label, or empty string if unreadable.',
            },
            foodInstruction: {
              type: Type.STRING,
              description:
                'One of: before_food, after_food, with_food, no_restriction, or empty string if not stated.',
            },
            prescriber: {
              type: Type.STRING,
              description: 'Prescribing clinician name if visible, else empty string.',
            },
            uncertainFields: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                'Field keys among medicineName, dosageAmount, dosageUnit, frequency, instructions that are missing, cut off, or hard to read.',
            },
            extractionNotes: {
              type: Type.STRING,
              description:
                'Brief note highlighting any blurry or missing label details requiring manual caregiver review.',
            },
          },
          required: [
            'medicineName',
            'dosageAmount',
            'dosageUnit',
            'frequency',
            'instructions',
            'uncertainFields',
          ],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      throw new ApiError(
        502,
        'GEMINI_EMPTY_RESPONSE',
        'Gemini Vision returned an empty response for this prescription image.',
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new ApiError(
        502,
        'GEMINI_INVALID_JSON',
        'Prescription scanner received an unreadable response format. Enter the prescription manually.',
      );
    }

    const draft = sanitizePrescriptionScanPayload(parsed);
    logEvent('info', 'gemini_prescription_scanned', {
      uid: params.uid,
      meta: {
        profileId: params.profileId,
        model: GEMINI_MODEL,
        uncertainCount: draft.uncertainFields.length,
      },
    });

    return { draft, model: GEMINI_MODEL };
  } catch (err) {
    monitoringMetrics.geminiFailures += 1;
    if (err instanceof ApiError) throw err;
    const msg =
      err instanceof Error
        ? err.message
        : 'Unable to scan prescription image with Gemini Vision.';
    logEvent('error', 'gemini_prescription_scan_error', {
      uid: params.uid,
      meta: { message: msg },
    });
    throw new ApiError(502, 'GEMINI_API_ERROR', msg);
  }
}

