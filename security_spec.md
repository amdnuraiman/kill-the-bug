# killthebug Security Specification (Phase 0)

## 1. Data Invariants
1. A `UserProfile` document at `/users/{userId}` can only be read, created, updated, or deleted by the authenticated owner (`request.auth.uid == userId`) with a verified email (`request.auth.token.email_verified == true` for writes). Collection-wide `list` on `/users` is strictly disabled (`allow list: if false`).
2. `UserProfile` stores no PII (`email`, `phone`, `address` are forbidden via `keys().hasOnly(...)`).
3. `UserProfile.uid` and `UserProfile.createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
4. `UserProfile.unlockedEquipment` is strictly bounded (`size() <= 3`) and element-allowlisted (`hasOnly(['za_zapper', 'emerald_repellent', 'ora_gauntlets'])`).
5. A `RunRecord` document at `/users/{userId}/runs/{runId}` cannot exist without a parent `/users/{userId}` document (`exists(...)` Master Gate on `create`), is immutable once created (`allow update: if false`), and can only be listed by its owner with `resource.data.userId == request.auth.uid`.
6. All document IDs (`userId`, `runId`) must satisfy `isValidId()` (`^[a-zA-Z0-9_\\-]+$`, length `1..128`) on single-document reads and writes.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Creating `/users/attacker` with `request.auth == null`. -> Expect `PERMISSION_DENIED`.
2. **Unverified Email Write**: Creating `/users/{uid}` when `request.auth.token.email_verified == false`. -> Expect `PERMISSION_DENIED`.
3. **Cross-Tenant Profile Read**: Reading `/users/victimUid` as `attackerUid`. -> Expect `PERMISSION_DENIED`.
4. **Users Collection Scraping**: Listing `/users` as any signed-in user. -> Expect `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: Creating `/users/{uid}` with `uid: "otherUser"` or `/users/{uid}/runs/{runId}` with `userId: "otherUser"`. -> Expect `PERMISSION_DENIED`.
6. **Ghost Field / Shadow Write**: Creating or updating `/users/{uid}` with extra field `isAdmin: true` or `role: "admin"`. -> Expect `PERMISSION_DENIED`.
7. **Timestamp Forgery**: Setting `createdAt` or `updatedAt` to a client timestamp instead of `request.time`. -> Expect `PERMISSION_DENIED`.
8. **Immutable Field Tampering**: Updating `/users/{uid}` to alter `uid` or `createdAt`. -> Expect `PERMISSION_DENIED`.
9. **Equipment Array Poisoning**: Setting `unlockedEquipment` to `["god_mode_hack"]` or exceeding 3 items. -> Expect `PERMISSION_DENIED`.
10. **Out-of-Bounds / Type Poisoning**: Setting `dengueLosses: 99`, `highScore: -500`, or `displayName` > 60 chars. -> Expect `PERMISSION_DENIED`.
11. **Orphaned Run Write**: Creating `/users/{uid}/runs/run1` when `/users/{uid}` does not exist. -> Expect `PERMISSION_DENIED`.
12. **Run History Tampering & Path Poisoning**: Updating an existing `RunRecord`, or writing with a 200-char or invalid `runId` containing `$` / spaces. -> Expect `PERMISSION_DENIED`.
