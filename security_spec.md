# PILLUMINATI Phase 2 Security Specification

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every unspecified path in Firestore is denied (`/{document=**} { allow read, write: if false; }`).
2. **No Self-Assigned Privileged Roles**: `users/{uid}.accountRole` is immutable after creation (`incoming().accountRole == existing().accountRole`). Access to any patient's medical profile requires either being the profile `ownerUid` or having an active record in `caregiverRelationships` / `familyMemberships` backed by an owner-issued invitation.
3. **Unpredictable Document IDs**: All `patientProfiles`, `invitations`, `emergencyTokens`, `medications`, `medicationSchedules`, `adherenceRecords`, `appointments`, `alerts`, `caregiverAvailability`, and `aiConversations` documents require `id.size() >= 16` (and `>= 20` / `>= 24` for `invitations` and `emergencyTokens`) generated via `crypto.randomUUID()` / `crypto.getRandomValues()`.
4. **Server-Only Passcode Isolation**: `/patientProfiles/{profileId}/security/{docId}` has `allow read, write: if false;` in `firestore.rules`. Only the Firebase Admin SDK on the server can read/write salted scrypt passcode hashes, rate-limit timestamps, and lockout counters.
5. **PII Isolation**: `/users/{uid}/private/{docId}` is readable and writable strictly by `request.auth.uid == uid`.
6. **Family Permission Enforcement**: Family members (`familyUids`) cannot read `medications`, `medicationSchedules`, `adherenceRecords`, or `appointments` when `familyAllowed == false` (enforced directly on `resource.data` in `allow list` and `allow get`).
7. **Controlled Emergency Access**: `emergencyTokens` can only be created/listed/revoked by the verified profile `ownerUid`. External emergency access is served exclusively via `/api/emergency/:token` after server verification of `!revoked && expiresAt > now`, returning a minimal read-only emergency subset.
8. **Email Verification & Temporal Integrity**: All medical writes require `request.auth.token.email_verified == true` and `createdAt == request.time` / `updatedAt == request.time`.

## 2. Dirty Dozen Adversarial Payloads
1. **Self-Role Escalation**: User updates `/users/{uid}` changing `accountRole` from `'family'` to `'caregiver'` or adding `isAdmin: true` -> `PERMISSION_DENIED`.
2. **Predictable ID Enumeration**: Unauthenticated or non-member reads `/patientProfiles/profile-1` or `/medications/med-1` -> `PERMISSION_DENIED`.
3. **Client Passcode Tampering**: Authenticated caregiver writes or reads `/patientProfiles/{id}/security/passcode` to reset `failedAttempts` or inspect hash -> `PERMISSION_DENIED`.
4. **Unauthorized Profile Join**: User writes themselves into `/caregiverRelationships/{id}` or adds their UID to `patientProfiles/{id}.caregiverUids` without being `ownerUid` -> `PERMISSION_DENIED`.
5. **Family Privacy Bypass**: Family member lists `/medications` where `familyAllowed == false` -> `PERMISSION_DENIED`.
6. **PII Cross-User Scrape**: Authenticated user reads `/users/{otherUid}/private/info` -> `PERMISSION_DENIED`.
7. **Unverified Email Medical Write**: Newly registered unverified email account writes `/patientProfiles/{id}` -> `PERMISSION_DENIED`.
8. **Emergency Token Scraping**: Non-owner queries `list` on `/emergencyTokens` -> `PERMISSION_DENIED`.
9. **Expired / Revoked Invitation Acceptance**: User attempts to accept an invitation with `status == 'revoked'` or wrong `targetEmail` -> `PERMISSION_DENIED`.
10. **Immutable Owner Mutation**: Caregiver updates `/medications/{id}` to overwrite `ownerUid` or `profileId` -> `PERMISSION_DENIED`.
11. **Terminal Appointment Re-open**: Non-owner updates completed appointment back to `'upcoming'` -> `PERMISSION_DENIED`.
12. **Client-Forged Timestamp**: Client creates adherence record with backdated `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
