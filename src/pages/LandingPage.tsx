import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck, FileHeart, HeartHandshake, ShieldCheck } from 'lucide-react';
import { PilluMascot } from '../components/PilluMascot';
import { Button, Card } from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';
import { HERO_IMAGE_PATH } from '../data/seedData';
import type { PilluMoodState } from '../types/pilluminati';

export function LandingPage() {
  const { firebaseUser } = useCare();
  const navigate = useNavigate();
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [pilluState, setPilluState] = useState<PilluMoodState>('idle');

  const destination = firebaseUser ? '/dashboard' : '/auth';

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#10373A]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-[#DCE5E2] bg-[#FAF9F6]/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <Link
            to="/"
            className="font-display text-xl font-extrabold tracking-tight text-[#10373A] whitespace-nowrap shrink-0"
          >
            PILLUMINATI
          </Link>

          <nav
            aria-label="Primary site navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#2C5E63]"
          >
            <a
              href="#capabilities"
              className="hover:text-[#10373A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#roles"
              className="hover:text-[#10373A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Care Roles
            </a>
            <a
              href="#pillu-preview"
              className="hover:text-[#10373A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Pillu Companion
            </a>
            <Link
              to={destination}
              className="hover:text-[#10373A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {firebaseUser ? 'Dashboard' : 'Sign In'}
            </Link>
          </nav>

          <div className="shrink-0">
            <Button onClick={() => navigate(destination)} size="sm">
              {firebaseUser ? 'Open Dashboard' : 'Enter Care Circle'}
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Split Section */}
        <section className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-sm font-semibold tracking-wide text-[#5D4A96]">
                Elderly Care & Medication Coordination
              </p>
              <h1
                className="font-display mt-3 text-[clamp(2.25rem,4vw,3.5rem)] font-bold leading-[1.12] tracking-tight text-[#10373A]"
                style={{ textWrap: 'balance' }}
              >
                Because remembering meds shouldn’t be a family conspiracy.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#2C5E63]">
                PILLUMINATI brings elderly patients, primary caregivers, and
                family members onto one calm schedule—combining one-tap dose
                confirmation, Care Relay shift handoffs, and an Emergency Health
                Passport.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button size="lg" onClick={() => navigate(destination)}>
                  {firebaseUser ? 'Go to Care Workspace' : 'Get Started Safely'}
                  <ArrowRight className="h-4.5 w-4.5" />
                </Button>
                <Link
                  to="/auth"
                  className="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-[#C6E3D5] bg-[#EBF6F1] px-6 py-3 text-base font-semibold text-[#10373A] hover:bg-[#D8EDE3] transition-colors whitespace-nowrap"
                >
                  {firebaseUser ? 'Account Settings' : 'Sign In or Register'}
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#4B7478]">
                <span>One-tap adherence</span>
                <span aria-hidden="true">·</span>
                <span>Verified role access</span>
                <span aria-hidden="true">·</span>
                <span>Emergency Health Passport</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[320px] overflow-hidden rounded-2xl border border-[#DCE5E2] bg-[#EBF6F1]">
                {!heroImgFailed ? (
                  <img
                    src={HERO_IMAGE_PATH}
                    alt="Elderly mother and adult daughter smiling together over morning tea at a sunlit oak table"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-10 text-center">
                    <HeartHandshake className="h-12 w-12 text-[#1A7A68]" />
                    <p className="mt-3 font-display text-lg font-semibold text-[#10373A]">
                      Coordinated Care Circle
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Role-Aware Strip */}
        <section id="roles" className="border-y border-[#E2ECE8] bg-[#F1F8F5]/60 py-14">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#10373A]">
                One shared care plan, tailored to every seat at the table
              </h2>
              <p className="mt-2 text-base text-[#2C5E63]">
                Protected by Firebase Authentication, Cloud Firestore rules, and
                invitation-only profile sharing.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card tone="white" className="p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#1A7A68]">
                    01. For Elderly Patients
                  </p>
                  <h3 className="mt-2 font-display text-xl font-bold text-[#10373A]">
                    Calm, One-Tap Clarity
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-[#2C5E63]">
                    Own your health profile, confirm daily medications with one
                    tap, and invite verified caregivers or family members.
                  </p>
                </div>
                <div className="mt-6">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => navigate(destination)}
                  >
                    {firebaseUser ? 'Open Patient View' : 'Create Patient Profile'}
                  </Button>
                </div>
              </Card>

              <Card tone="white" className="p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#5D4A96]">
                    02. For Primary Caregivers
                  </p>
                  <h3 className="mt-2 font-display text-xl font-bold text-[#10373A]">
                    Care Relay & Oversight
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-[#2C5E63]">
                    Connect via verified invitation to track unconfirmed doses,
                    resolve clinical alerts, and pass structured shift handoffs.
                  </p>
                </div>
                <div className="mt-6">
                  <Button
                    variant="lavender"
                    className="w-full"
                    onClick={() => navigate(destination)}
                  >
                    {firebaseUser ? 'Open Caregiver View' : 'Join as Caregiver'}
                  </Button>
                </div>
              </Card>

              <Card tone="white" className="p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#10373A]">
                    03. For Family Members
                  </p>
                  <h3 className="mt-2 font-display text-xl font-bold text-[#10373A]">
                    Respectful Peace of Mind
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-[#2C5E63]">
                    Follow care updates, upcoming appointments, and adherence
                    milestones scoped strictly by patient privacy permissions.
                  </p>
                </div>
                <div className="mt-6">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => navigate(destination)}
                  >
                    {firebaseUser ? 'Open Family View' : 'Connect as Family'}
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Core Capabilities Asymmetric Bento */}
        <section id="capabilities" className="mx-auto max-w-7xl px-6 py-16">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#10373A]">
            Security & Coordination Built for Daily Trust
          </h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-12 gap-6">
            <Card tone="mint" className="md:col-span-7 p-7">
              <CalendarCheck className="h-6 w-6 text-[#1A7A68]" />
              <h3 className="mt-4 font-display text-xl font-bold text-[#10373A]">
                01. Daily Adherence & 7-Day Audit Trail
              </h3>
              <p className="mt-2 text-base leading-relaxed text-[#2C5E63]">
                Every morning, midday, evening, and bedtime dose is logged in
                Firestore with exact timestamps and confirming team member.
              </p>
            </Card>

            <Card tone="lavender" className="md:col-span-5 p-7">
              <FileHeart className="h-6 w-6 text-[#5D4A96]" />
              <h3 className="mt-4 font-display text-xl font-bold text-[#10373A]">
                02. Token-Gated Emergency Passport
              </h3>
              <p className="mt-2 text-base leading-relaxed text-[#2C5E63]">
                Allergies, active prescriptions, blood type, physician phone,
                and revocable time-limited emergency links for first responders.
              </p>
            </Card>

            <Card tone="white" className="md:col-span-5 p-7">
              <ShieldCheck className="h-6 w-6 text-[#10373A]" />
              <h3 className="mt-4 font-display text-xl font-bold text-[#10373A]">
                03. Permission-Scoped Visibility & Auth
              </h3>
              <p className="mt-2 text-base leading-relaxed text-[#2C5E63]">
                Patients control family visibility toggles, email-verified
                Care Circle invitations, and strict Firestore Security Rules.
              </p>
            </Card>

            <Card id="pillu-preview" tone="white" className="md:col-span-7 p-7">
              <PilluMascot
                state={pilluState}
                size="md"
                showStateControls
                onStateChange={setPilluState}
              />
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#DCE5E2] bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-6 text-sm text-[#4B7478]">
          <p className="font-display font-bold text-[#10373A]">
            PILLUMINATI
          </p>
          <p>
            Because remembering meds shouldn’t be a family conspiracy.
          </p>
          <div className="flex items-center gap-6">
            <Link to="/auth" className="hover:text-[#10373A]">
              Sign In
            </Link>
            <Link to="/passport" className="hover:text-[#10373A]">
              Health Passport
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
