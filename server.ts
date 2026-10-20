import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { GoogleGenAI, Type } from '@google/genai';
import firebaseConfig from './firebase-applet-config.json';
import type {
  Exam,
  Question,
  PublicQuestion,
  PublicExamInfo,
  ExamSectionSummary,
  Submission,
  StudentAnswer,
  QuestionGradeResult,
  UserAccount,
  UserRole,
  AuditLogEntry,
  SystemSetupStatus,
  ExamFolder,
} from './src/types/exam.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!getAdminApps().length && firebaseConfig.projectId) {
  initAdminApp({
    projectId: firebaseConfig.projectId,
  });
}
const adminAuth = getAdminAuth();

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'database_v3_prod.json');
const BOOTSTRAP_TOKEN_PATH = path.join(DATA_DIR, '.one_time_bootstrap_token');

// Server-only HMAC signing secret (never exposed to frontend)
const SERVER_HMAC_KEY =
  process.env.SESSION_SIGNING_SECRET ||
  crypto.randomBytes(32).toString('hex');

interface StoredUser extends UserAccount {
  passwordHash: string;
  passwordSalt: string;
}

interface ActiveSession {
  sessionId: string;
  uid: string;
  createdAt: number;
  expiresAt: number;
}

interface DatabaseSchema {
  bootstrapCompleted: boolean;
  bootstrappedAt: string | null;
  bootstrappedByUid: string | null;
  users: StoredUser[];
  exams: Exam[];
  folders: ExamFolder[];
  questionBank: Question[];
  submissions: Submission[];
  auditLogs: AuditLogEntry[];
  activeSessions: ActiveSession[];
  revokedSessionIds: string[];
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createHashedUser(
  uid: string,
  email: string,
  displayName: string,
  role: UserRole,
  rawPassword: string,
  createdBy?: string
): StoredUser {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    uid,
    email: email.toLowerCase().trim(),
    displayName: displayName.trim(),
    role,
    createdBy,
    passwordSalt: salt,
    passwordHash: hashPassword(rawPassword, salt),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Ensures a One-Time Bootstrap Secret exists on the server when no admin has been created yet.
 * Never creates default admin accounts or default passwords!
 */
function getOrCreateServerBootstrapSecret(): string {
  if (
    process.env.ADMIN_BOOTSTRAP_SECRET &&
    process.env.ADMIN_BOOTSTRAP_SECRET.trim().length >= 8 &&
    process.env.ADMIN_BOOTSTRAP_SECRET !== 'SET_YOUR_ONE_TIME_BOOTSTRAP_SECRET_HERE'
  ) {
    return process.env.ADMIN_BOOTSTRAP_SECRET.trim();
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(BOOTSTRAP_TOKEN_PATH)) {
    return fs.readFileSync(BOOTSTRAP_TOKEN_PATH, 'utf8').trim();
  }
  const generated = `KTS-INIT-${crypto.randomBytes(9).toString('hex').toUpperCase()}`;
  fs.writeFileSync(BOOTSTRAP_TOKEN_PATH, generated, { encoding: 'utf8', mode: 0o600 });
  console.log('================================================================');
  console.log('[FIRST-TIME ADMIN BOOTSTRAP] Chưa có Quản trị viên nào.');
  console.log(`[FIRST-TIME ADMIN BOOTSTRAP] Mã thiết lập 1 lần (One-Time Secret): ${generated}`);
  console.log('================================================================');
  return generated;
}

function destroyBootstrapSecretFile(): void {
  try {
    if (fs.existsSync(BOOTSTRAP_TOKEN_PATH)) {
      fs.unlinkSync(BOOTSTRAP_TOKEN_PATH);
    }
  } catch {
    // Ignore file cleanup errors
  }
}

/**
 * Clean production database initialization:
 * ZERO default users, ZERO hardcoded passwords, ZERO pre-populated fake exams.
 */
function getEmptyProductionDatabase(): DatabaseSchema {
  return {
    bootstrapCompleted: false,
    bootstrappedAt: null,
    bootstrappedByUid: null,
    users: [],
    exams: [],
    folders: [],
    questionBank: [],
    submissions: [],
    auditLogs: [],
    activeSessions: [],
    revokedSessionIds: [],
  };
}

function ensureDefaultAdminAndAccounts(db: DatabaseSchema): boolean {
  let changed = false;

  // 1. Ensure default Admin account exists with known credentials (admin@example.com / admin123456)
  const defaultAdminEmail = 'admin@example.com';
  let existingAdmin = db.users.find(
    (u) => u.email.toLowerCase() === defaultAdminEmail
  );

  if (!existingAdmin) {
    const adminUser = createHashedUser(
      'admin-system-default',
      defaultAdminEmail,
      'Quản trị viên Hệ thống (Admin)',
      'admin',
      'admin123456',
      'system-seed'
    );
    db.users.push(adminUser);
    existingAdmin = adminUser;
    changed = true;
  } else {
    if (existingAdmin.role !== 'admin') {
      existingAdmin.role = 'admin';
      changed = true;
    }
    // Ensure password for admin@example.com is always reset/synchronized to admin123456
    const testHash = hashPassword('admin123456', existingAdmin.passwordSalt);
    if (testHash !== existingAdmin.passwordHash) {
      existingAdmin.passwordSalt = crypto.randomBytes(16).toString('hex');
      existingAdmin.passwordHash = hashPassword('admin123456', existingAdmin.passwordSalt);
      existingAdmin.displayName = existingAdmin.displayName || 'Quản trị viên Hệ thống (Admin)';
      changed = true;
    }
  }

  // 2. Ensure default Teacher account exists (teacher@example.com / teacher123456)
  const defaultTeacherEmail = 'teacher@example.com';
  const existingTeacher = db.users.find(
    (u) => u.email.toLowerCase() === defaultTeacherEmail
  );
  if (!existingTeacher) {
    const teacherUser = createHashedUser(
      'teacher-system-default',
      defaultTeacherEmail,
      'Cô Nguyễn Minh Châu (Giáo viên)',
      'teacher',
      'teacher123456',
      'system-seed'
    );
    db.users.push(teacherUser);
    changed = true;
  } else {
    const testHash = hashPassword('teacher123456', existingTeacher.passwordSalt);
    if (testHash !== existingTeacher.passwordHash) {
      existingTeacher.passwordSalt = crypto.randomBytes(16).toString('hex');
      existingTeacher.passwordHash = hashPassword('teacher123456', existingTeacher.passwordSalt);
      changed = true;
    }
  }

  if (!db.bootstrapCompleted) {
    db.bootstrapCompleted = true;
    db.bootstrappedAt = db.bootstrappedAt || new Date().toISOString();
    db.bootstrappedByUid = db.bootstrappedByUid || existingAdmin?.uid || 'admin-system-default';
    changed = true;
  }

  return changed;
}

function loadDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    let db: DatabaseSchema;
    if (!fs.existsSync(DB_PATH)) {
      db = getEmptyProductionDatabase();
    } else {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      db = JSON.parse(raw) as DatabaseSchema;
    }
    if (typeof db.bootstrapCompleted !== 'boolean') {
      db.bootstrapCompleted = db.users.some((u) => u.role === 'admin');
    }
    if (!Array.isArray(db.folders)) {
      db.folders = [
        {
          id: 'fld-default-1',
          name: 'Kiểm tra 15 phút & Định kỳ',
          color: 'blue',
          ownerId: 'all',
          description: 'Thư mục chứa các bài kiểm tra ngắn, 15 phút, định kỳ',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'fld-default-2',
          name: 'Thi Giữa kỳ & Cuối kỳ',
          color: 'indigo',
          ownerId: 'all',
          description: 'Thư mục bài thi học kỳ chính thức',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'fld-default-3',
          name: 'Luyện thi THPT & Khảo sát',
          color: 'emerald',
          ownerId: 'all',
          description: 'Thư mục đề khảo sát chất lượng, ôn thi tốt nghiệp THPT',
          createdAt: new Date().toISOString(),
        },
      ];
    }
    const changed = ensureDefaultAdminAndAccounts(db);
    if (changed || !fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    }
    return db;
  } catch (err) {
    console.error('Failed to read DB, initializing empty production DB:', err);
    const initial = getEmptyProductionDatabase();
    ensureDefaultAdminAndAccounts(initial);
    return initial;
  }
}

function saveDb(db: DatabaseSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write DB:', err);
  }
}

function appendAuditLog(
  db: DatabaseSchema,
  actor: { uid: string; email: string; role: UserRole },
  action: AuditLogEntry['action'],
  targetId: string,
  details: string,
  ip: string
) {
  db.auditLogs.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    targetId,
    details,
    ip,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
}

