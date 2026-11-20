/**
 * Phase 0 Dirty Dozen Security Test Specification for killthebug Firestore Rules.
 * Documents the 12 adversarial payloads that must resolve to PERMISSION_DENIED.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated profile create',
    operation: 'create',
    path: '/users/user123',
    auth: null,
    payload: { uid: 'user123', displayName: 'Anon' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email profile create',
    operation: 'create',
    path: '/users/user123',
    auth: { uid: 'user123', email_verified: false },
    payload: { uid: 'user123', displayName: 'Unverified' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-tenant profile read',
    operation: 'get',
    path: '/users/victimUid',
    auth: { uid: 'attackerUid', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Blanket users collection list',
    operation: 'list',
    path: '/users',
    auth: { uid: 'attackerUid', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Identity spoofing in RunRecord userId',
    operation: 'create',
    path: '/users/attackerUid/runs/run_01',
    auth: { uid: 'attackerUid', email_verified: true },
    payload: { userId: 'victimUid', panicDuration: 30, outcome: 'victory', score: 9000 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow / ghost field injection (isAdmin)',
    operation: 'update',
    path: '/users/user123',
    auth: { uid: 'user123', email_verified: true },
    payload: { displayName: 'Jotaro', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Client timestamp forgery on create',
    operation: 'create',
    path: '/users/user123',
    auth: { uid: 'user123', email_verified: true },
    payload: { uid: 'user123', createdAt: '1999-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable createdAt tampering on update',
    operation: 'update',
    path: '/users/user123',
    auth: { uid: 'user123', email_verified: true },
    payload: { createdAt: '2020-01-01T00:00:00Z', displayName: 'Dio' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Equipment allowlist bypass / array overflow',
    operation: 'update',
    path: '/users/user123',
    auth: { uid: 'user123', email_verified: true },
    payload: { unlockedEquipment: ['hacked_glove', 'za_zapper', 'emerald_repellent', 'ora_gauntlets'] },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Value poisoning: negative score & dengueLosses overflow',
    operation: 'update',
    path: '/users/user123',
    auth: { uid: 'user123', email_verified: true },
    payload: { highScore: -999, dengueLosses: 99 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Orphaned run write when parent user profile missing',
    operation: 'create',
    path: '/users/orphanUid/runs/run_01',
    auth: { uid: 'orphanUid', email_verified: true },
    payload: { userId: 'orphanUid', panicDuration: 15, outcome: 'victory', score: 1200 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Immutable RunRecord update & invalid path ID poisoning',
    operation: 'update',
    path: '/users/user123/runs/bad$id',
    auth: { uid: 'user123', email_verified: true },
    payload: { score: 999999 },
    expected: 'PERMISSION_DENIED',
  },
];
