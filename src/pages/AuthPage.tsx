import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, Mail, Shield } from 'lucide-react';
import { PilluMascot } from '../components/PilluMascot';
import { Button, Card, ErrorBanner, Input, Select } from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';
import type { UserRole } from '../types/pilluminati';
import { cn } from '../utils/cn';
import { validateAuthCredentials } from '../utils/rbac';

type AuthMode = 'login' | 'register' | 'reset';

export function AuthPage() {
  const {
    firebaseUser,
    signInWithGoogle,
    signInWithEmailPassword,
    registerWithEmailPassword,
    requestPasswordReset,
    signOutUser,
    authError,
    clearAuthError,
  } = useCare();

  const navigate = useNavigate();
  const location = useLocation();
  const redirectTarget =
    (location.state as { from?: string } | null)?.from || '/dashboard';

  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountRole, setAccountRole] = useState<UserRole>('patient');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setFieldErrors({});
    setNotice(null);
    clearAuthError();
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      await signInWithGoogle(accountRole);
      navigate(redirectTarget, { replace: true });
    } catch {
      // authError surfaced by CareContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    clearAuthError();

    const errs = validateAuthCredentials({
      mode,
      email,
      password,
      displayName,
    });
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await signInWithEmailPassword(email, password);
        navigate(redirectTarget, { replace: true });
      } else if (mode === 'register') {
        await registerWithEmailPassword({
          email,
          password,
          displayName,
          accountRole,
        });
        setNotice(
          `Account created! We sent a verification email to ${email.trim()}. Opening your workspace now.`,
        );
        navigate(redirectTarget, { replace: true });
      } else {
        await requestPasswordReset(email);
        setNotice(
          `Password reset link sent to ${email.trim()}. Check your inbox to choose a new password.`,
        );
      }
    } catch {
      // authError surfaced by CareContext
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#10373A] flex flex-col">
      <header className="border-b border-[#DCE5E2] bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            to="/"
            className="font-display text-xl font-extrabold tracking-tight text-[#10373A]"
          >
            PILLUMINATI
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#2C5E63] hover:text-[#10373A]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Overview
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-10 sm:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-6">
            <div>
              <p className="text-sm font-semibold text-[#5D4A96]">
                Protected Care Circle Access
              </p>
              <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#10373A]">
                Sign in or register for PILLUMINATI
              </h1>
              <p className="mt-3 text-base leading-relaxed text-[#2C5E63]">
                Access your shared health profile with persistent Firebase
                sessions, verified role permissions, and strict Firestore
                Security Rules.
              </p>
            </div>

            <Card tone="mint" className="p-5">
              <PilluMascot
                state="happy"
                size="sm"
                message="Your care circle data stays private—only invited caregivers and family members can view shared health records."
              />
            </Card>
          </div>

          <div className="lg:col-span-7 space-y-6">
            {authError && (
              <ErrorBanner
                title="Authentication notice"
                message={authError}
                onDismiss={clearAuthError}
              />
            )}

            {notice && (
              <Card tone="mint" className="p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#1A7A68] shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-[#10373A]">{notice}</p>
              </Card>
            )}

            <Card tone="white" className="p-6 sm:p-8 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#10373A]">
                    {firebaseUser
                      ? 'Active Care Circle Session'
                      : mode === 'login'
                        ? 'Sign In to Your Account'
                        : mode === 'register'
                          ? 'Create a Care Circle Account'
                          : 'Reset Your Password'}
                  </h2>
                  <p className="mt-1 text-sm text-[#4B7478]">
                    Secured with Firebase Authentication and Cloud Firestore rules.
                  </p>
                </div>
                <Shield className="h-6 w-6 text-[#1A7A68] shrink-0" />
              </div>

              {firebaseUser ? (
                <div className="rounded-xl border border-[#C6E3D5] bg-[#F1F8F5] p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#1A7A68]" />
                    <div>
                      <p className="text-sm font-semibold text-[#10373A]">
                        Signed in as {firebaseUser.displayName || firebaseUser.email}
                      </p>
                      <p className="text-xs text-[#4B7478]">
                        {firebaseUser.email} ·{' '}
                        {firebaseUser.emailVerified
                          ? 'Email verified'
                          : 'Email verification pending'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => navigate(redirectTarget)}>
                      Open Dashboard
                    </Button>
                    <Button variant="secondary" onClick={signOutUser}>
                      Sign Out
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Instant Google Sign-In (Works immediately without extra console setup) */}
                  <div className="rounded-xl border border-[#CBE4D8] bg-[#F1F8F5] p-4 space-y-3">
                    <Select
                      label="Signing in as (for new accounts)"
                      value={accountRole}
                      onChange={(e) => setAccountRole(e.target.value as UserRole)}
                      options={[
                        {
                          value: 'patient',
                          label: 'Patient (Own health profile)',
                        },
                        {
                          value: 'caregiver',
                          label: 'Primary Caregiver (Via invite)',
                        },
                        {
                          value: 'family',
                          label: 'Family Member (Shared view)',
                        },
                      ]}
                    />
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full"
                      onClick={handleGoogleSignIn}
                      disabled={submitting}
                    >
                      {submitting ? 'Connecting Google Account...' : 'Continue with Google'}
                    </Button>
                  </div>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-[#E2ECE8]" />
                    </div>
                    <div className="relative flex justify-center text-xs font-semibold uppercase tracking-wider">
                      <span className="bg-white px-3 text-[#4B7478]">
                        Or use email & password
                      </span>
                    </div>
                  </div>

                  {/* Mode Switcher */}
                  <div
                    className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 rounded-xl bg-[#EBF6F1] p-1.5"
                    role="tablist"
                    aria-label="Authentication mode"
                  >
                    {(
                      [
                        { id: 'login', label: 'Sign In' },
                        { id: 'register', label: 'Create Account' },
                        { id: 'reset', label: 'Reset Password' },
                      ] as { id: AuthMode; label: string }[]
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={mode === tab.id}
                        onClick={() => switchMode(tab.id)}
                        className={cn(
                          'min-h-[44px] rounded-lg px-3 py-2 text-sm font-semibold transition-colors cursor-pointer text-center',
                          mode === tab.id
                            ? 'bg-white text-[#10373A] shadow-sm'
                            : 'text-[#2C5E63] hover:text-[#10373A]',
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    {mode === 'register' && (
                      <Input
                        label="Full Name"
                        placeholder="e.g., Eleanor Vance"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        error={fieldErrors.displayName}
                        autoComplete="name"
                      />
                    )}

                    <Input
                      label="Email Address"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      error={fieldErrors.email}
                      autoComplete="email"
                    />

                    {mode !== 'reset' && (
                      <Input
                        label="Password"
                        type="password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        error={fieldErrors.password}
                        autoComplete={
                          mode === 'register' ? 'new-password' : 'current-password'
                        }
                      />
                    )}

                    <Button
                      type="submit"
                      variant="secondary"
                      size="lg"
                      className="w-full"
                      disabled={submitting}
                    >
                      {mode === 'login' ? (
                        <>
                          <KeyRound className="h-4.5 w-4.5" />
                          {submitting ? 'Signing In...' : 'Sign In with Email'}
                        </>
                      ) : mode === 'register' ? (
                        <>
                          <Mail className="h-4.5 w-4.5" />
                          {submitting
                            ? 'Creating Account...'
                            : 'Create Account & Verify Email'}
                        </>
                      ) : (
                        <>
                          <Mail className="h-4.5 w-4.5" />
                          {submitting ? 'Sending Link...' : 'Send Password Reset Email'}
                        </>
                      )}
                    </Button>
                  </form>
                </>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