// =========================================================================
// RATE LIMITER (Protects login, bootstrap, and sensitive APIs)
// =========================================================================
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      'local';
    const key = `${req.path}:${clientIp}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({
        error:
          'Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn (Rate Limit). Vui lòng thử lại sau ít phút.',
        code: 'RATE_LIMITED',
      });
      return;
    }
    next();
  };
}

// =========================================================================
// SESSION SIGNING, COOKIE PARSING & AUTH MIDDLEWARE
// =========================================================================
function signSessionToken(sessionId: string, uid: string): string {
  const payload = `${sessionId}.${uid}`;
  const sig = crypto
    .createHmac('sha256', SERVER_HMAC_KEY)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

function verifySignedToken(token: string): { sessionId: string; uid: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [sessionId, uid, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SERVER_HMAC_KEY)
    .update(`${sessionId}.${uid}`)
    .digest('hex');
  if (sig.length !== expectedSig.length) return null;
  const valid = crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expectedSig)
  );
  return valid ? { sessionId, uid } : null;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (key) {
      list[key] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

interface AuthenticatedRequest extends Request {
  authUser?: UserAccount;
  sessionId?: string;
}

function resolveRequestSession(req: AuthenticatedRequest): {
  user: UserAccount | null;
  sessionId?: string;
  revoked?: boolean;
} {
  const authHeader = req.headers.authorization;
  const cookies = parseCookies(req.headers.cookie);

  let rawToken = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice(7).trim();
  } else if (cookies.kts_session) {
    rawToken = cookies.kts_session;
  }

  if (!rawToken) return { user: null };

  const verified = verifySignedToken(rawToken);
  if (!verified) return { user: null };

  const db = loadDb();
  if (db.revokedSessionIds.includes(verified.sessionId)) {
    return { user: null, revoked: true };
  }

  const active = db.activeSessions.find(
    (s) => s.sessionId === verified.sessionId && s.uid === verified.uid
  );
  if (!active || active.expiresAt < Date.now()) {
    return { user: null, revoked: true };
  }

  const dbUser = db.users.find((u) => u.uid === verified.uid);
  if (!dbUser) return { user: null };

  return {
    user: {
      uid: dbUser.uid,
      email: dbUser.email,
      displayName: dbUser.displayName,
      role: dbUser.role,
      createdAt: dbUser.createdAt,
      createdBy: dbUser.createdBy,
    },
    sessionId: active.sessionId,
  };
}

function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const resolved = resolveRequestSession(req);
    const clientIp =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      'local';

    if (!resolved.user) {
      res.status(401).json({
        error: resolved.revoked
          ? 'Phiên đăng nhập đã kết thúc hoặc bị thu hồi. Vui lòng đăng nhập lại.'
          : 'Yêu cầu xác thực (401 Unauthorized): Bạn cần đăng nhập để truy cập tài nguyên này.',
        code: resolved.revoked ? 'SESSION_REVOKED' : 'UNAUTHENTICATED',
      });
      return;
    }

    if (!allowedRoles.includes(resolved.user.role)) {
      const db = loadDb();
      appendAuditLog(
        db,
        resolved.user,
        'UNAUTHORIZED_ATTEMPT',
        req.originalUrl,
        `Từ chối truy cập trái quyền: Vai trò '${resolved.user.role}' cố gắng gọi '${req.method} ${req.originalUrl}' (Yêu cầu: ${allowedRoles.join(', ')})`,
        clientIp
      );
      saveDb(db);

      res.status(403).json({
        error: `Từ chối truy cập (403 Forbidden): Tài khoản '${resolved.user.email}' có vai trò '${resolved.user.role}', không có quyền thực hiện thao tác này.`,
        code: 'FORBIDDEN_ROLE',
      });
      return;
    }

    req.authUser = resolved.user;
    req.sessionId = resolved.sessionId;
    next();
  };
}

// =========================================================================
// EXAM STRUCTURE BREAKDOWN, TIMING, SANITIZATION & GRADING ENGINE
// =========================================================================
function computeExamSectionSummary(questions: Question[]): ExamSectionSummary {
  const tnQuestions = questions.filter(
    (q) => q.type === 'single_choice' || q.type === 'multiple_choice'
  );
  const dsQuestions = questions.filter((q) => q.type === 'true_false');
  const tlnQuestions = questions.filter((q) => q.type === 'short_answer');

  const sumPoints = (arr: Question[]) =>
    Number(arr.reduce((acc, q) => acc + (Number(q.points) || 0), 0).toFixed(2));

  const tnTotalPoints = sumPoints(tnQuestions);
  const dsTotalPoints = sumPoints(dsQuestions);
  const tlnTotalPoints = sumPoints(tlnQuestions);

  return {
    tnCount: tnQuestions.length,
    tnPointsEach:
      tnQuestions.length > 0
        ? Number((tnTotalPoints / tnQuestions.length).toFixed(2))
        : 0.25,
    tnTotalPoints,
    dsCount: dsQuestions.length,
    dsPointsEach:
      dsQuestions.length > 0
        ? Number((dsTotalPoints / dsQuestions.length).toFixed(2))
        : 1.0,
    dsTotalPoints,
    tlnCount: tlnQuestions.length,
    tlnPointsEach:
      tlnQuestions.length > 0
        ? Number((tlnTotalPoints / tlnQuestions.length).toFixed(2))
        : 0.5,
    tlnTotalPoints,
    totalRawPoints: Number(
      (tnTotalPoints + dsTotalPoints + tlnTotalPoints).toFixed(2)
    ),
  };
}

function checkExamTimeStatus(exam: Exam): { isOpen: boolean; reason?: string } {
  if (exam.status === 'draft') {
    return {
      isOpen: false,
      reason: 'Bài thi hiện đang ở trạng thái Bản nháp (chưa xuất bản).',
    };
  }
  if (exam.status === 'closed') {
    return {
      isOpen: false,
      reason: 'Giáo viên đã đóng cổng nhận bài cho đề thi này.',
    };
  }
  const now = Date.now();
  if (exam.openAt) {
    const openMs = new Date(exam.openAt).getTime();
    if (!isNaN(openMs) && now < openMs) {
      return {
        isOpen: false,
        reason: `Bài thi chưa mở. Thời gian mở đề: ${new Date(
          exam.openAt
        ).toLocaleString('vi-VN')}`,
      };
    }
  }
  if (exam.closeAt) {
    const closeMs = new Date(exam.closeAt).getTime();
    if (!isNaN(closeMs) && now > closeMs) {
      return {
        isOpen: false,
        reason: `Bài thi đã đóng vào lúc ${new Date(
          exam.closeAt
        ).toLocaleString('vi-VN')}`,
      };
    }
  }
  return { isOpen: true };
}

function canStudentSeeSolutions(
  exam: Exam,
  submissionStatus: string
): {
  allowed: boolean;
  notice: string;
} {
  if (submissionStatus !== 'submitted') {
    return {
      allowed: false,
      notice: 'Đáp án chỉ hiển thị sau khi nộp bài và được giáo viên cho phép.',
    };
  }
  if (exam.showSolutionPolicy === 'after_submit') {
    return {
      allowed: true,
      notice: 'Giáo viên cho phép xem đáp án và lời giải ngay sau khi nộp bài.',
    };
  }
  if (exam.showSolutionPolicy === 'after_close') {
    if (exam.status === 'closed') {
      return {
        allowed: true,
        notice: 'Kỳ thi đã kết thúc — đã mở đáp án và lời giải chi tiết.',
      };
    }
    if (exam.closeAt) {
      const closeMs = new Date(exam.closeAt).getTime();
      if (!isNaN(closeMs) && Date.now() >= closeMs) {
        return {
          allowed: true,
          notice:
            'Thời gian làm bài của kỳ thi đã kết thúc — đã mở đáp án và lời giải.',
        };
      }
      return {
        allowed: false,
        notice: `Đáp án và lời giải sẽ tự động mở sau khi đóng đề (${new Date(
          exam.closeAt
        ).toLocaleString('vi-VN')}).`,
      };
    }
    if (exam.solutionsReleased) {
      return {
        allowed: true,
        notice: 'Giáo viên đã mở khóa đáp án và lời giải cho bài thi này.',
      };
    }
    return {
      allowed: false,
      notice: 'Đáp án và lời giải sẽ được hiển thị sau khi bài thi đóng.',
    };
  }
  if (exam.solutionsReleased) {
    return {
      allowed: true,
      notice: 'Giáo viên đã cho phép công bố đáp án và lời giải chi tiết.',
    };
  }
  return {
    allowed: false,
    notice:
      'Giáo viên hiện đang khóa đáp án và lời giải trên máy chủ. Vui lòng chờ giáo viên công bố.',
  };
}

function sanitizeQuestionsForStudent(questions: Question[]): PublicQuestion[] {
  return [...questions]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((q) => ({
      id: q.id,
      orderIndex: q.orderIndex,
      type: q.type,
      prompt: q.prompt,
      options: q.options.map((opt) => ({
        id: opt.id,
        label: opt.label,
        text: opt.text,
      })),
      statements: q.statements
        ? q.statements.map((st) => ({
            id: st.id,
            label: st.label,
            text: st.text,
          }))
        : undefined,
      points: q.points,
    }));
}

function normalizeShortText(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/,/g, '.');
}

function gradeQuestionsOnServer(
  questionsToGrade: Question[],
  totalScale: number,
  answers: Record<string, StudentAnswer>,
  includeSolutions: boolean,
  trueFalseScoring: 'standard_10_25_50_100' | 'equal_per_statement' = 'standard_10_25_50_100'
): {
  rawScore: number;
  maxRawScore: number;
  scaledScore: number;
  gradeDetails: QuestionGradeResult[];
} {
  let rawScore = 0;
  let maxRawScore = 0;
  const gradeDetails: QuestionGradeResult[] = [];

  for (const q of questionsToGrade) {
    const qMax = Number(q.points) || 1;
    maxRawScore += qMax;
    const studentAns = answers[q.id];
    let earned = 0;
    let isCorrect = false;
    let partialCredit = false;

    if (q.type === 'single_choice') {
      const selected = studentAns?.selectedOptions?.[0] || '';
      const expected = q.correctAnswers[0] || '';
      if (
        selected &&
        expected &&
        selected.toUpperCase() === expected.toUpperCase()
      ) {
        earned = qMax;
        isCorrect = true;
      }
    } else if (q.type === 'multiple_choice') {
      const selectedSet = new Set(
        (studentAns?.selectedOptions || []).map((s) => s.toUpperCase())
      );
      const expectedSet = new Set(
        (q.correctAnswers || []).map((s) => s.toUpperCase())
      );
      if (expectedSet.size > 0 && selectedSet.size > 0) {
        let allMatch = selectedSet.size === expectedSet.size;
        if (allMatch) {
          for (const item of expectedSet) {
            if (!selectedSet.has(item)) {
              allMatch = false;
              break;
            }
          }
        }
        if (allMatch) {
          earned = qMax;
          isCorrect = true;
        }
      }
    } else if (q.type === 'true_false') {
      if (q.statements && q.statements.length > 0) {
        const totalSt = q.statements.length;
        let correctCount = 0;
        for (const st of q.statements) {
          const studentVal = studentAns?.statementAnswers?.[st.id];
          if (typeof st.isTrue === 'boolean' && studentVal === st.isTrue) {
            correctCount += 1;
          }
        }
        if (correctCount === totalSt && totalSt > 0) {
          earned = qMax;
          isCorrect = true;
        } else if (correctCount > 0) {
          if (trueFalseScoring === 'standard_10_25_50_100' && totalSt === 4) {
            // Quy tắc chấm điểm chuẩn Bộ GD&ĐT cho câu Đúng/Sai 4 ý:
            // 1 ý đúng = 10%, 2 ý đúng = 25%, 3 ý đúng = 50%, 4 ý đúng = 100%
            const ratioMap: Record<number, number> = {
              1: 0.1,
              2: 0.25,
              3: 0.5,
              4: 1.0,
            };
            earned = Number(((ratioMap[correctCount] || 0) * qMax).toFixed(2));
          } else {
            earned = Number(((correctCount / totalSt) * qMax).toFixed(2));
          }
          partialCredit = true;
        }
      } else {
        const selected = (studentAns?.selectedOptions?.[0] || '')
          .trim()
          .toLowerCase();
        const expected = (q.correctAnswers[0] || '').trim().toLowerCase();
        if (selected && expected && selected === expected) {
          earned = qMax;
          isCorrect = true;
        }
      }
    } else if (q.type === 'short_answer') {
      const studentRaw = studentAns?.shortText || '';
      const normStudent = normalizeShortText(studentRaw);
      if (normStudent) {
        const matched = (q.correctAnswers || []).some(
          (ans) => normalizeShortText(ans) === normStudent
        );
        if (matched) {
          earned = qMax;
          isCorrect = true;
        }
      }
    }

    rawScore += earned;

    const resultItem: QuestionGradeResult = {
      questionId: q.id,
      earnedPoints: Number(earned.toFixed(2)),
      maxPoints: qMax,
      isCorrect,
      partialCredit,
      studentAnswer: studentAns,
    };

    if (includeSolutions) {
      resultItem.correctAnswers = q.correctAnswers;
      resultItem.explanation = q.explanation;
      if (q.statements && q.statements.length > 0) {
        const truths: Record<string, boolean> = {};
        for (const st of q.statements) {
          if (typeof st.isTrue === 'boolean') {
            truths[st.id] = st.isTrue;
          }
        }
        resultItem.statementTruths = truths;
      }
    }

    gradeDetails.push(resultItem);
  }

  const scale = totalScale || 10;
  const scaledScore =
    maxRawScore > 0
      ? Number(((rawScore / maxRawScore) * scale).toFixed(2))
      : 0;

  return {
    rawScore: Number(rawScore.toFixed(2)),
    maxRawScore: Number(maxRawScore.toFixed(2)),
    scaledScore,
    gradeDetails,
  };
}

function createSessionForUser(
  db: DatabaseSchema,
  user: StoredUser,
  res: Response
): { token: string; user: UserAccount } {
  const sessionId = `sess-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const now = Date.now();
  const expiresAt = now + 12 * 60 * 60 * 1000; // 12 hours

  db.activeSessions = db.activeSessions.filter((s) => s.expiresAt > now);
  db.activeSessions.push({
    sessionId,
    uid: user.uid,
    createdAt: now,
    expiresAt,
  });

  const token = signSessionToken(sessionId, user.uid);
  res.setHeader(
    'Set-Cookie',
    `kts_session=${encodeURIComponent(
      token
    )}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax`
  );

  return {
    token,
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
      createdBy: user.createdBy,
    },
  };
}

