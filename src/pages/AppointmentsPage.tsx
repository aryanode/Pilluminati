import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Edit3,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  Trash2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Textarea,
} from '../components/ui/Primitives';
import { useCare } from '../context/CareContext';
import type { Appointment } from '../types/pilluminati';
import { formatTime12Hour, validateAppointmentInput } from '../utils/adherence';
import { deriveAppointmentTitle } from '../utils/careRelay';

export function AppointmentsPage() {
  const {
    appointments,
    addAppointment,
    updateAppointment,
    updateAppointmentStatus,
    deleteAppointment,
    activeRole,
    isProfileOwner,
    familyPermissions,
    activePatientProfile,
    activeProfile,
    emailVerified,
  } = useCare();

  const [formOpen, setFormOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [deletingAppt, setDeletingAppt] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [assignedCaregiver, setAssignedCaregiver] = useState(activeProfile.displayName);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isRestrictedFamily =
    activeRole === 'family' && !familyPermissions.showAppointments;
  const canEdit = activeRole !== 'family';

  const upcoming = appointments.filter((a) => a.status === 'upcoming');
  const past = appointments.filter((a) => a.status !== 'upcoming');

  const resetForm = () => {
    setEditingAppt(null);
    setTitle('');
    setDoctorName('');
    setSpecialty('');
    setDate('');
    setTime('10:00');
    setLocation('');
    setAssignedCaregiver(activeProfile.displayName);
    setNotes('');
    setErrors({});
  };

  const openCreateModal = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditModal = (appt: Appointment) => {
    setEditingAppt(appt);
    setTitle(appt.title);
    setDoctorName(appt.doctorName);
    setSpecialty(appt.specialty);
    setDate(appt.date);
    setTime(appt.time);
    setLocation(appt.location);
    setAssignedCaregiver(appt.assignedCaregiver || activeProfile.displayName);
    setNotes(appt.notes);
    setErrors({});
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveTitle = deriveAppointmentTitle({
      title,
      specialty,
      doctorName,
    });
    const errs = validateAppointmentInput({
      title: effectiveTitle,
      doctorName,
      date,
      time,
      location,
    });
    if (!specialty.trim()) {
      errs.specialty = 'Specialty is required (e.g., Cardiology, Primary Care).';
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: effectiveTitle,
        doctorName: doctorName.trim(),
        specialty: specialty.trim(),
        date,
        time,
        location: location.trim() || 'Primary Clinic',
        assignedCaregiver: assignedCaregiver.trim() || activeProfile.displayName,
        notes: notes.trim(),
      };

      if (editingAppt) {
        await updateAppointment(editingAppt.id, payload);
      } else {
        await addAppointment({
          ...payload,
          status: 'upcoming',
        });
      }

      resetForm();
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAppt) return;
    setDeleting(true);
    try {
      await deleteAppointment(deletingAppt.id);
      setDeletingAppt(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title="Appointment Management"
      subtitle="Create, update, and track doctor visits, specialties, and visit notes."
      primaryAction={
        canEdit ? (
          <Button
            size="sm"
            disabled={!emailVerified}
            onClick={openCreateModal}
          >
            <Plus className="h-4 w-4" />
            Schedule Visit
          </Button>
        ) : undefined
      }
    >
      {isRestrictedFamily ? (
        <Card tone="lavender" className="p-8 flex items-start gap-4">
          <Lock className="h-6 w-6 text-[#5D4A96] shrink-0" />
          <div>
            <h2 className="font-display text-xl font-bold text-[#10373A]">
              Appointments Are Private
            </h2>
            <p className="mt-2 text-base text-[#2C5E63]">
              Current visibility settings restrict appointment details from the
              Family view.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="font-display text-xl font-bold text-[#10373A]">
              Upcoming Visits ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<Calendar className="h-6 w-6" />}
                title="No upcoming appointments"
                description={`Schedule ${activePatientProfile?.fullName || 'the patient'}’s next doctor visit with specialty, date, time, and preparation notes.`}
                actionLabel={canEdit ? 'Schedule Visit' : undefined}
                onAction={canEdit ? openCreateModal : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {upcoming.map((appt) => (
                  <Card
                    key={appt.id}
                    tone="white"
                    className="p-6 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <p className="font-mono text-xs font-semibold text-[#5D4A96] tabular-nums">
                        {appt.date} · {formatTime12Hour(appt.time)} ·{' '}
                        {appt.specialty || 'Clinic Visit'}
                      </p>
                      <h3 className="font-display text-xl font-bold text-[#10373A]">
                        {appt.title}
                      </h3>
                      <p className="text-base font-medium text-[#2C5E63]">
                        {appt.doctorName}
                      </p>
                      <div className="space-y-1 text-sm text-[#4B7478] pt-1">
                        {appt.location && (
                          <p className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 shrink-0 text-[#1A7A68]" />
                            <span>{appt.location}</span>
                          </p>
                        )}
                        {appt.assignedCaregiver && (
                          <p className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 shrink-0 text-[#1A7A68]" />
                            <span>Escort: {appt.assignedCaregiver}</span>
                          </p>
                        )}
                      </div>
                      {appt.notes && (
                        <p className="mt-2 rounded-xl bg-[#F1F8F5] p-3 text-sm text-[#10373A]">
                          {appt.notes}
                        </p>
                      )}
                    </div>

                    {canEdit && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EBF0EE] pt-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!emailVerified}
                            onClick={() => openEditModal(appt)}
                            aria-label={`Edit ${appt.title}`}
                          >
                            <Edit3 className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!emailVerified}
                            onClick={() => setDeletingAppt(appt)}
                            aria-label={`Delete ${appt.title}`}
                          >
                            <Trash2 className="h-4 w-4 text-[#B42318]" />
                            Delete
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!emailVerified}
                            onClick={() => updateAppointmentStatus(appt.id, 'cancelled')}
                            aria-label={`Cancel ${appt.title}`}
                          >
                            <XCircle className="h-4 w-4 text-[#9E5A00]" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!emailVerified}
                            onClick={() => updateAppointmentStatus(appt.id, 'completed')}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Complete
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-display text-lg font-bold text-[#4B7478]">
                Completed & Past Visits ({past.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {past.map((appt) => (
                  <Card
                    key={appt.id}
                    tone="warm"
                    className="p-5 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="font-mono text-xs text-[#4B7478] tabular-nums">
                        {appt.date} · {formatTime12Hour(appt.time)} ·{' '}
                        <span className="capitalize font-semibold">{appt.status}</span>
                      </p>
                      <h3 className="font-display text-base font-bold text-[#10373A]">
                        {appt.title}
                      </h3>
                      <p className="text-sm text-[#4B7478]">
                        {appt.doctorName} · {appt.specialty || 'Clinic Visit'}
                      </p>
                      {appt.notes && (
                        <p className="text-sm text-[#2C5E63] pt-1">{appt.notes}</p>
                      )}
                    </div>
                    {isProfileOwner && (
                      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E2E6E4] pt-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!emailVerified}
                          onClick={() => updateAppointmentStatus(appt.id, 'upcoming')}
                          aria-label={`Reopen ${appt.title}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reopen
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!emailVerified}
                          onClick={() => openEditModal(appt)}
                          aria-label={`Edit ${appt.title}`}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!emailVerified}
                          onClick={() => setDeletingAppt(appt)}
                          aria-label={`Delete ${appt.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[#B42318]" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Create / Edit Appointment Modal */}
      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          resetForm();
        }}
        title={editingAppt ? 'Edit Appointment' : 'Schedule Appointment'}
        description="Store the doctor name, specialty, date, time, and preparation notes."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Doctor Name"
              placeholder="e.g., Dr. Priya Patel"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              error={errors.doctorName}
              required
            />
            <Input
              label="Specialty"
              placeholder="e.g., Cardiology"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              error={errors.specialty}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={errors.date}
              required
            />
            <Input
              label="Time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              error={errors.time}
              required
            />
          </div>
          <Textarea
            label="Notes"
            placeholder="e.g., Bring updated blood pressure log and medication list."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Input
            label="Visit Title (optional)"
            placeholder="Auto-generated from specialty & doctor if blank"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Clinic Location (optional)"
              placeholder="e.g., Cedar Valley Clinic, Suite 410"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Input
              label="Assigned Escort (optional)"
              value={assignedCaregiver}
              onChange={(e) => setAssignedCaregiver(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? 'Saving...'
                : editingAppt
                  ? 'Save Changes'
                  : 'Save Appointment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deletingAppt)}
        onClose={() => setDeletingAppt(null)}
        title="Delete Appointment"
        description={
          deletingAppt
            ? `Remove "${deletingAppt.title}" with ${deletingAppt.doctorName} on ${deletingAppt.date}?`
            : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[#4B7478]">
            This removes the appointment permanently from the care circle calendar.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeletingAppt(null)}>
              Keep Visit
            </Button>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
