import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { SPECIAL_EQUIPMENT_LIST, type EquipmentId } from './game/Equipment';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (the client is offline).');
    }
  }
}

void testConnection();

export interface CloudUserProfile {
  uid: string;
  displayName: string;
  highScore: number;
  dengueLosses: number;
  totalWins: number;
  unlockedEquipment: EquipmentId[];
  equippedId: EquipmentId | 'none';
}

export interface CloudRunRecord {
  id: string;
  userId: string;
  panicDuration: 15 | 30 | 60;
  outcome: 'victory' | 'gameover' | 'hospitalized';
  score: number;
  kills: number;
  superSmashes: number;
  maxCombo: number;
  weatherPeak: string;
  createdAtMs: number;
}

const VALID_EQUIP_IDS: EquipmentId[] = SPECIAL_EQUIPMENT_LIST.map((e) => e.id);

function sanitizeDisplayName(raw: string | null | undefined): string {
  const trimmed = (raw || 'Stand User').trim().slice(0, 60);
  return trimmed.length > 0 ? trimmed : 'Stand User';
}

function sanitizeEquipmentList(list: EquipmentId[]): EquipmentId[] {
  const unique: EquipmentId[] = [];
  for (const id of list) {
    if (VALID_EQUIP_IDS.includes(id) && !unique.includes(id)) {
      unique.push(id);
    }
    if (unique.length >= 3) break;
  }
  return unique;
}

function sanitizeEquippedId(id: EquipmentId | null | 'none', unlocked: EquipmentId[]): EquipmentId | 'none' {
  if (!id || id === 'none') return 'none';
  return unlocked.includes(id) ? id : 'none';
}

export function subscribeAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function ensureAndLoadUserProfile(
  user: User,
  localFallback: {
    highScore: number;
    dengueLosses: number;
    totalWins: number;
    unlockedEquipment: EquipmentId[];
    equippedId: EquipmentId | null;
  },
): Promise<CloudUserProfile> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const unlocked = sanitizeEquipmentList(
        Array.isArray(data.unlockedEquipment) ? (data.unlockedEquipment as EquipmentId[]) : [],
      );
      const mergedUnlocked = sanitizeEquipmentList([
        ...unlocked,
        ...localFallback.unlockedEquipment,
      ]);
      const equippedId = sanitizeEquippedId(
        (data.equippedId as EquipmentId | 'none') || 'none',
        mergedUnlocked,
      );

      return {
        uid: user.uid,
        displayName: sanitizeDisplayName(data.displayName as string),
        highScore: Math.max(0, Math.min(100000000, Math.trunc(Number(data.highScore) || 0))),
        dengueLosses: Math.max(0, Math.min(3, Math.trunc(Number(data.dengueLosses) || 0))),
        totalWins: Math.max(0, Math.min(100000, Math.trunc(Number(data.totalWins) || 0))),
        unlockedEquipment: mergedUnlocked,
        equippedId,
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const unlocked = sanitizeEquipmentList(localFallback.unlockedEquipment);
  const equippedId = sanitizeEquippedId(localFallback.equippedId, unlocked);
  const displayName = sanitizeDisplayName(user.displayName);

  const initialDoc = {
    uid: user.uid,
    displayName,
    highScore: Math.max(0, Math.min(100000000, Math.trunc(localFallback.highScore))),
    dengueLosses: Math.max(0, Math.min(3, Math.trunc(localFallback.dengueLosses))),
    totalWins: Math.max(0, Math.min(100000, Math.trunc(localFallback.totalWins))),
    unlockedEquipment: unlocked,
    equippedId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, initialDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    uid: user.uid,
    displayName,
    highScore: initialDoc.highScore,
    dengueLosses: initialDoc.dengueLosses,
    totalWins: initialDoc.totalWins,
    unlockedEquipment: unlocked,
    equippedId,
  };
}

export async function syncUserProgressToCloud(
  user: User,
  progress: {
    highScore: number;
    dengueLosses: number;
    totalWins: number;
    unlockedEquipment: EquipmentId[];
    equippedId: EquipmentId | null;
  },
): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const unlocked = sanitizeEquipmentList(progress.unlockedEquipment);
  const equippedId = sanitizeEquippedId(progress.equippedId, unlocked);

  try {
    await updateDoc(ref, {
      highScore: Math.max(0, Math.min(100000000, Math.trunc(progress.highScore))),
      dengueLosses: Math.max(0, Math.min(3, Math.trunc(progress.dengueLosses))),
      totalWins: Math.max(0, Math.min(100000, Math.trunc(progress.totalWins))),
      unlockedEquipment: unlocked,
      equippedId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function logRunToCloud(
  user: User,
  run: {
    panicDuration: 15 | 30 | 60;
    outcome: 'victory' | 'gameover' | 'hospitalized';
    score: number;
    kills: number;
    superSmashes: number;
    maxCombo: number;
    weatherPeak: string;
  },
): Promise<void> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `users/${user.uid}/runs/${runId}`;
  const ref = doc(db, 'users', user.uid, 'runs', runId);

  try {
    await setDoc(ref, {
      userId: user.uid,
      panicDuration: run.panicDuration,
      outcome: run.outcome,
      score: Math.max(0, Math.min(100000000, Math.trunc(run.score))),
      kills: Math.max(0, Math.min(10000, Math.trunc(run.kills))),
      superSmashes: Math.max(0, Math.min(1000, Math.trunc(run.superSmashes))),
      maxCombo: Math.max(0, Math.min(10000, Math.trunc(run.maxCombo))),
      weatherPeak: (run.weatherPeak || 'Light Drizzle').trim().slice(0, 40),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchRecentRuns(user: User): Promise<CloudRunRecord[]> {
  const path = `users/${user.uid}/runs`;
  try {
    const q = query(
      collection(db, 'users', user.uid, 'runs'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(8),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      const ts = data.createdAt as Timestamp | undefined;
      return {
        id: d.id,
        userId: String(data.userId || user.uid),
        panicDuration: (Number(data.panicDuration) as 15 | 30 | 60) || 30,
        outcome: (data.outcome as CloudRunRecord['outcome']) || 'victory',
        score: Number(data.score) || 0,
        kills: Number(data.kills) || 0,
        superSmashes: Number(data.superSmashes) || 0,
        maxCombo: Number(data.maxCombo) || 0,
        weatherPeak: String(data.weatherPeak || 'Calm'),
        createdAtMs: ts ? ts.toMillis() : Date.now(),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