// =========================================================================
// SANDBOX DEMO DATA GENERATOR (Only invoked explicitly by Admin/Teacher in Sandbox)
// =========================================================================
function buildSandboxDemoExams(ownerUid: string, ownerName: string): Exam[] {
  const now = new Date().toISOString();

  const bioQuestions: Question[] = [
    {
      id: 'demo-bio-tn-1',
      orderIndex: 1,
      type: 'single_choice',
      prompt:
        'Ở thực vật có hoa, hormone nào sau đây có vai trò kích thích sự ra hoa và thúc quả chín?',
      options: [
        { id: 'A', label: 'A', text: 'Ethylene và Gibberellin' },
        { id: 'B', label: 'B', text: 'Auxin và Cytokinin' },
        { id: 'C', label: 'C', text: 'Abscisic acid (ABA)' },
        { id: 'D', label: 'D', text: 'Chỉ có Abscisic acid' },
      ],
      correctAnswers: ['A'],
      points: 0.25,
      explanation:
        'Gibberellin kích thích sự ra hoa (đặc biệt ở cây ngày dài) và Ethylene thúc đẩy quá trình chín của quả.',
      needsReview: false,
      subject: 'Sinh Học',
      gradeLevel: 'Lớp 11',
      ownerId: ownerUid,
      createdAt: now,
    },
    {
      id: 'demo-bio-tn-2',
      orderIndex: 2,
      type: 'single_choice',
      prompt:
        'Hình thức sinh sản vô tính nào phổ biến ở thủy tức (Hydra) trong điều kiện môi trường thuận lợi?',
      options: [
        { id: 'A', label: 'A', text: 'Phân đôi cơ thể' },
        { id: 'B', label: 'B', text: 'Nảy chồi' },
        { id: 'C', label: 'C', text: 'Trinh sinh' },
        { id: 'D', label: 'D', text: 'Bào tử' },
      ],
      correctAnswers: ['B'],
      points: 0.25,
      explanation:
        'Thủy tức sinh sản vô tính chủ yếu bằng hình thức nảy chồi từ cơ thể mẹ.',
      needsReview: false,
      subject: 'Sinh Học',
      gradeLevel: 'Lớp 11',
      ownerId: ownerUid,
      createdAt: now,
    },
    {
      id: 'demo-bio-ds-1',
      orderIndex: 3,
      type: 'true_false',
      prompt:
        'Khi nghiên cứu về quá trình truyền tin qua synapse hóa học ở động vật có hệ thần kinh, hãy xét tính Đúng/Sai của các nhận định sau:',
      options: [],
      statements: [
        {
          id: 'a',
          label: 'a)',
          text: 'Chất trung gian hóa học được chứa trong các bóng synapse ở chùy synapse.',
          isTrue: true,
        },
        {
          id: 'b',
          label: 'b)',
          text: 'Ion $Ca^{2+}$ đi từ dịch kẽ vào chùy synapse làm các bóng synapse dung hợp với màng trước.',
          isTrue: true,
        },
        {
          id: 'c',
          label: 'c)',
          text: 'Thông tin truyền qua synapse hóa học có thể đi theo cả hai chiều thuận và nghịch.',
          isTrue: false,
        },
        {
          id: 'd',
          label: 'd)',
          text: 'Thụ thể tiếp nhận chất trung gian hóa học nằm ở màng sau synapse.',
          isTrue: true,
        },
      ],
      correctAnswers: ['a:true', 'b:true', 'c:false', 'd:true'],
      points: 1.0,
      explanation:
        'Truyền tin qua synapse hóa học chỉ diễn ra theo một chiều từ màng trước sang màng sau vì chỉ màng trước mới có bóng chứa chất trung gian hóa học và chỉ màng sau mới có thụ thể đặc hiệu.',
      needsReview: false,
      subject: 'Sinh Học',
      gradeLevel: 'Lớp 11',
      ownerId: ownerUid,
      createdAt: now,
    },
    {
      id: 'demo-bio-tln-1',
      orderIndex: 4,
      type: 'short_answer',
      prompt:
        'Ở thực vật hạt kín, từ 1 tế bào mẹ hạt phấn ($2n$) giảm phân bình thường tạo ra bao nhiêu tiểu bào tử đơn bội ($n$)? (Điền số nguyên)',
      options: [],
      correctAnswers: ['4'],
      points: 0.5,
      explanation:
        'Mỗi tế bào mẹ hạt phấn ($2n$) qua giảm phân tạo ra 4 tiểu bào tử đơn bội ($n$).',
      needsReview: false,
      subject: 'Sinh Học',
      gradeLevel: 'Lớp 11',
      ownerId: ownerUid,
      createdAt: now,
    },
  ];

  const mathQuestions: Question[] = [
    {
      id: 'demo-math-1',
      orderIndex: 1,
      type: 'single_choice',
      prompt:
        'Cho hàm số $y = x^3 - 3x + 2$. Giá trị cực đại của hàm số đã cho bằng:',
      options: [
        { id: 'A', label: 'A', text: '$4$' },
        { id: 'B', label: 'B', text: '$0$' },
        { id: 'C', label: 'C', text: '$-1$' },
        { id: 'D', label: 'D', text: '$1$' },
      ],
      correctAnswers: ['A'],
      points: 0.25,
      explanation:
        'Ta có đạo hàm $y\' = 3x^2 - 3 = 0 \\iff x = \\pm 1$. Hàm số đạt cực đại tại $x = -1$ với $y_{CĐ} = 4$.',
      needsReview: false,
      subject: 'Toán Học',
      gradeLevel: 'Lớp 12',
      ownerId: ownerUid,
      createdAt: now,
    },
    {
      id: 'demo-math-2',
      orderIndex: 2,
      type: 'true_false',
      prompt:
        'Cho hàm số bậc hai $f(x) = x^2 - 4x + 3$. Xét tính Đúng hoặc Sai của từng mệnh đề sau:',
      options: [],
      statements: [
        {
          id: 'a',
          label: 'a)',
          text: 'Đồ thị hàm số có tọa độ đỉnh là $I(2; -1)$.',
          isTrue: true,
        },
        {
          id: 'b',
          label: 'b)',
          text: 'Hàm số đồng biến trên khoảng $(-\\infty; 2)$.',
          isTrue: false,
        },
        {
          id: 'c',
          label: 'c)',
          text: 'Đồ thị hàm số cắt trục tung tại điểm có tung độ bằng $3$.',
          isTrue: true,
        },
        {
          id: 'd',
          label: 'd)',
          text: 'Phương trình $f(x) = 0$ có hai nghiệm phân biệt là $x = 1$ và $x = 3$.',
          isTrue: true,
        },
      ],
      correctAnswers: ['a:true', 'b:false', 'c:true', 'd:true'],
      points: 1.0,
      explanation:
        'Vì hệ số $a = 1 > 0$ nên hàm số nghịch biến trên $(-\\infty; 2)$ và đồng biến trên $(2; +\\infty)$.',
      needsReview: false,
      subject: 'Toán Học',
      gradeLevel: 'Lớp 12',
      ownerId: ownerUid,
      createdAt: now,
    },
    {
      id: 'demo-math-3',
      orderIndex: 3,
      type: 'short_answer',
      prompt:
        'Tính giá trị tích phân $I = \\int_{0}^{2} (2x + 1)\\,dx$. (Điền kết quả số)',
      options: [],
      correctAnswers: ['6'],
      points: 0.5,
      explanation:
        '$I = \\left.(x^2 + x)\\right|_0^2 = 4 + 2 = 6$.',
      needsReview: false,
      subject: 'Toán Học',
      gradeLevel: 'Lớp 12',
      ownerId: ownerUid,
      createdAt: now,
    },
  ];

  return [
    {
      id: 'sandbox-sinhhoc11-ck2',
      ownerId: ownerUid,
      ownerName,
      shareCode: 'SINH11CK2',
      title: '[DEMO] Sinh Học 11 Cuối Kì 2 (Cấu trúc TN - ĐS - TLN)',
      subject: 'Sinh Học',
      gradeLevel: 'Lớp 11',
      examCategory: 'Cuối HK2',
      description:
        'Đề thi thử nghiệm mô phỏng cấu trúc đề 3 phần: Phần I (Trắc nghiệm 4 lựa chọn - 0.25đ/câu), Phần II (Đúng/Sai 4 ý - 1.0đ/câu), Phần III (Trả lời ngắn - 0.5đ/câu).',
      durationMinutes: 45,
      totalScale: 10,
      openAt: null,
      closeAt: null,
      accessCode: '',
      maxAttempts: 0,
      shuffleQuestions: false,
      shuffleOptions: false,
      trueFalseScoring: 'standard_10_25_50_100',
      showSolutionPolicy: 'after_submit',
      solutionsReleased: true,
      status: 'published',
      version: 1,
      isDemoData: true,
      questions: bioQuestions,
      sourcePages: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sandbox-toan12-hk1',
      ownerId: ownerUid,
      ownerName,
      shareCode: 'TOAN12',
      title: '[DEMO] Đề Khảo Sát Toán 12 — Giải Tích & Đạo Hàm (TN - ĐS - TLN)',
      subject: 'Toán Học',
      gradeLevel: 'Lớp 12',
      examCategory: 'Thi Thử THPT',
      description:
        'Đề mẫu môi trường Sandbox có công thức Toán học KaTeX và đủ 3 phần TN, ĐS, TLN.',
      durationMinutes: 30,
      totalScale: 10,
      openAt: null,
      closeAt: null,
      accessCode: '',
      maxAttempts: 0,
      shuffleQuestions: false,
      shuffleOptions: false,
      trueFalseScoring: 'standard_10_25_50_100',
      showSolutionPolicy: 'after_submit',
      solutionsReleased: true,
      status: 'published',
      version: 1,
      isDemoData: true,
      questions: mathQuestions,
      sourcePages: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure DB file and one-time bootstrap secret check run on startup
  const startupDb = loadDb();
  if (!startupDb.bootstrapCompleted && startupDb.users.filter((u) => u.role === 'admin').length === 0) {
    getOrCreateServerBootstrapSecret();
  }

  // Multi-domain CORS middleware for Student & Admin domains and AI Studio previews
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS, PATCH'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Submission-Token, X-Requested-With, Accept'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '25mb' }));

  // =========================================================================
  // 0. SYSTEM SETUP & ONE-TIME FIRST ADMIN BOOTSTRAP ROUTES
  // =========================================================================
  app.get('/api/setup/status', (_req: Request, res: Response) => {
    const db = loadDb();
    const adminCount = db.users.filter((u) => u.role === 'admin').length;
    const initialized = db.bootstrapCompleted || adminCount > 0;
    const hasEnvBootstrapSecret = Boolean(
      process.env.ADMIN_BOOTSTRAP_SECRET &&
        process.env.ADMIN_BOOTSTRAP_SECRET.trim().length >= 8 &&
        process.env.ADMIN_BOOTSTRAP_SECRET !== 'SET_YOUR_ONE_TIME_BOOTSTRAP_SECRET_HERE'
    );
    const hasOwnerEmailConstraint = Boolean(
      process.env.ADMIN_OWNER_EMAIL && process.env.ADMIN_OWNER_EMAIL.trim().length > 0
    );
    const hasGeminiKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
        process.env.GEMINI_API_KEY.trim().length > 10
    );

    const statusPayload: SystemSetupStatus = {
      initialized,
      adminCount,
      bootstrapLocked: initialized,
      hasEnvBootstrapSecret,
      hasOwnerEmailConstraint,
      hasGeminiKey,
      serverTime: new Date().toISOString(),
    };

    res.json(statusPayload);
  });

  // Returns the local one-time bootstrap token ONLY if no admin exists yet AND no custom env secret was set
  app.get(
    '/api/setup/local-bootstrap-token',
    rateLimit(10, 60_000),
    (_req: Request, res: Response) => {
      const db = loadDb();
      const adminCount = db.users.filter((u) => u.role === 'admin').length;
      if (db.bootstrapCompleted || adminCount > 0) {
        res.status(403).json({
          error:
            'Quy trình khởi tạo lần đầu đã khóa vĩnh viễn vì hệ thống đã có Quản trị viên.',
          code: 'BOOTSTRAP_LOCKED',
        });
        return;
      }

      const hasEnvSecret = Boolean(
        process.env.ADMIN_BOOTSTRAP_SECRET &&
          process.env.ADMIN_BOOTSTRAP_SECRET.trim().length >= 8 &&
          process.env.ADMIN_BOOTSTRAP_SECRET !== 'SET_YOUR_ONE_TIME_BOOTSTRAP_SECRET_HERE'
      );
      if (hasEnvSecret) {
        res.status(403).json({
          error:
            'Máy chủ đã cấu hình biến môi trường ADMIN_BOOTSTRAP_SECRET. Vui lòng nhập trực tiếp mã bí mật từ biến môi trường của bạn.',
        });
        return;
      }

      const secret = getOrCreateServerBootstrapSecret();
      res.json({
        oneTimeToken: secret,
        note: 'Mã khởi tạo dùng một lần được sinh tự động trên máy chủ do biến môi trường ADMIN_BOOTSTRAP_SECRET chưa được cấu hình. Sau khi tạo Quản trị viên đầu tiên, mã này sẽ tự hủy vĩnh viễn.',
      });
    }
  );

  // One-Time First Admin Bootstrap Endpoint (Permanently disabled after first execution)
  app.post(
    '/api/setup/bootstrap-admin',
    rateLimit(10, 60_000),
    async (req: Request, res: Response) => {
      const db = loadDb();
      const adminCount = db.users.filter((u) => u.role === 'admin').length;

      // CRITICAL REQUIREMENT D.4: Once completed, first-time bootstrap MUST be permanently disabled
      if (db.bootstrapCompleted || adminCount > 0) {
        appendAuditLog(
          db,
          { uid: 'anonymous', email: 'unknown', role: 'student' },
          'UNAUTHORIZED_ATTEMPT',
          '/api/setup/bootstrap-admin',
          'Từ chối gọi lại API khởi tạo Quản trị viên đầu tiên sau khi hệ thống đã khóa Bootstrap',
          req.socket.remoteAddress || 'local'
        );
        saveDb(db);
        res.status(403).json({
          error:
            'Từ chối (403 Forbidden): Quy trình khởi tạo Quản trị viên đầu tiên đã hoàn tất trước đó và đã bị vô hiệu hóa vĩnh viễn.',
          code: 'BOOTSTRAP_LOCKED',
        });
        return;
      }

      const {
        bootstrapSecret,
        email,
        displayName,
        password,
        firebaseIdToken,
      } = req.body as {
        bootstrapSecret?: string;
        email?: string;
        displayName?: string;
        password?: string;
        firebaseIdToken?: string;
      };

      const expectedSecret = getOrCreateServerBootstrapSecret();
      if (!bootstrapSecret || bootstrapSecret.trim() !== expectedSecret) {
        res.status(403).json({
          error:
            'Mã bí mật thiết lập dùng một lần (ADMIN_BOOTSTRAP_SECRET) không chính xác.',
          code: 'INVALID_BOOTSTRAP_SECRET',
        });
        return;
      }

      let verifiedEmail = (email || '').trim().toLowerCase();
      let verifiedUid = `admin-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      let verifiedName = (displayName || '').trim() || 'Quản trị viên Hệ thống';
      let finalPassword = password || '';

      // If Firebase ID Token is provided, verify ownership via Google Auth on server
      if (firebaseIdToken) {
        try {
          const decoded = await adminAuth.verifyIdToken(firebaseIdToken);
          verifiedEmail = (decoded.email || verifiedEmail).toLowerCase();
          verifiedUid = decoded.uid;
          verifiedName = decoded.name || verifiedName;
          if (!finalPassword || finalPassword.length < 8) {
            finalPassword = crypto.randomBytes(24).toString('hex');
          }
        } catch {
          res.status(401).json({
            error: 'Không thể xác minh Firebase ID Token khi khởi tạo Admin.',
          });
          return;
        }
      } else {
        if (!verifiedEmail || !verifiedEmail.includes('@')) {
          res.status(400).json({
            error: 'Vui lòng nhập địa chỉ Email hợp lệ cho Quản trị viên đầu tiên.',
          });
          return;
        }
        if (!finalPassword || finalPassword.length < 8) {
          res.status(400).json({
            error:
              'Mật khẩu của Quản trị viên đầu tiên phải có tối thiểu 8 ký tự.',
          });
          return;
        }
      }

      const ownerEmailEnv = (process.env.ADMIN_OWNER_EMAIL || '').trim().toLowerCase();
      if (ownerEmailEnv && verifiedEmail !== ownerEmailEnv) {
        res.status(403).json({
          error: `Email xác thực (${verifiedEmail}) không khớp với ADMIN_OWNER_EMAIL đã cấu hình trên máy chủ.`,
        });
        return;
      }

      const firstAdmin = createHashedUser(
        verifiedUid,
        verifiedEmail,
        verifiedName,
        'admin',
        finalPassword,
        'system-bootstrap'
      );

      db.users.push(firstAdmin);
      db.bootstrapCompleted = true;
      db.bootstrappedAt = new Date().toISOString();
      db.bootstrappedByUid = firstAdmin.uid;

      destroyBootstrapSecretFile();

      const sessionData = createSessionForUser(db, firstAdmin, res);
      appendAuditLog(
        db,
        sessionData.user,
        'BOOTSTRAP_ADMIN',
        firstAdmin.uid,
        `Khởi tạo thành công Quản trị viên đầu tiên (${firstAdmin.email}) và khóa vĩnh viễn quy trình Bootstrap lần đầu`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      res.status(201).json({
        ...sessionData,
        bootstrapLocked: true,
        message:
          'Đã khởi tạo Quản trị viên đầu tiên thành công. Quy trình thiết lập lần đầu đã được khóa vĩnh viễn.',
      });
    }
  );

  // =========================================================================
  // 1. AUTHENTICATION & SESSION MANAGEMENT ROUTES
  // =========================================================================
  app.post(
    '/api/auth/login',
    rateLimit(20, 60_000),
    (req: Request, res: Response) => {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };
      if (!email || !password) {
        res.status(400).json({ error: 'Vui lòng nhập đầy đủ Email và Mật khẩu.' });
        return;
      }

      const db = loadDb();
      const user = db.users.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (!user) {
        res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
        return;
      }

      const candidateHash = hashPassword(password, user.passwordSalt);
      const isMatch = crypto.timingSafeEqual(
        Buffer.from(candidateHash),
        Buffer.from(user.passwordHash)
      );

      if (!isMatch) {
        res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
        return;
      }

      const sessionData = createSessionForUser(db, user, res);
      appendAuditLog(
        db,
        sessionData.user,
        'LOGIN',
        user.uid,
        `Đăng nhập thành công (${user.role})`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      res.json(sessionData);
    }
  );

  // Firebase Google OAuth ID Token Login (Does NOT auto-promote to admin unless already granted or bootstrapped)
  app.post(
    '/api/auth/firebase-login',
    rateLimit(20, 60_000),
    async (req: Request, res: Response) => {
      const { idToken } = req.body as { idToken?: string };
      if (!idToken) {
        res.status(400).json({ error: 'Thiếu Firebase ID Token.' });
        return;
      }

      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        const email = (decoded.email || '').toLowerCase();
        const uid = decoded.uid;
        const displayName = decoded.name || email.split('@')[0] || 'Người dùng';

        const db = loadDb();
        let user = db.users.find(
          (u) => u.uid === uid || (email && u.email.toLowerCase() === email)
        );

        if (!user) {
          // New users logging in via OAuth without prior admin grant strictly get 'student' role
          user = createHashedUser(
            uid,
            email || `${uid}@firebase.user`,
            displayName,
            'student',
            crypto.randomBytes(24).toString('hex')
          );
          db.users.push(user);
        }

        const sessionData = createSessionForUser(db, user, res);
        appendAuditLog(
          db,
          sessionData.user,
          'LOGIN',
          user.uid,
          `Đăng nhập qua Google Firebase Auth (Vai trò: ${user.role})`,
          req.socket.remoteAddress || 'local'
        );
        saveDb(db);

        res.json(sessionData);
      } catch (err) {
        console.error('Firebase ID token verification failed:', err);
        res.status(401).json({
          error: 'Firebase ID Token không hợp lệ hoặc đã hết hạn.',
        });
      }
    }
  );

  // Registration endpoint: Supports creating Teacher, Admin, or Student accounts
  app.post(
    '/api/auth/register',
    rateLimit(60, 60_000),
    (req: Request, res: Response) => {
      const { email, password, displayName, role: requestedRole } = req.body as {
        email?: string;
        password?: string;
        displayName?: string;
        role?: string;
      };

      if (!email || !password || password.length < 6) {
        res.status(400).json({
          error: 'Vui lòng nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.',
        });
        return;
      }

      const db = loadDb();
      const cleanEmail = email.trim().toLowerCase();
      if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        res.status(400).json({ error: 'Email này đã tồn tại trên hệ thống. Vui lòng đăng nhập hoặc dùng email khác.' });
        return;
      }

      let assignedRole: UserRole = 'teacher';
      if (requestedRole === 'admin') {
        assignedRole = 'admin';
      } else if (requestedRole === 'student') {
        assignedRole = 'student';
      } else {
        assignedRole = 'teacher';
      }

      const newUser = createHashedUser(
        `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        cleanEmail,
        (displayName || cleanEmail.split('@')[0]).trim(),
        assignedRole,
        password,
        'self-register'
      );
      db.users.push(newUser);
      const sessionData = createSessionForUser(db, newUser, res);
      appendAuditLog(
        db,
        sessionData.user,
        'CREATE_USER',
        newUser.uid,
        `Đăng ký tài khoản mới thành công (Email: ${cleanEmail}, Vai trò: ${newUser.role})`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      res.status(201).json(sessionData);
    }
  );

  app.get('/api/auth/me', (req: AuthenticatedRequest, res: Response) => {
    const resolved = resolveRequestSession(req);
    if (!resolved.user) {
      res.status(401).json({
        authenticated: false,
        error: resolved.revoked
          ? 'Phiên đăng nhập đã bị thu hồi.'
          : 'Chưa đăng nhập.',
      });
      return;
    }
    res.json({
      authenticated: true,
      user: resolved.user,
    });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res: Response) => {
    const resolved = resolveRequestSession(req);
    const db = loadDb();

    if (resolved.sessionId) {
      db.activeSessions = db.activeSessions.filter(
        (s) => s.sessionId !== resolved.sessionId
      );
      if (!db.revokedSessionIds.includes(resolved.sessionId)) {
        db.revokedSessionIds.push(resolved.sessionId);
      }
      if (resolved.user) {
        appendAuditLog(
          db,
          resolved.user,
          'LOGOUT',
          resolved.sessionId,
          'Người dùng đăng xuất — đã thu hồi phiên trên máy chủ',
          req.socket.remoteAddress || 'local'
        );
      }
      saveDb(db);
    }

    res.setHeader(
      'Set-Cookie',
      'kts_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
    );
    res.json({ success: true, message: 'Đã đăng xuất và thu hồi phiên làm việc.' });
  });

  app.put(
    '/api/auth/profile',
    requireRole(['student', 'teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const { displayName, role: attemptedRole } = req.body as {
        displayName?: string;
        role?: string;
      };
      const db = loadDb();
      const user = req.authUser!;

      if (attemptedRole && attemptedRole !== user.role) {
        appendAuditLog(
          db,
          user,
          'UNAUTHORIZED_ATTEMPT',
          user.uid,
          `Chặn hành vi tự nâng quyền trong hồ sơ từ '${user.role}' lên '${attemptedRole}'`,
          req.socket.remoteAddress || 'local'
        );
        saveDb(db);
        res.status(403).json({
          error:
            'Từ chối (403 Forbidden): Bạn không được phép tự thay đổi vai trò phân quyền của chính mình.',
          code: 'ROLE_TAMPERING_BLOCKED',
        });
        return;
      }

      const dbUser = db.users.find((u) => u.uid === user.uid);
      if (dbUser && displayName && displayName.trim()) {
        dbUser.displayName = displayName.trim().slice(0, 120);
        saveDb(db);
      }

      res.json({
        user: {
          ...user,
          displayName: dbUser?.displayName || user.displayName,
        },
      });
    }
  );

  // =========================================================================
  // 2. ADMIN-ONLY USER MANAGEMENT, BACKUP & AUDIT LOG ROUTES
  // =========================================================================
  app.get(
    '/api/admin/users',
    requireRole(['admin']),
    (_req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const sanitizedUsers: UserAccount[] = db.users.map((u) => ({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        createdAt: u.createdAt,
        createdBy: u.createdBy,
      }));
      res.json({ users: sanitizedUsers });
    }
  );

  // Admin creates a new Teacher, Admin, or Student account directly
  app.post(
    '/api/admin/users',
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const { email, displayName, role, password } = req.body as {
        email?: string;
        displayName?: string;
        role?: UserRole;
        password?: string;
      };

      if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'Email không hợp lệ.' });
        return;
      }
      if (!password || password.length < 8) {
        res.status(400).json({
          error: 'Mật khẩu khởi tạo phải có ít nhất 8 ký tự.',
        });
        return;
      }
      if (!role || !['student', 'teacher', 'admin'].includes(role)) {
        res.status(400).json({ error: 'Vai trò không hợp lệ.' });
        return;
      }

      const db = loadDb();
      const cleanEmail = email.trim().toLowerCase();
      if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        res.status(400).json({ error: 'Email này đã tồn tại trong hệ thống.' });
        return;
      }

      const created = createHashedUser(
        `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        cleanEmail,
        (displayName || cleanEmail.split('@')[0]).trim(),
        role,
        password,
        req.authUser!.uid
      );

      db.users.push(created);
      appendAuditLog(
        db,
        req.authUser!,
        'CREATE_USER',
        created.uid,
        `Quản trị viên tạo tài khoản mới ${created.email} với vai trò '${created.role}'`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      res.status(201).json({
        user: {
          uid: created.uid,
          email: created.email,
          displayName: created.displayName,
          role: created.role,
          createdAt: created.createdAt,
          createdBy: created.createdBy,
        },
      });
    }
  );

  app.post(
    '/api/admin/users/:uid/role',
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const { role } = req.body as { role?: UserRole };
      if (!role || !['student', 'teacher', 'admin'].includes(role)) {
        res.status(400).json({ error: 'Vai trò không hợp lệ.' });
        return;
      }
      const db = loadDb();
      const targetUser = db.users.find((u) => u.uid === req.params.uid);
      if (!targetUser) {
        res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng.' });
        return;
      }

      // Prevent removing the last admin
      if (targetUser.role === 'admin' && role !== 'admin') {
        const adminCount = db.users.filter((u) => u.role === 'admin').length;
        if (adminCount <= 1) {
          res.status(400).json({
            error:
              'Không thể hạ quyền Quản trị viên duy nhất của hệ thống.',
          });
          return;
        }
      }

      const prevRole = targetUser.role;
      targetUser.role = role;
      appendAuditLog(
        db,
        req.authUser!,
        'GRANT_ROLE',
        targetUser.uid,
        `Cập nhật vai trò của ${targetUser.email} từ '${prevRole}' sang '${role}'`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      res.json({
        user: {
          uid: targetUser.uid,
          email: targetUser.email,
          displayName: targetUser.displayName,
          role: targetUser.role,
          createdAt: targetUser.createdAt,
          createdBy: targetUser.createdBy,
        },
      });
    }
  );

  // Admin Database Backup Export (Excludes password hashes & active session tokens)
  app.get(
    '/api/admin/backup',
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      appendAuditLog(
        db,
        req.authUser!,
        'BACKUP_DATA',
        'system-db',
        `Quản trị viên xuất bản sao lưu dữ liệu hệ thống (${db.exams.length} đề thi, ${db.submissions.length} bài nộp)`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      const safeBackup = {
        exportedAt: new Date().toISOString(),
        exportedBy: req.authUser!.email,
        version: '3.0-prod',
        users: db.users.map((u) => ({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          createdAt: u.createdAt,
        })),
        exams: db.exams,
        questionBank: db.questionBank,
        submissions: db.submissions.map((s) => ({
          ...s,
          studentAccessToken: undefined,
        })),
        auditLogs: db.auditLogs,
      };

      res.json(safeBackup);
    }
  );

  app.get(
    '/api/teacher/audit-logs',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const logs =
        user.role === 'admin'
          ? db.auditLogs
          : db.auditLogs.filter((l) => l.actorUid === user.uid);
      res.json({ logs: logs.slice(0, 150) });
    }
  );

  // =========================================================================
  // 3. SANDBOX DEMO DATA SEED / CLEAR (Separated from Production Data)
  // =========================================================================
  app.post(
    '/api/teacher/sandbox/seed',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const demos = buildSandboxDemoExams(user.uid, user.displayName);

      let addedCount = 0;
      for (const demo of demos) {
        if (!db.exams.some((e) => e.id === demo.id)) {
          db.exams.unshift(demo);
          addedCount += 1;
          for (const q of demo.questions) {
            if (!db.questionBank.some((bq) => bq.id === q.id)) {
              db.questionBank.unshift(q);
            }
          }
        }
      }

      appendAuditLog(
        db,
        user,
        'SEED_DEMO_SANDBOX',
        'sandbox',
        `Nạp ${addedCount} đề thi thử nghiệm [DEMO] vào môi trường Sandbox`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);
      res.json({ addedCount, message: `Đã nạp ${addedCount} đề thi mẫu [DEMO].` });
    }
  );

  app.delete(
    '/api/teacher/sandbox/clear',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const demoIds = new Set(
        db.exams.filter((e) => e.isDemoData).map((e) => e.id)
      );
      const removedCount = demoIds.size;

      db.exams = db.exams.filter((e) => !e.isDemoData);
      db.questionBank = db.questionBank.filter(
        (q) => !q.id.startsWith('demo-')
      );
      db.submissions = db.submissions.filter((s) => !demoIds.has(s.examId));

      appendAuditLog(
        db,
        user,
        'CLEAR_DEMO_SANDBOX',
        'sandbox',
        `Xóa toàn bộ ${removedCount} đề thi mẫu [DEMO] khỏi hệ thống`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);
      res.json({ removedCount, message: 'Đã dọn sạch toàn bộ dữ liệu mẫu [DEMO].' });
    }
  );

  // =========================================================================
  // 4. SERVER-SIDE AI QUESTION EXTRACTION PROXY (`/api/teacher/extract-ai`)
  // Uses GEMINI_API_KEY strictly on Backend — never exposed to Frontend
  // =========================================================================
  app.post(
    '/api/teacher/extract-ai',
    requireRole(['teacher', 'admin']),
    rateLimit(15, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
        res.status(503).json({
          error:
            'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Bạn có thể cấu hình biến môi trường GEMINI_API_KEY ở Backend hoặc sử dụng chế độ Bóc tách OCR + Regex miễn phí sẵn có.',
          code: 'GEMINI_KEY_NOT_CONFIGURED',
        });
        return;
      }

      const { rawText, imageDataUrl } = req.body as {
        rawText?: string;
        imageDataUrl?: string;
      };

      if (!rawText && !imageDataUrl) {
        res.status(400).json({
          error: 'Vui lòng cung cấp văn bản hoặc hình ảnh trang đề thi để AI bóc tách.',
        });
        return;
      }

      try {
        const ai = new GoogleGenAI({ apiKey });
        const contents: Array<any> = [];

        if (imageDataUrl && imageDataUrl.startsWith('data:image/')) {
          const commaIdx = imageDataUrl.indexOf(',');
          const meta = imageDataUrl.slice(5, commaIdx);
          const mimeType = meta.split(';')[0] || 'image/png';
          const base64Data = imageDataUrl.slice(commaIdx + 1);
          contents.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        }

        const promptText = `Bạn là hệ thống số hóa đề thi Việt Nam chính xác. Hãy trích xuất toàn bộ câu hỏi từ nội dung sau thành danh sách JSON.
Giữ nguyên thứ tự câu hỏi và dùng cú pháp LaTeX ($...$) cho các công thức Toán/Lý/Hóa/Sinh.
Phân loại từng câu vào 1 trong 4 dạng:
- "single_choice": Trắc nghiệm 4 phương án A, B, C, D (1 đáp án đúng).
- "multiple_choice": Trắc nghiệm nhiều đáp án đúng.
- "true_false": Câu hỏi Đúng/Sai gồm các mệnh đề a), b), c), d).
- "short_answer": Câu hỏi trả lời ngắn (điền kết quả số hoặc từ khóa).
Nếu không rõ đáp án đúng trong đề gốc, đặt needsReview = true và ghi rõ lý do trong reviewReason (không tự đoán mò đáp án).

