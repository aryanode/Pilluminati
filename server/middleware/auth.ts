import type { NextFunction, Request, Response } from 'express';
import {
  verifyFirebaseClientToken,
  type VerifiedClientCaller,
} from '../verifyClientToken.ts';
import { ApiError } from './errorHandler.ts';
import {
  authorizeProfileAccess,
  type AuthoritativeProfile,
  type DerivedProfileRole,
} from '../services/authzService.ts';

export interface AuthenticatedRequest extends Request {
  caller?: VerifiedClientCaller;
  authorizedProfile?: AuthoritativeProfile;
  derivedRole?: DerivedProfileRole;
  requestId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    req.caller = await verifyFirebaseClientToken(req);
    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AUTH_REQUIRED';
    next(
      new ApiError(
        401,
        'AUTH_REQUIRED',
        msg === 'MISSING_AUTH_TOKEN'
          ? 'Authentication required. Please sign in.'
          : 'Invalid or expired Firebase ID token. Please sign in again.',
      ),
    );
  }
}

export function requireVerifiedEmail(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.caller) {
    next(new ApiError(401, 'AUTH_REQUIRED', 'Authentication required.'));
    return;
  }
  if (!req.caller.emailVerified) {
    next(
      new ApiError(
        403,
        'EMAIL_VERIFICATION_REQUIRED',
        'Verify your email address before modifying medical records.',
      ),
    );
    return;
  }
  next();
}

export function requireProfileRole(
  minLevel: 'member' | 'clinical' | 'owner',
  profileIdSource: (req: AuthenticatedRequest) => unknown,
) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.caller) {
        throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication required.');
      }
      const rawProfileId = profileIdSource(req);
      if (typeof rawProfileId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(rawProfileId.trim())) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Valid profileId is required.');
      }
      const { profile, role } = await authorizeProfileAccess({
        profileId: rawProfileId.trim(),
        uid: req.caller.uid,
        idToken: req.caller.idToken,
        minLevel,
      });
      req.authorizedProfile = profile;
      req.derivedRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
