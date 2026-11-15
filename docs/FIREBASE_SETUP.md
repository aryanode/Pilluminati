# PILLUMINATI — Firebase & Environment Setup

## 1. Provisioned Firebase Resources
- **Project ID**: `blissful-road-7c62s`
- **Firestore Database ID**: `ai-studio-8ffc3196-5309-40bc-84a7-1cfde4467661`
- **Client Config**: `/firebase-applet-config.json` (loaded by `src/lib/firebase.ts` and `server/config.ts`)

## 2. Architecture (Express + Firebase Client SDK / Auth + Firestore Rules)
PILLUMINATI executes client subscriptions via the Firebase Client SDK and clinical mutations/AI/notifications through Express `/api/*` endpoints authenticated via the caller's Firebase ID token (`Authorization: Bearer <token>`), executing against Cloud Firestore v1 REST API with strict `firestore.rules` active at the database boundary — with **zero `firebase-admin` or service-account requirements**.

### Environment Variables (`.env.example`)
- `FIREBASE_API_KEY`: Firebase Web API key used for ID token verification (falls back to `firebase-applet-config.json` if omitted).
- `RESEND_API_KEY`: Server-side Resend API key for Care Circle email alert delivery.
- `GEMINI_API_KEY`: Server-side Gemini API key for Pillu companion chat, care summaries, and prescription label scanning.
- `APP_URL`: Hosted application URL used when generating emergency responder QR URLs.

## 3. Authentication Providers
- **Google Sign-In**: Enabled via **Continue with Google**.
- **Email/Password**: Available via Firebase Auth registration/login/reset/verification.

## 4. Firestore Rules & Indexes
- Security Rules: `/firestore.rules` (deployed to `ai-studio-8ffc3196-5309-40bc-84a7-1cfde4467661`)
- Composite Indexes: `/firestore.indexes.json`
- Schema Blueprint: `/firebase-blueprint.json`

## 5. Honest Capability Boundaries
1. **Email Alert Delivery (`Resend`)**: In-app Firestore delivery (`alerts` + `notificationDeliveries`) always persists `delivered`; Resend email delivery sends real emails via `RESEND_API_KEY` or records `blocked` if `RESEND_API_KEY` is unconfigured.
2. **Active-Session Scheduler**: The 60s server scheduler and manual `POST /api/scheduler/run` evaluate active authenticated clinical sessions; signed-out offline polling is not active in client-SDK mode.
