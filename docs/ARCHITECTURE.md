# PILLUMINATI — Project Architecture Document

> **Tagline:** "Because remembering meds shouldn't be a family conspiracy."

## 1. Executive Summary & Tech Stack

PILLUMINATI is a role-aware elderly care and medication coordination platform connecting **Elderly Patients**, **Primary Caregivers**, and **Family Members**.

- **Frontend & Routing:** Vite 8 + React 19 + TypeScript + React Router (`react-router-dom`) + Tailwind CSS v4 + Framer Motion (`motion/react`) + Lucide Icons + `qrcode`.
- **Backend (`server.ts` + `server/`):** Express server on port `3000` enforcing authentication, server-derived RBAC/ABAC authorization, input validation, and structured logging across `/api/*`:
  - **Auth Middleware (`server/verifyClientToken.ts`, `server/middleware/auth.ts`):** Verifies Firebase ID tokens via Identity Toolkit REST (`accounts:lookup`) and rejects unauthenticated (`401`) or unverified (`403`) requests.
  - **Authorization Service (`server/services/authzService.ts`):** Derives caller permissions authoritatively from Firestore `patientProfiles/{profileId}` (`owner`, `clinical`, `member`) — never trusts frontend-supplied role/patient/caregiver/permission fields.
  - **Firestore REST Layer (`server/services/firestoreRest.ts`):** Executes typed reads, structured queries, atomic multi-document writes, and server-time (`REQUEST_TIME`) transforms against Cloud Firestore v1 REST API using the caller's verified Firebase ID token, ensuring both Express middleware AND `firestore.rules` enforce every write.
  - **Real Server Scheduler (`server/services/schedulerService.ts`, `server/utils/schedulerLogic.ts`):** Runs a 60-second interval loop over active authenticated sessions (registered via `/api/session/heartbeat`) plus on-demand `POST /api/scheduler/run`, detecting overdue doses and unacknowledged Care Relay handoffs (>60m), deduplicating alerts, and persisting audit records to `schedulerRuns`.
  - **Notification Delivery Ledger (`server/services/notificationService.ts`):** Atomically persists in-app alerts (`alerts`) and channel delivery records (`notificationDeliveries`: `in_app_firestore` = `delivered`; `email` via Resend = `delivered` when `RESEND_API_KEY` is configured or `blocked` when unconfigured).
  - **Controlled Emergency QR & Responder Snapshots (`/api/emergency-tokens`, `/api/emergency/:token`):** Generates unguessable 24+ character `emg_*` tokens, scannable QR data URLs, and revocable `publicEmergencySnapshots` (`allow list: if false`, `allow get` gated by token ID, `revoked == false`, and `expiresAt > request.time`).
  - **Simplified Gemini AI (`/api/companion/status`, `/api/companion/chat`, `/api/companion/summary`, `/api/medications/scan-prescription`):** Server-side `@google/genai` (`gemini-4-hydrogen`) powering (1) the Prescription Scanner (structured Vision extraction flagging uncertain/missing dosage fields for manual caregiver review and requiring caregiver confirmation before saving) and (2) the Pillu AI Health Companion (general medication-management & wellness answers with strict no-diagnosis / no-dosage-change clinical guardrails, clear medical disclaimer, and explicit error states if `GEMINI_API_KEY` is unconfigured).
  - **Centralized Error Handler & Monitoring (`server/middleware/errorHandler.ts`, `server/logger.ts`):** Structured JSON audit logs, `X-Request-Id` tracing, and `/api/monitoring/status`.

---

## 2. Directory & Module Structure

```text
/
├── server.ts                          # Express bootstrap, middleware, scheduler start & Vite/static serving
├── server/
│   ├── config.ts                      # Firebase config & env capability flags
│   ├── logger.ts                      # Structured JSON logger, request IDs & in-memory monitoring metrics
│   ├── verifyClientToken.ts           # Firebase Identity Toolkit REST ID token verifier
│   ├── middleware/
│   │   ├── auth.ts                    # requireAuth, requireVerifiedEmail, requireProfileRole
│   │   └── errorHandler.ts            # ApiError & centralized error handler
│   ├── routes/
│   │   └── api.ts                     # Validated REST API routes (/api/*)
│   ├── services/
│   │   ├── aiService.ts               # Server-context Gemini companion & care summary
│   │   ├── authzService.ts            # Authoritative Firestore RBAC resolver
│   │   ├── firestoreRest.ts           # Cloud Firestore v1 REST client & transforms
│   │   ├── firestoreRest.test.ts      # Firestore REST unit tests
│   │   ├── notificationService.ts     # Alert dispatch & delivery ledger
│   │   └── schedulerService.ts        # 60s background loop & manual scheduler runs
│   └── utils/
│       ├── schedulerLogic.ts          # Pure overdue-dose & relay escalation evaluation
│       ├── schedulerLogic.test.ts     # Scheduler logic unit tests
│       └── validation.ts              # Strict backend request & ID validators
├── firebase-blueprint.json            # Firestore entity & collection path blueprint (IR)
├── firestore.rules                    # Hardened Zero-Trust ABAC/RBAC Firestore security rules
├── firestore.indexes.json             # Composite query indexes
└── src/
    ├── lib/firebase.ts                # Firebase client SDK init, persistence, error handling
    ├── services/
    │   ├── authService.ts             # Google Sign-In, Email/Password, verification & reset
    │   ├── backendApi.ts              # Authenticated client wrapper for Express /api/* (meds, discontinue, adherence)
    │   └── firestoreService.ts        # Live onSnapshot subscriptions (incl. medicationChanges) & owner invite/revoke sync
    ├── utils/                         # medicationEngine.ts (shared scheduling/streaks/calendar), adherence.ts & rbac.ts + node:test suites
    ├── context/CareContext.tsx        # Reactive Firestore state + scheduledDosesToday + Express API mutations
    └── pages/ & components/           # Role-aware UI, dashboards, Medications (multi-dose/edit/discontinue), History (daily/7d/30d/calendar), Passport, Companion, Scheduler
```