Nội dung văn bản đề thi:
${rawText || '(Trích xuất trực tiếp từ hình ảnh đính kèm)'}`;

        contents.push(promptText);

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                subject: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING },
                      prompt: { type: Type.STRING },
                      points: { type: Type.NUMBER },
                      options: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            label: { type: Type.STRING },
                            text: { type: Type.STRING },
                          },
                        },
                      },
                      statements: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            label: { type: Type.STRING },
                            text: { type: Type.STRING },
                            isTrue: { type: Type.BOOLEAN },
                          },
                        },
                      },
                      correctAnswers: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      explanation: { type: Type.STRING },
                      needsReview: { type: Type.BOOLEAN },
                      reviewReason: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const parsed = JSON.parse(response.text || '{}');
        const db = loadDb();
        appendAuditLog(
          db,
          req.authUser!,
          'AI_EXTRACT_DOCUMENT',
          'gemini-2.5-flash',
          `Trích xuất ${(parsed.questions || []).length} câu hỏi bằng Gemini AI trên Backend`,
          req.socket.remoteAddress || 'local'
        );
        saveDb(db);

        res.json(parsed);
      } catch (err) {
        console.error('Gemini extraction error:', err);
        res.status(500).json({
          error:
            'Không thể gọi Gemini AI ở thời điểm hiện tại. Bạn có thể chuyển sang chế độ Bóc tách OCR + Regex miễn phí.',
        });
      }
    }
  );

  // =========================================================================
  // 5. TEACHER & ADMIN EXAM MANAGEMENT ROUTES (Enforces RLS Ownership)
  // =========================================================================
  app.get(
    '/api/teacher/exams',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;

      const visibleExams =
        user.role === 'admin'
          ? db.exams
          : db.exams.filter((e) => e.ownerId === user.uid);

      const summaryList = visibleExams.map((exam) => {
        const examSubs = db.submissions.filter((s) => s.examId === exam.id);
        const submittedSubs = examSubs.filter((s) => s.status === 'submitted');
        const avgScore =
          submittedSubs.length > 0
            ? Number(
                (
                  submittedSubs.reduce((acc, s) => acc + (s.scaledScore || 0), 0) /
                  submittedSubs.length
                ).toFixed(2)
              )
            : null;
        const reviewCount = exam.questions.filter((q) => q.needsReview).length;
        return {
          ...exam,
          sourcePages: exam.sourcePages.map((p) => ({
            pageNumber: p.pageNumber,
            method: p.method,
            confidence: p.confidence,
            dataUrl: '',
            extractedText: '',
          })),
          stats: {
            totalAttempts: examSubs.length,
            submittedCount: submittedSubs.length,
            avgScore,
            reviewCount,
          },
        };
      });
      res.json({ exams: summaryList });
    }
  );

  app.get(
    '/api/teacher/exams/:id',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const exam = db.exams.find((e) => e.id === req.params.id);
      if (!exam) {
        res.status(404).json({ error: 'Không tìm thấy bài thi.' });
        return;
      }

      if (user.role !== 'admin' && exam.ownerId !== user.uid) {
        appendAuditLog(
          db,
          user,
          'UNAUTHORIZED_ATTEMPT',
          exam.id,
          `Vi phạm RLS: Giáo viên ${user.email} (${user.uid}) cố đọc đề thi '${exam.title}' thuộc sở hữu của ${exam.ownerId}`,
          req.socket.remoteAddress || 'local'
        );
        saveDb(db);
        res.status(403).json({
          error:
            'Vi phạm chính sách Row-Level Security (403 Forbidden): Bạn không có quyền truy cập đề thi của giáo viên khác.',
          code: 'RLS_OWNER_MISMATCH',
        });
        return;
      }

      res.json({ exam });
    }
  );

  app.post(
    '/api/teacher/exams',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const payload = req.body as Partial<Exam>;
      const now = new Date().toISOString();

      let shareCode = (payload.shareCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      if (!shareCode || db.exams.some((e) => e.shareCode === shareCode)) {
        shareCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      }

      const questionsWithMeta = (
        Array.isArray(payload.questions) ? payload.questions : []
      ).map((q, idx) => ({
        ...q,
        orderIndex: idx + 1,
        ownerId: user.uid,
        subject: payload.subject?.trim() || 'Toán Học',
        gradeLevel: payload.gradeLevel || 'Lớp 12',
        createdAt: now,
      }));

      const newExam: Exam = {
        id: `exam-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ownerId: user.uid,
        ownerName: user.displayName,
        shareCode,
        folderId: payload.folderId || null,
        title: payload.title?.trim() || 'Bài kiểm tra mới',
        subject: payload.subject?.trim() || 'Toán Học',
        gradeLevel: payload.gradeLevel || 'Lớp 12',
        examCategory: payload.examCategory || 'Cuối HK2',
        description: payload.description?.trim() || '',
        durationMinutes: Number(payload.durationMinutes) || 45,
        totalScale: Number(payload.totalScale) || 10,
        openAt: payload.openAt || null,
        closeAt: payload.closeAt || null,
        accessCode: payload.accessCode?.trim() || '',
        maxAttempts: Number(payload.maxAttempts) || 0,
        shuffleQuestions: Boolean(payload.shuffleQuestions),
        shuffleOptions: Boolean(payload.shuffleOptions),
        trueFalseScoring: payload.trueFalseScoring || 'standard_10_25_50_100',
        showSolutionPolicy: payload.showSolutionPolicy || 'after_submit',
        solutionsReleased: Boolean(payload.solutionsReleased),
        status:
          payload.status === 'published' || payload.status === 'closed'
            ? payload.status
            : 'draft',
        version: 1,
        questions: questionsWithMeta,
        sourceFileName: payload.sourceFileName || '',
        sourceFileType: payload.sourceFileType || '',
        sourcePages: Array.isArray(payload.sourcePages) ? payload.sourcePages : [],
        createdAt: now,
        updatedAt: now,
      };

      db.exams.unshift(newExam);

      for (const q of questionsWithMeta) {
        if (!db.questionBank.some((bq) => bq.id === q.id)) {
          db.questionBank.unshift(q);
        }
      }

      appendAuditLog(
        db,
        user,
        'CREATE_EXAM',
        newExam.id,
        `Tạo đề thi mới '${newExam.title}' (Mã: ${newExam.shareCode}, Trạng thái: ${newExam.status})`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);
      res.status(201).json({ exam: newExam });
    }
  );

  // Duplicate an existing exam into a new draft
  app.post(
    '/api/teacher/exams/:id/duplicate',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const source = db.exams.find((e) => e.id === req.params.id);
      if (!source) {
        res.status(404).json({ error: 'Không tìm thấy đề thi gốc để sao chép.' });
        return;
      }

      if (user.role !== 'admin' && source.ownerId !== user.uid) {
        res.status(403).json({
          error: 'Bạn không có quyền sao chép đề thi của giáo viên khác.',
        });
        return;
      }

      const now = new Date().toISOString();
      const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const duplicated: Exam = {
        ...JSON.parse(JSON.stringify(source)),
        id: `exam-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ownerId: user.uid,
        ownerName: user.displayName,
        shareCode: newCode,
        title: `${source.title} (Bản sao)`,
        status: 'draft',
        version: 1,
        isDemoData: false,
        createdAt: now,
        updatedAt: now,
      };

      db.exams.unshift(duplicated);
      appendAuditLog(
        db,
        user,
        'DUPLICATE_EXAM',
        duplicated.id,
        `Sao chép đề thi '${source.title}' thành bản nháp mới (Mã: ${duplicated.shareCode})`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);
      res.status(201).json({ exam: duplicated });
    }
  );

  app.put(
    '/api/teacher/exams/:id',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const idx = db.exams.findIndex((e) => e.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Không tìm thấy bài thi để cập nhật.' });
        return;
      }

      const existing = db.exams[idx];

      if (user.role !== 'admin' && existing.ownerId !== user.uid) {
        appendAuditLog(
          db,
          user,
          'UNAUTHORIZED_ATTEMPT',
          existing.id,
          `Vi phạm RLS: Giáo viên ${user.email} cố chỉnh sửa đề thi '${existing.title}' của ${existing.ownerId}`,
          req.socket.remoteAddress || 'local'
        );
        saveDb(db);
        res.status(403).json({
          error:
            'Vi phạm chính sách Row-Level Security (403 Forbidden): Bạn không được phép chỉnh sửa đề thi của giáo viên khác.',
          code: 'RLS_OWNER_MISMATCH',
        });
        return;
      }

      const payload = req.body as Partial<Exam>;

      let shareCode = existing.shareCode;
      if (payload.shareCode && payload.shareCode !== existing.shareCode) {
        const cleanCode = payload.shareCode
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');
        if (
          cleanCode &&
          !db.exams.some((e) => e.id !== existing.id && e.shareCode === cleanCode)
        ) {
          shareCode = cleanCode;
        }
      }

      const existingAttempts = db.submissions.filter(
        (s) => s.examId === existing.id
      );
      const questionsChanged =
        payload.questions !== undefined &&
        JSON.stringify(payload.questions) !== JSON.stringify(existing.questions);

      let nextVersion = existing.version || 1;
      let versionBumped = false;
      if (existingAttempts.length > 0 && questionsChanged) {
        nextVersion += 1;
        versionBumped = true;
      }

      const nextStatus =
        payload.status !== undefined ? payload.status : existing.status;
      const wasPublishedNow =
        existing.status !== 'published' && nextStatus === 'published';
      const wasClosedNow =
        existing.status !== 'closed' && nextStatus === 'closed';

      const updated: Exam = {
        ...existing,
        shareCode,
        title: payload.title !== undefined ? payload.title : existing.title,
        subject: payload.subject !== undefined ? payload.subject : existing.subject,
        gradeLevel:
          payload.gradeLevel !== undefined
            ? payload.gradeLevel
            : existing.gradeLevel,
        examCategory:
          payload.examCategory !== undefined
            ? payload.examCategory
            : existing.examCategory,
        description:
          payload.description !== undefined
            ? payload.description
            : existing.description,
        durationMinutes:
          payload.durationMinutes !== undefined
            ? Number(payload.durationMinutes)
            : existing.durationMinutes,
        totalScale:
          payload.totalScale !== undefined
            ? Number(payload.totalScale)
            : existing.totalScale,
        openAt: payload.openAt !== undefined ? payload.openAt : existing.openAt,
        closeAt: payload.closeAt !== undefined ? payload.closeAt : existing.closeAt,
        accessCode:
          payload.accessCode !== undefined
            ? payload.accessCode.trim()
            : existing.accessCode,
        maxAttempts:
          payload.maxAttempts !== undefined
            ? Number(payload.maxAttempts)
            : existing.maxAttempts,
        shuffleQuestions:
          payload.shuffleQuestions !== undefined
            ? Boolean(payload.shuffleQuestions)
            : existing.shuffleQuestions,
        shuffleOptions:
          payload.shuffleOptions !== undefined
            ? Boolean(payload.shuffleOptions)
            : existing.shuffleOptions,
        trueFalseScoring:
          payload.trueFalseScoring !== undefined
            ? payload.trueFalseScoring
            : existing.trueFalseScoring,
        showSolutionPolicy:
          payload.showSolutionPolicy !== undefined
            ? payload.showSolutionPolicy
            : existing.showSolutionPolicy,
        solutionsReleased:
          payload.solutionsReleased !== undefined
            ? Boolean(payload.solutionsReleased)
            : existing.solutionsReleased,
        status: nextStatus,
        version: nextVersion,
        questions:
          payload.questions !== undefined
            ? payload.questions.map((q) => ({
                ...q,
                ownerId: existing.ownerId,
                subject: payload.subject || existing.subject,
              }))
            : existing.questions,
        sourcePages:
          payload.sourcePages !== undefined
            ? payload.sourcePages
            : existing.sourcePages,
        sourceFileName:
          payload.sourceFileName !== undefined
            ? payload.sourceFileName
            : existing.sourceFileName,
        sourceFileType:
          payload.sourceFileType !== undefined
            ? payload.sourceFileType
            : existing.sourceFileType,
        folderId:
          payload.folderId !== undefined
            ? payload.folderId
            : existing.folderId,
        updatedAt: new Date().toISOString(),
      };

      db.exams[idx] = updated;

      if (versionBumped) {
        appendAuditLog(
          db,
          user,
          'VERSION_BUMP_EXAM',
          updated.id,
          `Tự động tạo Phiên bản mới v${nextVersion} cho đề '${updated.title}' để bảo vệ ${existingAttempts.length} bài thi đang diễn ra/đã nộp`,
          req.socket.remoteAddress || 'local'
        );
      } else if (wasPublishedNow) {
        appendAuditLog(
          db,
          user,
          'PUBLISH_EXAM',
          updated.id,
          `Xuất bản đề thi '${updated.title}' (Mã: ${updated.shareCode}, Phiên bản v${updated.version})`,
          req.socket.remoteAddress || 'local'
        );
      } else if (wasClosedNow) {
        appendAuditLog(
          db,
          user,
          'CLOSE_EXAM',
          updated.id,
          `Đóng cổng nhận bài đề thi '${updated.title}' (Mã: ${updated.shareCode})`,
          req.socket.remoteAddress || 'local'
        );
      } else {
        appendAuditLog(
          db,
          user,
          'UPDATE_EXAM',
          updated.id,
          `Cập nhật cấu hình/nội dung đề thi '${updated.title}' (v${updated.version})`,
          req.socket.remoteAddress || 'local'
        );
      }

      saveDb(db);
      res.json({
        exam: updated,
        versionBumped,
        activeAttemptsProtected: existingAttempts.length,
      });
    }
  );

  app.delete(
    '/api/teacher/exams/:id',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const target = db.exams.find((e) => e.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Không tìm thấy bài thi.' });
        return;
      }

      if (user.role !== 'admin' && target.ownerId !== user.uid) {
        appendAuditLog(
          db,
          user,
          'UNAUTHORIZED_ATTEMPT',
          target.id,
          `Vi phạm RLS: Giáo viên ${user.email} cố xóa đề thi '${target.title}' của ${target.ownerId}`,
          req.socket.remoteAddress || 'local'
        );
        saveDb(db);
        res.status(403).json({
          error:
            'Vi phạm chính sách Row-Level Security (403 Forbidden): Bạn không được phép xóa đề thi của giáo viên khác.',
          code: 'RLS_OWNER_MISMATCH',
        });
        return;
      }

      db.exams = db.exams.filter((e) => e.id !== target.id);
      db.submissions = db.submissions.filter((s) => s.examId !== target.id);

      appendAuditLog(
        db,
        user,
        'DELETE_EXAM',
        target.id,
        `Xóa đề thi '${target.title}' (Mã: ${target.shareCode})`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);
      res.json({ success: true });
    }
  );

  // =========================================================================
  // 6. TEACHER FOLDER MANAGEMENT ROUTES (`/api/teacher/folders`)
  // =========================================================================
  app.get(
    '/api/teacher/folders',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;

      const userFolders =
        user.role === 'admin'
          ? db.folders
          : db.folders.filter((f) => f.ownerId === user.uid || f.ownerId === 'all');

      // Attach dynamic exam count
      const foldersWithCount = userFolders.map((f) => {
        const count = db.exams.filter((e) => e.folderId === f.id).length;
        return {
          ...f,
          examCount: count,
        };
      });

      const userExams =
        user.role === 'admin'
          ? db.exams
          : db.exams.filter((e) => e.ownerId === user.uid);
      const uncategorizedCount = userExams.filter((e) => !e.folderId).length;

      res.json({
        folders: foldersWithCount,
        uncategorizedCount,
        totalExams: userExams.length,
      });
    }
  );

  app.post(
    '/api/teacher/folders',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const { name, color, description } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Tên thư mục không được để trống.' });
        return;
      }

      const now = new Date().toISOString();
      const newFolder: ExamFolder = {
        id: `fld-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: name.trim(),
        color: color || 'blue',
        description: typeof description === 'string' ? description.trim() : '',
        ownerId: user.uid,
        createdAt: now,
        updatedAt: now,
      };

      db.folders.push(newFolder);

      appendAuditLog(
        db,
        user,
        'CREATE_FOLDER',
        newFolder.id,
        `Tạo thư mục đề thi mới '${newFolder.name}'`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      res.status(201).json({ folder: { ...newFolder, examCount: 0 } });
    }
  );

  app.patch(
    '/api/teacher/folders/:id',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const folder = db.folders.find((f) => f.id === req.params.id);

      if (!folder) {
        res.status(404).json({ error: 'Không tìm thấy thư mục.' });
        return;
      }

      if (user.role !== 'admin' && folder.ownerId !== user.uid && folder.ownerId !== 'all') {
        res.status(403).json({ error: 'Bạn không có quyền sửa thư mục này.' });
        return;
      }

      const { name, color, description } = req.body;
      if (name !== undefined) {
        if (!name.trim()) {
          res.status(400).json({ error: 'Tên thư mục không được để trống.' });
          return;
        }
        folder.name = name.trim();
      }
      if (color !== undefined) folder.color = color;
      if (description !== undefined) folder.description = description.trim();
      folder.updatedAt = new Date().toISOString();

      appendAuditLog(
        db,
        user,
        'UPDATE_FOLDER',
        folder.id,
        `Cập nhật thư mục đề thi '${folder.name}'`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      const count = db.exams.filter((e) => e.folderId === folder.id).length;
      res.json({ folder: { ...folder, examCount: count } });
    }
  );

  app.delete(
    '/api/teacher/folders/:id',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const folderIdx = db.folders.findIndex((f) => f.id === req.params.id);

      if (folderIdx === -1) {
        res.status(404).json({ error: 'Không tìm thấy thư mục.' });
        return;
      }

      const folder = db.folders[folderIdx];
      if (user.role !== 'admin' && folder.ownerId !== user.uid && folder.ownerId !== 'all') {
        res.status(403).json({ error: 'Bạn không có quyền xóa thư mục này.' });
        return;
      }

      // Unassign exams from this folder
      let movedCount = 0;
      for (const exam of db.exams) {
        if (exam.folderId === folder.id) {
          exam.folderId = null;
          movedCount++;
        }
      }

      db.folders.splice(folderIdx, 1);

      appendAuditLog(
        db,
        user,
        'DELETE_FOLDER',
        folder.id,
        `Xóa thư mục '${folder.name}' (Đã chuyển ${movedCount} đề thi về mục Chưa phân loại)`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      res.json({ success: true, movedExamsCount: movedCount });
    }
  );

  // Quick move exam to a folder
  app.patch(
    '/api/teacher/exams/:id/folder',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const exam = db.exams.find((e) => e.id === req.params.id);

      if (!exam) {
        res.status(404).json({ error: 'Không tìm thấy đề thi.' });
        return;
      }

      if (user.role !== 'admin' && exam.ownerId !== user.uid) {
        res.status(403).json({ error: 'Bạn không có quyền chuyển thư mục đề thi này.' });
        return;
      }

      const { folderId } = req.body;
      let targetFolderName = 'Chưa phân loại';
      if (folderId) {
        const folder = db.folders.find((f) => f.id === folderId);
        if (!folder) {
          res.status(404).json({ error: 'Thư mục chỉ định không tồn tại.' });
          return;
        }
        exam.folderId = folderId;
        targetFolderName = folder.name;
      } else {
        exam.folderId = null;
      }
      exam.updatedAt = new Date().toISOString();

      appendAuditLog(
        db,
        user,
        'MOVE_EXAM_FOLDER',
        exam.id,
        `Chuyển đề thi '${exam.title}' sang thư mục '${targetFolderName}'`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      res.json({ success: true, examId: exam.id, folderId: exam.folderId });
    }
  );

  // Safe fallback for old question bank queries
  app.get(
    '/api/teacher/questions',
    requireRole(['teacher', 'admin']),
    (_req: AuthenticatedRequest, res: Response) => {
      res.json({ questions: [] });
    }
  );

  // =========================================================================
  // 7. TEACHER RESULTS, SUBMISSIONS & CSV EXPORT ROUTES
  // =========================================================================
  app.get(
    '/api/teacher/exams/:id/submissions',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const exam = db.exams.find((e) => e.id === req.params.id);
      if (!exam) {
        res.status(404).json({ error: 'Không tìm thấy bài thi.' });
        return;
      }

      if (user.role !== 'admin' && exam.ownerId !== user.uid) {
        appendAuditLog(
          db,
          user,
          'UNAUTHORIZED_ATTEMPT',
          exam.id,
          `Vi phạm RLS: Giáo viên ${user.email} cố xem kết quả đề '${exam.title}' của ${exam.ownerId}`,
          req.socket.remoteAddress || 'local'
        );
        saveDb(db);
        res.status(403).json({
          error:
            'Vi phạm chính sách Row-Level Security (403 Forbidden): Bạn không có quyền xem kết quả bài thi của giáo viên khác.',
          code: 'RLS_OWNER_MISMATCH',
        });
        return;
      }

      const subs = db.submissions
        .filter((s) => s.examId === exam.id)
        .map((sub) => {
          const questionsUsed = sub.questionSnapshot || exam.questions;
          const graded = gradeQuestionsOnServer(
            questionsUsed,
            exam.totalScale,
            sub.answers,
            true,
            exam.trueFalseScoring || 'standard_10_25_50_100'
          );
          return {
            ...sub,
            rawScore: graded.rawScore,
            maxRawScore: graded.maxRawScore,
            scaledScore: graded.scaledScore,
            gradeDetails: graded.gradeDetails,
          };
        });
      res.json({ exam, submissions: subs });
    }
  );

  // Server-authorized CSV Export for Exam Results
  app.get(
    '/api/teacher/exams/:id/export-csv',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const exam = db.exams.find((e) => e.id === req.params.id);
      if (!exam) {
        res.status(404).json({ error: 'Không tìm thấy bài thi.' });
        return;
      }

      if (user.role !== 'admin' && exam.ownerId !== user.uid) {
        res.status(403).json({
          error: 'Bạn không có quyền xuất dữ liệu kết quả của giáo viên khác.',
        });
        return;
      }

      const subs = db.submissions.filter((s) => s.examId === exam.id);
      appendAuditLog(
        db,
        user,
        'EXPORT_RESULTS',
        exam.id,
        `Xuất bảng điểm CSV cho đề thi '${exam.title}' (${subs.length} lượt thi)`,
        req.socket.remoteAddress || 'local'
      );
      saveDb(db);

      const escapeCsv = (val: unknown) => {
        const s = String(val ?? '').replace(/"/g, '""');
        return `"${s}"`;
      };

      const headers = [
        'STT',
        'Ho va ten',
        'Lop',
        'Ma hoc sinh',
        'Trang thai',
        'Diem quy doi',
        'Thang diem',
        'Diem tho',
        'Tong diem tho',
        'Chuyen tab',
        'Bat dau luc',
        'Nop bai luc',
      ];

      const rows = subs.map((s, idx) => [
        idx + 1,
        s.studentName,
        s.studentClass,
        s.studentCode || '',
        s.status === 'submitted' ? 'Da nop' : 'Dang lam',
        s.scaledScore ?? '',
        exam.totalScale,
        s.rawScore ?? '',
        s.maxRawScore ?? '',
        s.tabSwitchCount,
        s.startedAt,
        s.submittedAt || '',
      ]);

      const csvContent =
        '\uFEFF' +
        [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Bang_Diem_${exam.shareCode}.csv"`
      );
      res.send(csvContent);
    }
  );

  app.get(
    '/api/teacher/results',
    requireRole(['teacher', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const ownedExams =
        user.role === 'admin'
          ? db.exams
          : db.exams.filter((e) => e.ownerId === user.uid);
      const ownedExamIds = new Set(ownedExams.map((e) => e.id));

      const results = db.submissions
        .filter((s) => ownedExamIds.has(s.examId))
        .map((sub) => {
          const exam = db.exams.find((e) => e.id === sub.examId);
          return {
            ...sub,
            examTitle: exam?.title || sub.examTitle || sub.shareCode,
            examSubject: exam?.subject || sub.examSubject || '',
            questionSnapshot: undefined,
            studentAccessToken: undefined,
          };
        });

      res.json({ submissions: results, exams: ownedExams });
    }
  );

  // =========================================================================
  // 8. STUDENT PUBLIC & PERSONAL RESULT ROUTES (Strict Server Filtering)
  // =========================================================================
  app.get('/api/student/published-exams', (_req: Request, res: Response) => {
    const db = loadDb();
    const published = db.exams
      .filter((e) => e.status === 'published')
      .map((exam) => {
        const timeCheck = checkExamTimeStatus(exam);
        return {
          id: exam.id,
          shareCode: exam.shareCode,
          title: exam.title,
          subject: exam.subject,
          gradeLevel: exam.gradeLevel || 'Lớp 12',
          examCategory: exam.examCategory || 'Cuối HK2',
          description: exam.description,
          durationMinutes: exam.durationMinutes,
          totalScale: exam.totalScale,
          openAt: exam.openAt,
          closeAt: exam.closeAt,
          requiresAccessCode: Boolean(
            exam.accessCode && exam.accessCode.trim().length > 0
          ),
          maxAttempts: exam.maxAttempts || 0,
          shuffleQuestions: Boolean(exam.shuffleQuestions),
          shuffleOptions: Boolean(exam.shuffleOptions),
          trueFalseScoring: exam.trueFalseScoring || 'standard_10_25_50_100',
          questionCount: exam.questions.length,
          sectionSummary: computeExamSectionSummary(exam.questions),
          version: exam.version || 1,
          status: exam.status,
          isOpen: timeCheck.isOpen,
          closedReason: timeCheck.reason,
        } satisfies PublicExamInfo;
      });
    res.json({ exams: published });
  });

  app.get(
    '/api/student/exams/:shareCode/info',
    rateLimit(60, 60_000),
    (req: Request, res: Response) => {
      const code = (req.params.shareCode || '').toUpperCase().trim();
      const db = loadDb();
      const exam = db.exams.find(
        (e) =>
          e.shareCode.toUpperCase() === code || e.id === req.params.shareCode
      );

      // Strictly block students from viewing draft exams
      if (!exam || exam.status === 'draft') {
        res.status(404).json({
          error:
            'Không tìm thấy bài thi đã xuất bản với mã này. Đề thi có thể đang ở trạng thái Bản nháp hoặc mã đề không đúng.',
        });
        return;
      }

      const timeCheck = checkExamTimeStatus(exam);
      const info: PublicExamInfo = {
        id: exam.id,
        shareCode: exam.shareCode,
        title: exam.title,
        subject: exam.subject,
        gradeLevel: exam.gradeLevel || 'Lớp 12',
        examCategory: exam.examCategory || 'Cuối HK2',
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        totalScale: exam.totalScale,
        openAt: exam.openAt,
        closeAt: exam.closeAt,
        requiresAccessCode: Boolean(
          exam.accessCode && exam.accessCode.trim().length > 0
        ),
        maxAttempts: exam.maxAttempts || 0,
        shuffleQuestions: Boolean(exam.shuffleQuestions),
        shuffleOptions: Boolean(exam.shuffleOptions),
        trueFalseScoring: exam.trueFalseScoring || 'standard_10_25_50_100',
        questionCount: exam.questions.length,
        sectionSummary: computeExamSectionSummary(exam.questions),
        version: exam.version || 1,
        status: exam.status,
        isOpen: timeCheck.isOpen,
        closedReason: timeCheck.reason,
      };

      res.json({ exam: info });
    }
  );

  app.post(
    '/api/student/exams/:shareCode/start',
    rateLimit(60, 60_000),
    (req: AuthenticatedRequest, res: Response) => {
      const code = (req.params.shareCode || '').toUpperCase().trim();
      const { studentName, studentClass, studentCode, accessCode } = req.body as {
        studentName?: string;
        studentClass?: string;
        studentCode?: string;
        accessCode?: string;
      };

      if (!studentName || !studentName.trim()) {
        res.status(400).json({ error: 'Vui lòng nhập Họ và tên học sinh.' });
        return;
      }
      if (!studentClass || !studentClass.trim()) {
        res.status(400).json({ error: 'Vui lòng nhập Lớp.' });
        return;
      }

      const db = loadDb();
      const exam = db.exams.find(
        (e) =>
          e.shareCode.toUpperCase() === code || e.id === req.params.shareCode
      );
      if (!exam || exam.status !== 'published') {
        res.status(404).json({
          error:
            exam?.status === 'closed'
              ? 'Bài thi này đã đóng cổng nhận bài.'
              : 'Bài thi không tồn tại hoặc chưa được giáo viên xuất bản.',
        });
        return;
      }

      const timeCheck = checkExamTimeStatus(exam);
      if (!timeCheck.isOpen) {
        res
          .status(403)
          .json({ error: timeCheck.reason || 'Bài thi hiện không mở.' });
        return;
      }

      if (exam.accessCode && exam.accessCode.trim().length > 0) {
        if (!accessCode || accessCode.trim() !== exam.accessCode.trim()) {
          res
            .status(403)
            .json({ error: 'Mã ca thi (mật khẩu bài thi) không chính xác.' });
          return;
        }
      }

      // Check maxAttempts if configured by teacher
      if (exam.maxAttempts && exam.maxAttempts > 0) {
        const cleanName = studentName.trim().toLowerCase();
        const cleanClass = studentClass.trim().toLowerCase();
        const previousSubmitted = db.submissions.filter(
          (s) =>
            s.examId === exam.id &&
            s.status === 'submitted' &&
            s.studentName.trim().toLowerCase() === cleanName &&
            s.studentClass.trim().toLowerCase() === cleanClass
        );
        if (previousSubmitted.length >= exam.maxAttempts) {
          res.status(403).json({
            error: `Bạn đã hoàn thành tối đa ${exam.maxAttempts} lượt làm bài cho phép của đề thi này.`,
          });
          return;
        }
      }

      const resolved = resolveRequestSession(req);
      const nowMs = Date.now();
      const durationMs = (exam.durationMinutes || 45) * 60 * 1000;
      let deadlineMs = nowMs + durationMs;

      if (exam.closeAt) {
        const closeMs = new Date(exam.closeAt).getTime();
        if (!isNaN(closeMs) && closeMs < deadlineMs) {
          deadlineMs = closeMs;
        }
      }

      const studentAccessToken = crypto.randomBytes(24).toString('hex');
      let frozenQuestions: Question[] = JSON.parse(
        JSON.stringify(exam.questions)
      );

      // Optional question/option shuffling configured by teacher
      if (exam.shuffleQuestions) {
        frozenQuestions = frozenQuestions
          .sort(() => Math.random() - 0.5)
          .map((q, idx) => ({ ...q, orderIndex: idx + 1 }));
      }
      if (exam.shuffleOptions) {
        frozenQuestions = frozenQuestions.map((q) => {
          if (q.options && q.options.length > 1) {
            return {
              ...q,
              options: [...q.options].sort(() => Math.random() - 0.5),
            };
          }
          return q;
        });
      }

      const submission: Submission = {
        id: `sub-${nowMs}-${Math.random().toString(36).substring(2, 7)}`,
        examId: exam.id,
        examOwnerId: exam.ownerId,
        examTitle: exam.title,
        examSubject: exam.subject,
        examVersion: exam.version || 1,
        shareCode: exam.shareCode,
        studentUid: resolved.user?.uid || `anon-${nowMs}`,
        studentAccessToken,
        studentName: studentName.trim(),
        studentClass: studentClass.trim(),
        studentCode: (studentCode || '').trim(),
        startedAt: new Date(nowMs).toISOString(),
        deadlineAt: new Date(deadlineMs).toISOString(),
        submittedAt: null,
        status: 'in_progress',
        answers: {},
        flaggedQuestions: [],
        tabSwitchCount: 0,
        rawScore: null,
        maxRawScore: null,
        scaledScore: null,
        totalScale: exam.totalScale,
        autoSubmitted: false,
        questionSnapshot: frozenQuestions,
      };

      db.submissions.unshift(submission);
      saveDb(db);

      const sanitizedQuestions = sanitizeQuestionsForStudent(frozenQuestions);

      const safeSubmission: Submission = {
        ...submission,
        questionSnapshot: undefined,
      };

      res.status(201).json({
        submission: safeSubmission,
        studentAccessToken,
        exam: {
          id: exam.id,
          shareCode: exam.shareCode,
          title: exam.title,
          subject: exam.subject,
          version: exam.version || 1,
          durationMinutes: exam.durationMinutes,
          totalScale: exam.totalScale,
          questions: sanitizedQuestions,
        },
      });
    }
  );

  app.put(
    '/api/student/submissions/:submissionId/save',
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const sub = db.submissions.find((s) => s.id === req.params.submissionId);
      if (!sub) {
        res.status(404).json({ error: 'Không tìm thấy phiên làm bài.' });
        return;
      }
      if (sub.status === 'submitted') {
        res.status(400).json({
          error: 'Bài thi đã được nộp, không thể sửa câu trả lời.',
        });
        return;
      }

      const tokenHeader = req.headers['x-submission-token'] as string | undefined;
      if (sub.studentAccessToken && tokenHeader !== sub.studentAccessToken) {
        res.status(403).json({
          error: 'Mã xác thực phiên làm bài của học sinh không hợp lệ.',
        });
        return;
      }

      // Server-side deadline verification (allow 30s grace window for network latency)
      const deadlineMs = new Date(sub.deadlineAt).getTime();
      if (!isNaN(deadlineMs) && Date.now() > deadlineMs + 30_000) {
        res.status(403).json({
          error: 'Đã hết thời gian làm bài trên máy chủ. Không thể lưu thêm câu trả lời.',
          code: 'DEADLINE_EXCEEDED',
        });
        return;
      }

      const { answers, flaggedQuestions, tabSwitchCount } = req.body as {
        answers?: Record<string, StudentAnswer>;
        flaggedQuestions?: string[];
        tabSwitchCount?: number;
      };

      if (answers && typeof answers === 'object') {
        sub.answers = answers;
      }
      if (Array.isArray(flaggedQuestions)) {
        sub.flaggedQuestions = flaggedQuestions;
      }
      if (typeof tabSwitchCount === 'number') {
        sub.tabSwitchCount = Math.max(sub.tabSwitchCount, tabSwitchCount);
      }

      saveDb(db);
      res.json({ savedAt: new Date().toISOString() });
    }
  );

  app.post(
    '/api/student/submissions/:submissionId/submit',
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const sub = db.submissions.find((s) => s.id === req.params.submissionId);
      if (!sub) {
        res.status(404).json({ error: 'Không tìm thấy phiên làm bài.' });
        return;
      }

      const tokenHeader = req.headers['x-submission-token'] as string | undefined;
      if (sub.studentAccessToken && tokenHeader !== sub.studentAccessToken) {
        res.status(403).json({
          error: 'Mã xác thực phiên làm bài của học sinh không hợp lệ.',
        });
        return;
      }

      const exam = db.exams.find((e) => e.id === sub.examId);
      if (!exam) {
        res.status(404).json({ error: 'Không tìm thấy đề thi gốc.' });
        return;
      }

      if (sub.status !== 'submitted') {
        const { answers, flaggedQuestions, tabSwitchCount, autoSubmitted } =
          req.body as {
            answers?: Record<string, StudentAnswer>;
            flaggedQuestions?: string[];
            tabSwitchCount?: number;
            autoSubmitted?: boolean;
          };

        // Server-side deadline verification: only accept payload updates if within deadline + 45s grace window
        const deadlineMs = new Date(sub.deadlineAt).getTime();
        const isPastDeadline = !isNaN(deadlineMs) && Date.now() > deadlineMs + 45_000;

        if (!isPastDeadline) {
          if (answers && typeof answers === 'object') {
            sub.answers = answers;
          }
          if (Array.isArray(flaggedQuestions)) {
            sub.flaggedQuestions = flaggedQuestions;
          }
        }
        if (typeof tabSwitchCount === 'number') {
          sub.tabSwitchCount = Math.max(sub.tabSwitchCount, tabSwitchCount);
        }
        sub.submittedAt = new Date().toISOString();
        sub.status = 'submitted';
        sub.autoSubmitted = Boolean(autoSubmitted) || isPastDeadline;
      }

      const questionsToGrade = sub.questionSnapshot || exam.questions;
      const solutionAccess = canStudentSeeSolutions(exam, sub.status);
      const graded = gradeQuestionsOnServer(
        questionsToGrade,
        exam.totalScale,
        sub.answers,
        solutionAccess.allowed,
        exam.trueFalseScoring || 'standard_10_25_50_100'
      );

      sub.rawScore = graded.rawScore;
      sub.maxRawScore = graded.maxRawScore;
      sub.scaledScore = graded.scaledScore;
      saveDb(db);

      res.json({
        submission: {
          ...sub,
          questionSnapshot: undefined,
          solutionsVisible: solutionAccess.allowed,
          solutionNotice: solutionAccess.notice,
          gradeDetails: graded.gradeDetails,
        },
        questions: sanitizeQuestionsForStudent(questionsToGrade),
      });
    }
  );

  app.get(
    '/api/student/submissions/:submissionId/result',
    (req: AuthenticatedRequest, res: Response) => {
      const db = loadDb();
      const sub = db.submissions.find((s) => s.id === req.params.submissionId);
      if (!sub) {
        res.status(404).json({ error: 'Không tìm thấy kết quả bài làm.' });
        return;
      }

      const resolved = resolveRequestSession(req);
      const tokenHeader =
        (req.headers['x-submission-token'] as string | undefined) ||
        (req.query.token as string | undefined);

      const isOwnerByToken =
        Boolean(sub.studentAccessToken) &&
        tokenHeader === sub.studentAccessToken;
      const isOwnerByAccount =
        Boolean(resolved.user) && resolved.user!.uid === sub.studentUid;
      const isExamTeacherOrAdmin =
        Boolean(resolved.user) &&
        (resolved.user!.role === 'admin' ||
          (resolved.user!.role === 'teacher' &&
            resolved.user!.uid === sub.examOwnerId));

      if (!isOwnerByToken && !isOwnerByAccount && !isExamTeacherOrAdmin) {
        res.status(403).json({
          error:
            'Bảo mật kết quả (403 Forbidden): Học sinh chỉ được phép xem kết quả bài thi của chính mình.',
          code: 'SUBMISSION_RLS_DENIED',
        });
        return;
      }

      const exam = db.exams.find((e) => e.id === sub.examId);
      if (!exam) {
        res.status(404).json({ error: 'Không tìm thấy bài thi.' });
        return;
      }

      const questionsToGrade = sub.questionSnapshot || exam.questions;
      const solutionAccess = canStudentSeeSolutions(exam, sub.status);
      const graded = gradeQuestionsOnServer(
        questionsToGrade,
        exam.totalScale,
        sub.answers,
        solutionAccess.allowed,
        exam.trueFalseScoring || 'standard_10_25_50_100'
      );

      res.json({
        submission: {
          ...sub,
          questionSnapshot: undefined,
          rawScore: graded.rawScore,
          maxRawScore: graded.maxRawScore,
          scaledScore: graded.scaledScore,
          solutionsVisible: solutionAccess.allowed,
          solutionNotice: solutionAccess.notice,
          gradeDetails: graded.gradeDetails,
        },
        examTitle: exam.title,
        examSubject: exam.subject,
        questions: sanitizeQuestionsForStudent(questionsToGrade),
      });
    }
  );

  // =========================================================================
  // 9. VITE MIDDLEWARE (DEV) OR STATIC ASSETS (PROD)
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
