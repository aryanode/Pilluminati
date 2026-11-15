import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
}

function loadFirebaseConfig(): FirebaseClientConfig {
  const configPath = path.resolve(__dirname, '..', 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as FirebaseClientConfig;
}

export const firebaseConfig = loadFirebaseConfig();

export function resolveFirebaseApiKey(
  envApiKey: string | undefined,
  fallbackApiKey: string,
): string {
  const trimmed = envApiKey?.trim();
  if (trimmed && trimmed !== 'MY_FIREBASE_API_KEY') {
    return trimmed;
  }
  return fallbackApiKey;
}

export function resolveOptionalSecret(
  envVal: string | undefined,
  placeholder: string,
): string | null {
  const trimmed = envVal?.trim();
  if (trimmed && trimmed !== placeholder) {
    return trimmed;
  }
  return null;
}

const parsedPort = Number.parseInt(String(process.env.PORT ?? ''), 10);

export const serverConfig = {
  port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000,
  isProduction: process.env.NODE_ENV === 'production',
  firebaseApiKey: resolveFirebaseApiKey(
    process.env.FIREBASE_API_KEY,
    firebaseConfig.apiKey,
  ),
  geminiApiKey: resolveOptionalSecret(
    process.env.GEMINI_API_KEY,
    'MY_GEMINI_API_KEY',
  ),
  resendApiKey: resolveOptionalSecret(
    process.env.RESEND_API_KEY,
    'MY_RESEND_API_KEY',
  ),
  resendFromEmail:
    process.env.RESEND_FROM_EMAIL?.trim() ||
    'PILLUMINATI <onboarding@resend.dev>',
  schedulerIntervalMs: 60_000,
};
