import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { ExamStatus } from '../types/exam';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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
  path: string | null
) {
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

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

/**
 * Atomically records the one-time first-admin bootstrap lock in Firestore
 */
export async function syncFirstAdminBootstrapToFirestore() {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const email = auth.currentUser.email || `${uid}@firebase.user`;
  const displayName =
    auth.currentUser.displayName || email.split('@')[0] || 'Quản trị viên';

  const batch = writeBatch(db);
  batch.set(doc(db, 'system_bootstrap', 'state'), {
    locked: true,
    bootstrappedByUid: uid,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', uid), {
    uid,
    email: email.slice(0, 256),
    displayName: displayName.slice(0, 120),
    role: 'admin',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, 'system_bootstrap/state');
    } catch {
      // Logged by handleFirestoreError
    }
  }
}

/**
 * Syncs public exam metadata (without answer keys) to Firestore when a teacher is signed in with Firebase Auth
 */
export async function syncExamMetadataToFirestore(exam: {
  id: string;
  ownerId: string;
  shareCode: string;
  title: string;
  subject: string;
  status: ExamStatus;
  version: number;
  durationMinutes: number;
  totalScale: number;
}) {
  if (!auth.currentUser) return;
  const path = `exams/${exam.id}`;
  try {
    await setDoc(
      doc(db, 'exams', exam.id),
      {
        id: exam.id,
        ownerId: auth.currentUser.uid,
        shareCode: exam.shareCode,
        title: exam.title.slice(0, 300),
        subject: exam.subject.slice(0, 120),
        status: exam.status,
        version: Math.max(1, Math.floor(exam.version || 1)),
        durationMinutes: Math.max(
          1,
          Math.min(300, Math.floor(exam.durationMinutes || 45))
        ),
        totalScale: Math.max(
          1,
          Math.min(1000, Math.floor(exam.totalScale || 10))
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    if (auth.currentUser) {
      try {
        handleFirestoreError(error, OperationType.WRITE, path);
      } catch {
        // Logged by handleFirestoreError
      }
    }
  }
}
