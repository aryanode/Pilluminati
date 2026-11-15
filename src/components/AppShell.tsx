import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  FileHeart,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircleHeart,
  Pill,
  Settings,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import {
  EmailVerificationBanner,
  ProfileOnboardingCard,
} from './ProfileGateCard';
import { ErrorBanner, Skeleton } from './ui/Primitives';
import { useCare } from '../context/CareContext';
import type { UserRole } from '../types/pilluminati';
import { cn } from '../utils/cn';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/medications', label: 'Medications', icon: Pill },
  { to: '/history', label: 'Adherence History', icon: History },
  { to: '/appointments', label: 'Appointments', icon: Calendar },
  { to: '/caregivers', label: 'Care Relay & Team', icon: Users },
  { to: '/passport', label: 'Health Passport', icon: FileHeart },
  { to: '/companion', label: 'Pillu Companion', icon: MessageCircleHeart },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: UserCircle2 },
];

const ROLE_LABELS: Record<UserRole, string> = {
  patient: 'Patient Owner',
  caregiver: 'Primary Caregiver',
  family: 'Family Member',
};

export function AppShell({
  title,
  subtitle,
  primaryAction,
  allowWithoutProfile = false,
  children,
}: {
  title: string;
  subtitle?: string;
  primaryAction?: React.ReactNode;
  allowWithoutProfile?: boolean;
  children: React.ReactNode;
}) {
  const {
    activeRole,
    activeProfile,
    authorizedProfiles,
    activePatientProfile,
    selectActiveProfile,
    dataLoading,
    dataError,
    clearDataError,
    signOutUser,
  } = useCare();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const handleSignOut = async () => {
    await signOutUser();
    navigate('/auth');
  };

  const gateOnboarding = !allowWithoutProfile && !dataLoading && !activePatientProfile;

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-[#F7FAF8] border-r border-[#DCE5E2] p-4">
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2 pt-1">
          <Link
            to="/"
            className="font-display text-lg font-extrabold tracking-tight text-[#10373A] whitespace-nowrap"
          >
            PILLUMINATI
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#4B7478] hover:bg-[#E2F1EA] transition-colors cursor-pointer"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Authorized Patient Profile Context (RBAC-derived, never self-escalating) */}
        <div className="rounded-xl border border-[#DCE5E2] bg-white p-3 space-y-1.5">
          <p className="text-xs font-semibold text-[#4B7478]">
            {ROLE_LABELS[activeRole]}
          </p>
          {authorizedProfiles.length > 1 ? (
            <select
              aria-label="Select authorized patient profile"
              value={activePatientProfile?.id || ''}
              onChange={(e) => selectActiveProfile(e.target.value)}
              className="w-full rounded-lg border border-[#C9D8D4] bg-[#FAF9F6] px-2.5 py-2 text-sm font-semibold text-[#10373A]"
            >
              {authorizedProfiles.map((prof) => (
                <option key={prof.id} value={prof.id}>
                  {prof.fullName}
                </option>
              ))}
            </select>
          ) : (
            <p className="font-display text-sm font-bold text-[#10373A] truncate">
              {activePatientProfile?.fullName || 'No Profile Linked'}
            </p>
          )}
        </div>

        <nav aria-label="Main workspace navigation" className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-[#E2F1EA] text-[#10373A] font-semibold'
                    : 'text-[#2C5E63] hover:bg-[#EBF6F1] hover:text-[#10373A]',
                )}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-6 border-t border-[#DCE5E2] pt-4 space-y-3">
        <Link
          to="/profile"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-xl p-2 hover:bg-[#EBF6F1] transition-colors"
        >
          {!avatarFailed && activeProfile.avatarUrl ? (
            <img
              src={activeProfile.avatarUrl}
              alt={activeProfile.displayName}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="h-10 w-10 rounded-full object-cover border border-[#C6E3D5] shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-[#E2F1EA] flex items-center justify-center text-sm font-bold text-[#10373A] shrink-0">
              {activeProfile.displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#10373A]">
              {activeProfile.displayName}
            </p>
            <p className="truncate text-xs text-[#4B7478]">
              {ROLE_LABELS[activeRole]}
            </p>
          </div>
        </Link>

        <button
          type="button"
          onClick={handleSignOut}
          className="flex min-h-[42px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[#4B7478] hover:bg-[#EBF6F1] hover:text-[#10373A] transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#10373A] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#0C2B2E]/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[280px] max-w-[85vw] h-full">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print sticky top-0 z-30 border-b border-[#DCE5E2] bg-[#FAF9F6]/95 backdrop-blur-sm px-4 sm:px-8 py-3.5">
          <div className="mx-auto flex max-w-6xl flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
                className="lg:hidden min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center rounded-xl border border-[#DCE5E2] bg-white text-[#10373A] hover:bg-[#F1F8F5] transition-colors cursor-pointer"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#4B7478] truncate">
                  {activePatientProfile
                    ? `${activePatientProfile.fullName} · ${ROLE_LABELS[activeRole]}`
                    : `PILLUMINATI · ${ROLE_LABELS[activeRole]}`}
                </p>
                <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#10373A] truncate">
                  {title}
                </h1>
              </div>
            </div>

            {primaryAction && !gateOnboarding && (
              <div key={activeRole} className="flex flex-wrap items-center gap-2 shrink-0">
                {primaryAction}
              </div>
            )}
          </div>
          {subtitle && (
            <p className="mx-auto mt-1.5 max-w-6xl text-sm text-[#4B7478] hidden sm:block leading-relaxed">
              {subtitle}
            </p>
          )}
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8">
          <div className="mx-auto max-w-6xl">
            <EmailVerificationBanner />

            {dataError && (
              <div className="mb-6">
                <ErrorBanner
                  title="Cloud Sync Error"
                  message={dataError}
                  onDismiss={clearDataError}
                />
              </div>
            )}

            {dataLoading && !activePatientProfile && !allowWithoutProfile ? (
              <div className="space-y-6">
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-52 w-full" />
              </div>
            ) : gateOnboarding ? (
              <ProfileOnboardingCard />
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
