import { Lock, ShieldCheck } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Card, Select, Switch } from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';
import type { UserSettings } from '../types/pilluminati';

export function SettingsPage() {
  const { settings, updateSettings } = useCare();

  return (
    <AppShell
      title="Settings & Security"
      subtitle="Tune text legibility, reminder timing, and review Firestore access protections."
      allowWithoutProfile
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card tone="white" className="lg:col-span-7 p-6 sm:p-7 space-y-6">
          <div>
            <h2 className="font-display text-xl font-bold text-[#10373A]">
              Elderly Accessibility Preferences
            </h2>
            <p className="mt-1 text-sm text-[#4B7478]">
              Saved directly to your Firebase user settings document.
            </p>
          </div>

          <div className="space-y-4">
            <Select
              label="Interface Text Size"
              value={settings.textScale}
              onChange={(e) =>
                updateSettings({
                  textScale: e.target.value as UserSettings['textScale'],
                })
              }
              options={[
                { value: 'standard', label: 'Standard (16px base)' },
                { value: 'large', label: 'Large (18px base)' },
                { value: 'xl', label: 'Extra Large (20px base)' },
              ]}
            />

            <Switch
              label="High Contrast Borders & Text"
              description="Deepens foreground typography and crisp borders for visual clarity."
              checked={settings.highContrast}
              onChange={(val) => updateSettings({ highContrast: val })}
            />

            <Switch
              label="Reduced Motion"
              description="Disables gentle floating animations on Pillu and card transitions."
              checked={settings.reducedMotion}
              onChange={(val) => updateSettings({ reducedMotion: val })}
            />
          </div>

          <div className="border-t border-[#EBF0EE] pt-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-[#10373A]">
              Reminder Lead Time
            </h3>
            <Select
              label="Gentle Reminder Lead Time"
              value={String(settings.reminderLeadMinutes)}
              onChange={(e) =>
                updateSettings({
                  reminderLeadMinutes: Number(
                    e.target.value,
                  ) as UserSettings['reminderLeadMinutes'],
                })
              }
              options={[
                { value: '15', label: '15 minutes before dose' },
                { value: '30', label: '30 minutes before dose' },
                { value: '60', label: '60 minutes before dose' },
              ]}
            />
          </div>
        </Card>

        <Card tone="mint" className="lg:col-span-5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#1A7A68]" />
              <h2 className="font-display text-lg font-bold text-[#10373A]">
                Account & Firestore Security
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#116B4B] shrink-0">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#16A34A]" />
              Active
            </span>
          </div>

          <div className="rounded-xl bg-white border border-[#CBE4D8] p-4 space-y-2.5">
            <p className="text-sm font-semibold text-[#10373A]">
              Enforced by Firebase Auth & Firestore Rules
            </p>
            <p className="text-sm leading-relaxed text-[#2C5E63]">
              Every care profile, medication change, and emergency passport
              token is verified against your signed-in Firebase account and
              enforced directly by Firestore Security Rules—with zero client-side
              security bypasses.
            </p>
            <div className="flex items-start gap-2 pt-1 text-xs text-[#4B7478]">
              <ShieldCheck className="h-4 w-4 text-[#1A7A68] shrink-0 mt-0.5" />
              <span>
                Email-verified invitations, role-scoped visibility toggles, and
                server-verified API tokens protect shared Care Circle access.
              </span>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
