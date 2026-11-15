import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type { UserRole } from '../types/pilluminati';

export function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled on this Firebase project yet. Use Continue with Google above for instant access.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in or resetting your password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 8 characters).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password did not match our records.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait a few minutes before trying again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before finishing.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
    default:
      return message || 'Authentication could not be completed.';
  }
}

export async function ensureUserDocuments(
  user: FirebaseUser,
  preferredRole: UserRole = 'patient',
  explicitName?: string,
): Promise<void> {
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const displayName = (
        explicitName ||
        user.displayName ||
        user.email?.split('@')[0] ||
        'Care Circle Member'
      )
        .trim()
        .slice(0, 120);

      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        accountRole: preferredRole,
        textScale: 'standard',
        highContrast: false,
        reducedMotion: false,
        reminderLeadMinutes: 15,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  try {
    const privSnap = await getDoc(privateRef);
    if (!privSnap.exists()) {
      await setDoc(privateRef, {
        uid: user.uid,
        email: (user.email || '').slice(0, 254),
        phone: '',
        address: '',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

export async function registerWithEmail(params: {
  email: string;
  password: string;
  displayName: string;
  accountRole: UserRole;
}): Promise<FirebaseUser> {
  const cred = await createUserWithEmailAndPassword(
    auth,
    params.email.trim(),
    params.password,
  );
  await updateProfile(cred.user, {
    displayName: params.displayName.trim().slice(0, 120),
  });
  await ensureUserDocuments(cred.user, params.accountRole, params.displayName);
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function loginWithEmail(
  email: string,
  password: string,
): Promise<FirebaseUser> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await ensureUserDocuments(cred.user, 'patient');
  return cred.user;
}

export async function loginWithGoogle(
  preferredRole: UserRole = 'patient',
): Promise<FirebaseUser> {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureUserDocuments(cred.user, preferredRole);
  return cred.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function resendVerificationEmail(): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('No signed-in user.');
  }
  await sendEmailVerification(auth.currentUser);
}

export async function refreshCurrentUser(): Promise<FirebaseUser | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}
