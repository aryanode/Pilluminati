import type { Request } from 'express';
import { serverConfig } from './config.ts';

export interface VerifiedClientCaller {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  idToken: string;
}

export async function verifyIdTokenString(
  idToken: string,
): Promise<VerifiedClientCaller> {
  if (!idToken) {
    throw new Error('MISSING_AUTH_TOKEN');
  }
  if (!serverConfig.firebaseApiKey) {
    throw new Error('FIREBASE_API_KEY_MISSING');
  }

  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(serverConfig.firebaseApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );

  if (!resp.ok) {
    throw new Error('INVALID_AUTH_TOKEN');
  }

  const data = (await resp.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
      emailVerified?: boolean;
      displayName?: string;
      disabled?: boolean;
    }>;
  };

  const user = data.users?.[0];
  if (!user || !user.localId || user.disabled) {
    throw new Error('INVALID_AUTH_TOKEN');
  }

  return {
    uid: user.localId,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    name: user.displayName,
    idToken,
  };
}

export async function verifyFirebaseClientToken(
  req: Request,
): Promise<VerifiedClientCaller> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('MISSING_AUTH_TOKEN');
  }
  const idToken = authHeader.slice('Bearer '.length).trim();
  return verifyIdTokenString(idToken);
}
