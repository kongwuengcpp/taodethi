import React, { useState, useEffect, useCallback } from 'react';
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Search,
  Users,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Play,
  BookOpen,
  Activity,
  Award,
  Eye,
  Download,
  Database,
  Server,
  Sparkles,
  Copy,
  Check,
  Zap,
  Terminal,
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import {
  auth,
  googleProvider,
  syncFirstAdminBootstrapToFirestore,
} from '../lib/firebase';
import { apiFetch, setAuthSession, resolveApiUrl } from '../lib/authClient';
import { MathText } from '../utils/mathRenderer';
import type {
  Exam,
  Question,
  Submission,
  UserAccount,
  UserRole,
  AuditLogEntry,
  QuestionType,
  SystemSetupStatus,
} from '../types/exam';

// =========================================================================
// 1. ADMIN & TEACHER LOGIN + FIRST-TIME ADMIN BOOTSTRAP (`/admin/login`)
// Strictly ZERO default passwords or public credentials!
// =========================================================================
interface TeacherLoginPageProps {
  onLoginSuccess: (user: UserAccount) => void;
  onGoToStudentZone: () => void;
}

export const TeacherLoginPage: React.FC<TeacherLoginPageProps> = ({
  onLoginSuccess,
  onGoToStudentZone,
}) => {
  const [setupStatus, setSetupStatus] = useState<SystemSetupStatus | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);

  // Login / Register state
  const [mode, setMode] = useState<'login' | 'bootstrap' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [localTokenHint, setLocalTokenHint] = useState<string | null>(null);
  const [attemptPromoteRole, setAttemptPromoteRole] = useState<
    'student' | 'teacher' | 'admin'
  >('teacher');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const loadSetupStatus = useCallback(async () => {
    setLoadingSetup(true);
    try {
      const res = await apiFetch('/api/setup/status');
      if (res.ok) {
        const data: SystemSetupStatus = await res.json();
        setSetupStatus(data);
        if (!data.initialized) {
          setMode('bootstrap');
        } else {
          setMode('login');
        }
      }
    } catch {
      // Handled gracefully
    } finally {
      setLoadingSetup(false);
    }
  }, []);

  useEffect(() => {
    loadSetupStatus();
  }, [loadSetupStatus]);

  const handleFetchLocalBootstrapToken = async () => {
    setError(null);
    setInfoMessage(null);
    try {
      const res = await apiFetch('/api/setup/local-bootstrap-token');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Không thể lấy mã thiết lập 1 lần.');
        return;
      }
      setBootstrapSecret(data.oneTimeToken);
      setLocalTokenHint(data.note);
    } catch {
      setError('Không thể kết nối máy chủ để kiểm tra mã khởi tạo.');
    }
  };

  const handleBootstrapFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/setup/bootstrap-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bootstrapSecret,
          email,
          displayName,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Khởi tạo Quản trị viên đầu tiên thất bại.');
        setLoading(false);
        return;
      }

      setAuthSession(data.token, data.user);
      await loadSetupStatus();
      onLoginSuccess(data.user);
    } catch {
      setError('Lỗi kết nối máy chủ khi khởi tạo Quản trị viên đầu tiên.');
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapWithGoogle = async () => {
    if (!bootstrapSecret.trim()) {
      setError(
        'Vui lòng nhập Mã bí mật thiết lập dùng một lần (ADMIN_BOOTSTRAP_SECRET) trước khi xác minh Google.'
      );
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      const res = await apiFetch('/api/setup/bootstrap-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bootstrapSecret,
          firebaseIdToken: idToken,
          email: cred.user.email,
          displayName: cred.user.displayName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Không thể khởi tạo Admin qua Google.');
        setLoading(false);
        return;
      }
      await syncFirstAdminBootstrapToFirestore();
      setAuthSession(data.token, data.user);
      await loadSetupStatus();
      onLoginSuccess(data.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể mở cửa sổ xác thực Google.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Đăng nhập thất bại.');
        setLoading(false);
        return;
      }

      setAuthSession(data.token, data.user);
      onLoginSuccess(data.user);
    } catch {
      setError('Không thể kết nối máy chủ xác thực.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      const res = await apiFetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Xác thực Firebase Token thất bại.');
        setLoading(false);
        return;
      }
      setAuthSession(data.token, data.user);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể đăng nhập bằng Google Popup.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName,
          role: attemptPromoteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Đăng ký không thành công.');
        setLoading(false);
        return;
      }
      setAuthSession(data.token, data.user);
      setInfoMessage(
        `Đăng ký thành công tài khoản '${data.user.email}' (${data.user.role === 'admin' ? 'Quản trị viên' : data.user.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}). Đang chuyển hướng...`
      );
      onLoginSuccess(data.user);
    } catch {
      setError('Lỗi kết nối máy chủ backend khi đăng ký. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingSetup) {
    return (
      <div className="max-w-md mx-auto my-16 bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
        Đang kiểm tra trạng thái khởi tạo bảo mật của máy chủ...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto my-6 space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="space-y-2 border-b border-slate-200 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-blue-700 font-semibold">
              <KeyRound className="w-4 h-4" />
              <span>Ứng dụng Quản trị Độc lập (Admin &amp; Teacher Portal)</span>
            </div>
            {setupStatus?.bootstrapLocked ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-mono font-semibold">
                <Lock className="w-3 h-3" />
                Bootstrap lần đầu: ĐÃ KHÓA VĨNH VIỄN
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-[11px] font-mono font-semibold">
                <Unlock className="w-3 h-3" />
                Chưa có Quản trị viên — Cần thiết lập lần đầu
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {!setupStatus?.initialized
              ? 'Thiết lập Quản trị viên Đầu tiên (One-Time Bootstrap)'
              : 'Đăng nhập Hệ thống Quản lý Đề thi'}
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Vui lòng đăng nhập bằng tài khoản Quản trị viên hoặc Giáo viên để truy cập bảng điều khiển và quản lý đề thi.
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          {!setupStatus?.initialized && (
            <button
              type="button"
              onClick={() => {
                setMode('bootstrap');
                setError(null);
              }}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                mode === 'bootstrap'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              1. Khởi tạo Quản trị viên
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              mode === 'login'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Đăng nhập Hệ thống
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              mode === 'register'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Đăng ký tài khoản mới
          </button>
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {mode === 'bootstrap' ? (
          <form onSubmit={handleBootstrapFirstAdmin} className="space-y-4">
            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 text-xs text-slate-700">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                <span>Hướng dẫn Khởi tạo Quản trị viên đầu tiên an toàn:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                <li>
                  Trên môi trường máy chủ (Production), bạn đặt biến môi trường{' '}
                  <code className="font-mono bg-white px-1 py-0.5 rounded border">
                    ADMIN_BOOTSTRAP_SECRET
                  </code>
                  .
                </li>
                <li>
                  Nếu đang chạy thử nghiệm lần đầu chưa cấu hình biến môi trường, máy chủ tự sinh một <strong>Mã thiết lập dùng 1 lần</strong> trong bộ nhớ nội bộ.
                </li>
                <li>
                  Ngay sau khi bạn tạo Quản trị viên đầu tiên thành công, quy trình này sẽ <strong>tự động bị khóa vĩnh viễn</strong>.
                </li>
              </ol>

              {!setupStatus?.hasEnvBootstrapSecret && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleFetchLocalBootstrapToken}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-300 rounded-lg transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Lấy Mã Thiết lập 1 Lần từ Máy chủ Nội bộ</span>
                  </button>
                </div>
              )}
              {localTokenHint && (
                <p className="text-[11px] text-emerald-800 font-medium">
                  ✓ {localTokenHint}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã bí mật thiết lập dùng 1 lần (ADMIN_BOOTSTRAP_SECRET){' '}
                <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={bootstrapSecret}
                onChange={(e) => setBootstrapSecret(e.target.value)}
                placeholder="Nhập mã ADMIN_BOOTSTRAP_SECRET..."
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Quản trị viên đầu tiên <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@ten-mien-cua-ban.edu.vn"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Họ và tên hiển thị <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="VD: Ban Giám Hiệu / Quản trị viên"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mật khẩu Quản trị viên (Tối thiểu 8 ký tự, băm bằng scrypt + salt){' '}
                <span className="text-red-600">*</span>
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu mạnh (>= 8 ký tự)..."
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
              >
                {loading
                  ? 'Đang khởi tạo & khóa Bootstrap...'
                  : 'Khởi tạo Quản trị viên Đầu tiên & Khóa Bootstrap'}
              </button>
              <button
                type="button"
                onClick={handleBootstrapWithGoogle}
                disabled={loading}
                className="py-2.5 px-4 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Xác minh bằng Google + Mã Bootstrap
              </button>
            </div>
          </form>
        ) : mode === 'login' ? (
          <div className="space-y-5">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Giáo viên / Quản trị viên
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@school.edu.vn"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mật khẩu
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
                >
                  {loading ? 'Đang xác thực...' : 'Đăng nhập vào Khu vực Quản trị'}
                </button>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="py-2.5 px-4 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  Đăng nhập với Google (Firebase Auth)
                </button>
              </div>
            </form>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed">
              <strong>Đăng ký tài khoản mới:</strong> Bạn có thể tạo tài khoản Giáo viên hoặc Quản trị viên để quản lý, soạn thảo đề thi, chấm điểm và sử dụng đầy đủ các công cụ hệ thống.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Họ và tên hiển thị <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="VD: Thầy Nguyễn Văn A"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email đăng ký mới <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="giaovien@school.edu.vn"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mật khẩu (tối thiểu 6 ký tự) <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vai trò trên hệ thống <span className="text-red-500">*</span>
                </label>
                <select
                  value={attemptPromoteRole}
                  onChange={(e) =>
                    setAttemptPromoteRole(
                      e.target.value as 'student' | 'teacher' | 'admin'
                    )
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                >
                  <option value="teacher">
                    🎓 Giáo viên (Soạn đề, tạo kỳ thi, chấm điểm)
                  </option>
                  <option value="admin">
                    👑 Quản trị viên (Toàn quyền quản trị hệ thống)
                  </option>
                  <option value="student">
                    🎒 Học sinh (Làm bài thi trực tuyến)
                  </option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
            >
              {loading ? 'Đang tạo tài khoản & đăng nhập...' : 'Tạo tài khoản & Đăng nhập ngay'}
            </button>
          </form>
        )}

        <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Bạn là học sinh cần vào làm bài thi?</span>
          <button
            type="button"
            onClick={onGoToStudentZone}
            className="font-semibold text-blue-700 hover:underline"
          >
            &larr; Chuyển sang Website Học sinh
          </button>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 2. TEACHER & ADMIN DASHBOARD (`/admin/dashboard`)
// Includes: User/Role Management, Sandbox Demo Controls, Backup, Security & Concurrency Load Test, and Deployment Guide
// =========================================================================
interface SecurityTestCaseResult {
  id: number;
  title: string;
  description: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  httpCode?: number;
  serverResponse?: string;
}

interface ConcurrencyLoadReport {
  concurrentUsers: number;
  totalRequests: number;
  succeeded: number;
  failed: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalDurationMs: number;
}

interface TeacherDashboardPageProps {
  currentUser: UserAccount;
  examsCount: number;
  foldersCount?: number;
  questionsCount?: number;
  submissionsCount: number;
  onNavigate: (path: string) => void;
  onRefreshWorkspace: () => void;
}

export const TeacherDashboardPage: React.FC<TeacherDashboardPageProps> = ({
  currentUser,
  examsCount,
  foldersCount = 3,
  submissionsCount,
  onNavigate,
  onRefreshWorkspace,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'security_load' | 'deployment_guide'
  >('overview');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [allUsers, setAllUsers] = useState<UserAccount[]>([]);

  // Admin Create New Teacher/Admin Form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('teacher');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [userFormNotice, setUserFormNotice] = useState<string | null>(null);
  const [userFormError, setUserFormError] = useState<string | null>(null);

  // Sandbox & Backup status
  const [sandboxNotice, setSandboxNotice] = useState<string | null>(null);
  const [runningTests, setRunningTests] = useState(false);
  const [runningLoadTest, setRunningLoadTest] = useState(false);
  const [loadReport, setLoadReport] = useState<ConcurrencyLoadReport | null>(
    null
  );

  const [securityTests, setSecurityTests] = useState<SecurityTestCaseResult[]>([
    {
      id: 1,
      title: 'Kịch bản 1: Khóa vĩnh viễn quy trình Bootstrap Quản trị viên lần đầu',
      description:
        'Gọi lại POST /api/setup/bootstrap-admin sau khi đã có Admin -> Bắt buộc bị chặn 403 BOOTSTRAP_LOCKED.',
      status: 'idle',
    },
    {
      id: 2,
      title: 'Kịch bản 2: Chưa đăng nhập truy cập API quản trị (/api/teacher/exams)',
      description:
        'Gửi request không có phiên hợp lệ tới /api/teacher/exams -> Bắt buộc trả về 401 Unauthorized.',
      status: 'idle',
    },
    {
      id: 3,
      title: 'Kịch bản 3: Học sinh đăng nhập cố đọc dữ liệu quản trị (/api/teacher/exams)',
      description:
        'Dùng token của tài khoản vai trò student gọi GET /api/teacher/exams -> Bắt buộc bị chặn 403 Forbidden.',
      status: 'idle',
    },
    {
      id: 4,
      title: 'Kịch bản 4: Học sinh gửi request POST tạo đề thi trái phép',
      description:
        'Dùng token của student gọi POST /api/teacher/exams -> Bắt buộc bị chặn 403 Forbidden.',
      status: 'idle',
    },
    {
      id: 5,
      title: 'Kịch bản 5: Học sinh cố mở đề thi đang ở trạng thái Bản nháp (Draft)',
      description:
        'Tạo đề nháp tạm thời và dùng API học sinh truy cập -> Bắt buộc bị chặn 404/403 (không lộ đề nháp).',
      status: 'idle',
    },
    {
      id: 6,
      title: 'Kịch bản 6: Học sinh mở DevTools (F12) kiểm tra JSON đề thi đang làm',
      description:
        'Kiểm tra payload trả về khi bắt đầu làm bài hoàn toàn không chứa correctAnswers, isTrue hay explanation.',
      status: 'idle',
    },
    {
      id: 7,
      title: 'Kịch bản 7: Chặn tự đăng ký nâng quyền lên Teacher/Admin',
      description:
        'Gửi POST /api/auth/register kèm role="admin" -> Bắt buộc bị chặn 403 SELF_PROMOTION_BLOCKED.',
      status: 'idle',
    },
  ]);

  const loadDashboardData = useCallback(async () => {
    const logsRes = await apiFetch('/api/teacher/audit-logs');
    if (logsRes.ok) {
      const data = await logsRes.json();
      setAuditLogs(data.logs || []);
    }
    if (currentUser.role === 'admin') {
      const usersRes = await apiFetch('/api/admin/users');
      if (usersRes.ok) {
        const uData = await usersRes.json();
        setAllUsers(uData.users || []);
      }
    }
  }, [currentUser.role]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleCreateUserByAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    setUserFormNotice(null);
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newUserEmail,
        displayName: newUserName,
        role: newUserRole,
        password: newUserPassword,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setUserFormError(data.error || 'Không thể tạo tài khoản.');
      return;
    }
    setNewUserEmail('');
    setNewUserName('');
    setNewUserPassword('');
    setUserFormNotice(
      `Đã tạo tài khoản '${data.user.email}' với vai trò '${data.user.role}'.`
    );
    loadDashboardData();
  };

  const handleChangeUserRole = async (uid: string, nextRole: UserRole) => {
    setUserFormError(null);
    const res = await apiFetch(`/api/admin/users/${uid}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setUserFormError(data.error || 'Không thể đổi vai trò.');
      return;
    }
    loadDashboardData();
  };

  const handleSeedSandboxDemo = async () => {
    setSandboxNotice(null);
    const res = await apiFetch('/api/teacher/sandbox/seed', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      setSandboxNotice(data.message);
      onRefreshWorkspace();
      loadDashboardData();
    }
  };

  const handleClearSandboxDemo = async () => {
    setSandboxNotice(null);
    const res = await apiFetch('/api/teacher/sandbox/clear', {
      method: 'DELETE',
    });
    const data = await res.json();
    if (res.ok) {
      setSandboxNotice(data.message);
      onRefreshWorkspace();
      loadDashboardData();
    }
  };

  const handleDownloadBackup = async () => {
    const res = await apiFetch('/api/admin/backup');
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KhaoThiSo_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    loadDashboardData();
  };

  // Run all 7 live security tests without relying on any hardcoded accounts
  const runAllSevenSecurityTests = async () => {
    setRunningTests(true);
    const updated: SecurityTestCaseResult[] = [...securityTests].map((t) => ({
      ...t,
      status: 'running',
    }));
    setSecurityTests(updated);

    const setResult = (
      idx: number,
      passed: boolean,
      httpCode: number,
      serverResponse: string
    ) => {
      updated[idx] = {
        ...updated[idx],
        status: passed ? 'passed' : 'failed',
        httpCode,
        serverResponse,
      };
      setSecurityTests([...updated]);
    };

    try {
      // Test 1: Verify One-Time Bootstrap is permanently locked
      const t1Res = await fetch(resolveApiUrl('/api/setup/bootstrap-admin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          bootstrapSecret: 'ANY_TOKEN',
          email: 'attacker@test.local',
          password: 'Password123!',
        }),
      });
      const t1Data = await t1Res.json();
      setResult(
        0,
        t1Res.status === 403,
        t1Res.status,
        t1Data.error || '403 Bootstrap Locked'
      );

      // Test 2: Unauthenticated request to /api/teacher/exams
      const t2Res = await fetch(resolveApiUrl('/api/teacher/exams'), {
        headers: { Authorization: 'Bearer unauthenticated-invalid-token' },
        credentials: 'omit',
      });
      const t2Data = await t2Res.json();
      setResult(
        1,
        t2Res.status === 401,
        t2Res.status,
        t2Data.error || '401 Unauthorized'
      );

      // Create an ephemeral student session to test Student RBAC blocks (Tests 3 & 4)
      const tempStudentEmail = `student.audit.${Date.now()}@test.local`;
      const tempRegRes = await fetch(resolveApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          email: tempStudentEmail,
          password: 'TempStudentPassword123!',
          displayName: 'Học Sinh Kiểm Thử Tự Động',
          role: 'student',
        }),
      });
      const tempStudentAuth = await tempRegRes.json();
      const studentToken = tempStudentAuth.token;

      // Test 3: Student tries to read /api/teacher/exams
      const t3Res = await fetch(resolveApiUrl('/api/teacher/exams'), {
        headers: { Authorization: `Bearer ${studentToken}` },
        credentials: 'omit',
      });
      const t3Data = await t3Res.json();
      setResult(
        2,
        t3Res.status === 403,
        t3Res.status,
        t3Data.error || '403 Forbidden'
      );

      // Test 4: Student tries to POST /api/teacher/exams
      const t4Res = await fetch(resolveApiUrl('/api/teacher/exams'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        credentials: 'omit',
        body: JSON.stringify({ title: 'Đề giả mạo từ học sinh' }),
      });
      const t4Data = await t4Res.json();
      setResult(
        3,
        t4Res.status === 403,
        t4Res.status,
        t4Data.error || '403 Forbidden'
      );

      // Test 5: Create a temporary draft exam and verify student cannot access it
      const draftCreateRes = await apiFetch('/api/teacher/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Đề Nháp Kiểm Thử Bảo Mật',
          subject: 'Toán Học',
          status: 'draft',
          questions: [
            {
              id: 'q-sec-1',
              orderIndex: 1,
              type: 'single_choice',
              prompt: 'Câu hỏi kiểm thử: $1 + 1 = ?$',
              options: [
                { id: 'A', label: 'A', text: '2' },
                { id: 'B', label: 'B', text: '3' },
              ],
              correctAnswers: ['A'],
              points: 1,
              explanation: '1+1=2',
              needsReview: false,
            },
          ],
        }),
      });
      const draftCreated = await draftCreateRes.json();
      const draftCode = draftCreated.exam?.shareCode || 'NONEXISTENTDRAFT';
      const draftId = draftCreated.exam?.id;

      const t5Res = await fetch(
        resolveApiUrl(`/api/student/exams/${draftCode}/info`),
        { credentials: 'omit' }
      );
      const t5Data = await t5Res.json();
      setResult(
        4,
        t5Res.status === 404 || t5Res.status === 403,
        t5Res.status,
        t5Data.error || 'Chặn truy cập đề nháp thành công'
      );

      // Publish the temporary exam briefly to test F12 answer key stripping (Test 6)
      if (draftId) {
        await apiFetch(`/api/teacher/exams/${draftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' }),
        });
      }

      const t6StartRes = await fetch(
        resolveApiUrl(`/api/student/exams/${draftCode}/start`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit',
          body: JSON.stringify({
            studentName: 'Thí sinh Kiểm thử F12',
            studentClass: '12A1',
          }),
        }
      );
      const t6Data = await t6StartRes.json();
      const firstQ = t6Data.exam?.questions?.[0] || {};
      const hasLeakedKeys =
        'correctAnswers' in firstQ ||
        'explanation' in firstQ ||
        (Array.isArray(firstQ.statements) &&
          firstQ.statements.some((st: any) => 'isTrue' in st));

      setResult(
        5,
        t6StartRes.status === 201 && !hasLeakedKeys,
        t6StartRes.status,
        !hasLeakedKeys
          ? `An toàn 100%: JSON trả về chỉ gồm các trường [${Object.keys(
              firstQ
            ).join(', ')}] — Không có correctAnswers hay explanation!`
          : 'CẢNH BÁO: Phát hiện lộ đáp án!'
      );

      // Clean up temporary test exam
      if (draftId) {
        await apiFetch(`/api/teacher/exams/${draftId}`, { method: 'DELETE' });
      }

      // Test 7: Self-registration role elevation block
      const t7Res = await fetch(resolveApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          email: `escalate.${Date.now()}@test.local`,
          password: 'Password123!',
          displayName: 'Attacker',
          role: 'admin',
        }),
      });
      const t7Data = await t7Res.json();
      setResult(
        6,
        t7Res.status === 403,
        t7Res.status,
        t7Data.error || '403 Self-Promotion Blocked'
      );

      loadDashboardData();
    } finally {
      setRunningTests(false);
    }
  };

  // Stage 5: Concurrency Load Test (Simulates N concurrent students starting, saving, and submitting)
  const runConcurrentExamLoadTest = async () => {
    setRunningLoadTest(true);
    setLoadReport(null);
    const CONCURRENT_STUDENTS = 15;
    const latencies: number[] = [];
    let succeeded = 0;
    let failed = 0;
    const startOverall = performance.now();

    try {
      // Create a temporary load-test published exam
      const createRes = await apiFetch('/api/teacher/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Đề Kiểm Thử Tải Đồng Thời (Load Test)',
          subject: 'Toán Học',
          status: 'published',
          durationMinutes: 15,
          totalScale: 10,
          questions: [
            {
              id: 'lt-1',
              orderIndex: 1,
              type: 'single_choice',
              prompt: 'Câu hỏi kiểm thử tải đồng thời: $2^3 = ?$',
              options: [
                { id: 'A', label: 'A', text: '8' },
                { id: 'B', label: 'B', text: '6' },
              ],
              correctAnswers: ['A'],
              points: 10,
              explanation: '2^3 = 8',
              needsReview: false,
            },
          ],
        }),
      });
      const created = await createRes.json();
      const code = created.exam?.shareCode;
      const examId = created.exam?.id;

      if (code && examId) {
        const tasks = Array.from({ length: CONCURRENT_STUDENTS }).map(
          async (_, idx) => {
            const t0 = performance.now();
            try {
              const sRes = await fetch(
                resolveApiUrl(`/api/student/exams/${code}/start`),
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    studentName: `Học sinh Đồng thời #${idx + 1}`,
                    studentClass: '12A1',
                  }),
                }
              );
              const sData = await sRes.json();
              if (!sRes.ok) throw new Error('Start failed');

              const subId = sData.submission.id;
              const token = sData.studentAccessToken;

              const subRes = await fetch(
                resolveApiUrl(`/api/student/submissions/${subId}/submit`),
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Submission-Token': token,
                  },
                  body: JSON.stringify({
                    answers: {
                      'lt-1': {
                        questionId: 'lt-1',
                        selectedOptions: ['A'],
                      },
                    },
                  }),
                }
              );
              if (!subRes.ok) throw new Error('Submit failed');
              latencies.push(performance.now() - t0);
              succeeded += 1;
            } catch {
              failed += 1;
            }
          }
        );

        await Promise.all(tasks);
        await apiFetch(`/api/teacher/exams/${examId}`, { method: 'DELETE' });
      }

      const sorted = [...latencies].sort((a, b) => a - b);
      const avg =
        sorted.length > 0
          ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
          : 0;
      const p95 =
        sorted.length > 0
          ? Math.round(sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1])
          : 0;

      setLoadReport({
        concurrentUsers: CONCURRENT_STUDENTS,
        totalRequests: CONCURRENT_STUDENTS * 2,
        succeeded,
        failed,
        avgLatencyMs: avg,
        p95LatencyMs: p95,
        totalDurationMs: Math.round(performance.now() - startOverall),
      });
    } finally {
      setRunningLoadTest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation inside Dashboard */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveSubTab('overview')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'overview'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tổng quan &amp; Quản lý Tài khoản
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('security_load')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'security_load'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kiểm thử Bảo mật &amp; Tải đồng thời
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('deployment_guide')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'deployment_guide'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hướng dẫn Triển khai Thực tế &amp; Checklist
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSeedSandboxDemo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            title="Nạp đề mẫu Sinh Học 11 (TN-ĐS-TLN) và Toán 12 để thử nghiệm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Nạp đề thử nghiệm [DEMO]</span>
          </button>
          <button
            type="button"
            onClick={handleClearSandboxDemo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa dữ liệu [DEMO]</span>
          </button>
          {currentUser.role === 'admin' && (
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sao lưu Hệ thống (.JSON)</span>
            </button>
          )}
        </div>
      </div>

      {sandboxNotice && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
          <span>{sandboxNotice}</span>
          <button
            type="button"
            onClick={() => setSandboxNotice(null)}
            className="text-blue-700 font-bold"
          >
            Đóng
          </button>
        </div>
      )}

      {activeSubTab === 'overview' && (
        <>
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
              <div className="text-xs text-slate-500 font-medium">
                Tài khoản đang phiên
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {currentUser.displayName}
              </div>
              <div className="text-xs font-mono text-blue-700 uppercase">
                VAI TRÒ: {currentUser.role}
              </div>
            </div>

            <div
              onClick={() => onNavigate('/admin/exams')}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-1 cursor-pointer hover:border-blue-300 transition-colors"
            >
              <div className="text-xs text-slate-500 font-medium">
                Đề thi thuộc quyền quản lý
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {examsCount}
              </div>
              <div className="text-xs text-blue-700 font-semibold">
                Quản lý đề thi &rarr;
              </div>
            </div>

            <div
              onClick={() => onNavigate('/admin/exams')}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-1 cursor-pointer hover:border-blue-300 transition-colors"
            >
              <div className="text-xs text-slate-500 font-medium">
                Thư mục phân loại đề
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {foldersCount}
              </div>
              <div className="text-xs text-blue-700 font-semibold">
                Quản lý thư mục &rarr;
              </div>
            </div>

            <div
              onClick={() => onNavigate('/admin/results')}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-1 cursor-pointer hover:border-blue-300 transition-colors"
            >
              <div className="text-xs text-slate-500 font-medium">
                Tổng lượt bài làm
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {submissionsCount}
              </div>
              <div className="text-xs text-blue-700 font-semibold">
                Xem &amp; Xuất kết quả CSV &rarr;
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Admin Role & User Management */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-700" />
                  <span>
                    Quản lý Tài khoản &amp; Phân quyền Giáo viên (Chỉ Admin)
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Các quản trị viên hoặc giáo viên tiếp theo chỉ được tạo hoặc cấp quyền bởi Quản trị viên hiện có.
                </p>
              </div>

              {currentUser.role !== 'admin' ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                  Bạn đang đăng nhập với vai trò{' '}
                  <code className="font-mono font-bold">teacher</code>. Chỉ Quản trị viên (<code className="font-mono font-bold">admin</code>) mới có quyền tạo tài khoản giáo viên mới hoặc thay đổi vai trò người dùng.
                </div>
              ) : (
                <>
                  {userFormError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                      {userFormError}
                    </div>
                  )}
                  {userFormNotice && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                      {userFormNotice}
                    </div>
                  )}

                  <form
                    onSubmit={handleCreateUserByAdmin}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                  >
                    <div className="text-xs font-bold text-slate-800">
                      + Cấp tài khoản Giáo viên / Quản trị viên mới
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="email"
                        required
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="Email giáo viên..."
                        className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        required
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="Họ tên (VD: Cô Nguyễn Thị Lan)"
                        className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Mật khẩu khởi tạo (>= 8 ký tự)"
                        className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                      <div className="flex gap-2">
                        <select
                          value={newUserRole}
                          onChange={(e) =>
                            setNewUserRole(e.target.value as UserRole)
                          }
                          className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                        >
                          <option value="teacher">role: teacher</option>
                          <option value="admin">role: admin</option>
                          <option value="student">role: student</option>
                        </select>
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shrink-0"
                        >
                          Tạo
                        </button>
                      </div>
                    </div>
                  </form>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {allUsers.map((u) => (
                      <div
                        key={u.uid}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {u.displayName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">
                            {u.email}
                          </div>
                        </div>

                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleChangeUserRole(
                              u.uid,
                              e.target.value as UserRole
                            )
                          }
                          className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md"
                        >
                          <option value="student">student</option>
                          <option value="teacher">teacher</option>
                          <option value="admin">admin</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Administrative Audit Logs */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-700" />
                  <span>Nhật ký Thao tác Quản trị &amp; Bảo mật (Audit Log)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Ghi nhận tự động các thao tác khởi tạo Admin, đăng nhập, xuất bản/đóng đề, nâng phiên bản và các hành vi truy cập trái phép.
                </p>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    Chưa có bản ghi nhật ký nào.
                  </p>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        log.action === 'UNAUTHORIZED_ATTEMPT'
                          ? 'bg-red-50/70 border-red-200 text-red-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                        <span className="font-bold">{log.action}</span>
                        <span className="text-slate-500">
                          {new Date(log.createdAt).toLocaleTimeString('vi-VN')}
                        </span>
                      </div>
                      <p className="leading-snug">{log.details}</p>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Thực hiện bởi: {log.actorEmail} ({log.actorRole})
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {activeSubTab === 'security_load' && (
        <div className="space-y-6">
          {/* Automated 7-Scenario Security Verification Suite */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    Kiểm thử Bảo mật Trực tiếp trên Backend (7 Kịch bản)
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Xác minh Khóa Bootstrap, Phân quyền RBAC/RLS &amp; Chống lộ đáp án
                </h2>
              </div>

              <button
                type="button"
                onClick={runAllSevenSecurityTests}
                disabled={runningTests}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4" />
                <span>
                  {runningTests
                    ? 'Đang kiểm thử...'
                    : 'Chạy kiểm thử cả 7 kịch bản bảo mật'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {securityTests.map((tc) => (
                <div
                  key={tc.id}
                  className={`p-4 rounded-xl border space-y-2 ${
                    tc.status === 'passed'
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : tc.status === 'failed'
                      ? 'bg-red-50/40 border-red-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-bold text-slate-900">
                      {tc.title}
                    </div>
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded shrink-0 ${
                        tc.status === 'passed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : tc.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : tc.status === 'running'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tc.status === 'passed'
                        ? `ĐẠT (HTTP ${tc.httpCode})`
                        : tc.status === 'failed'
                        ? `LỖI (${tc.httpCode})`
                        : tc.status === 'running'
                        ? 'ĐANG CHẠY...'
                        : 'CHƯA CHẠY'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{tc.description}</p>
                  {tc.serverResponse && (
                    <div className="p-2 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-700 break-words">
                      Server: {tc.serverResponse}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Stage 5: Concurrency Load Test Runner */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <Zap className="w-4 h-4" />
                  <span>Kiểm thử Chịu tải Đồng thời (Concurrency Load Test)</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Mô phỏng 15 học sinh cùng vào phòng thi và nộp bài đồng thời
                </h3>
                <p className="text-xs text-slate-500">
                  Đo thời gian phản hồi trung bình (Avg Latency) và phân vị 95 (P95) khi xử lý chấm điểm song song trên Backend.
                </p>
              </div>

              <button
                type="button"
                onClick={runConcurrentExamLoadTest}
                disabled={runningLoadTest}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>
                  {runningLoadTest
                    ? 'Đang chạy tải đồng thời...'
                    : 'Chạy Kiểm thử Tải Đồng thời (15 Thí sinh)'}
                </span>
              </button>
            </div>

            {loadReport && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 font-mono tabular-nums">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-sans text-slate-500">
                    Số thí sinh đồng thời
                  </div>
                  <div className="text-base font-bold text-slate-900">
                    {loadReport.concurrentUsers} HS
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-sans text-slate-500">
                    Tổng Request API
                  </div>
                  <div className="text-base font-bold text-slate-900">
                    {loadReport.totalRequests} reqs
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-[11px] font-sans text-emerald-700">
                    Thành công / Lỗi
                  </div>
                  <div className="text-base font-bold text-emerald-800">
                    {loadReport.succeeded} / {loadReport.failed}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-sans text-slate-500">
                    Độ trễ TB (Avg)
                  </div>
                  <div className="text-base font-bold text-slate-900">
                    {loadReport.avgLatencyMs} ms
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-sans text-slate-500">
                    Độ trễ P95
                  </div>
                  <div className="text-base font-bold text-blue-700">
                    {loadReport.p95LatencyMs} ms
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'deployment_guide' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 text-xs text-slate-700 leading-relaxed">
          <div className="border-b border-slate-200 pb-4 space-y-1">
            <div className="flex items-center gap-2 text-emerald-700 font-bold">
              <Terminal className="w-4 h-4" />
              <span>HƯỚNG DẪN TRIỂN KHAI THỰC TẾ TỪ ĐẦU (PRODUCTION GUIDE)</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Kiến trúc 2 Frontend Độc lập (Cloudflare Pages) + Backend &amp; Cơ sở dữ liệu Dùng chung
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <h3 className="text-sm font-bold text-slate-900">
                1. Cách tách &amp; triển khai 2 Frontend lên 2 Subdomain miễn phí (Cloudflare Pages)
              </h3>
              <p>
                Mã nguồn đã được cấu hình sẵn 2 lệnh build độc lập trong{' '}
                <code className="font-mono bg-white px-1 py-0.5 border rounded">
                  package.json
                </code>
                :
              </p>
              <ul className="list-disc list-inside space-y-1.5">
                <li>
                  <strong>Dự án 1 — Website Học sinh</strong> (VD:{' '}
                  <code className="font-mono">khaothiso-student.pages.dev</code>{' '}
                  hoặc gắn domain <code className="font-mono">www.taodethi.xyz</code>):
                  <div className="mt-1 p-2 bg-slate-900 text-slate-100 font-mono rounded text-[11px]">
                    Build command: npm run build:student
                    <br />
                    Build output directory: dist/student
                    <br />
                    Env: VITE_APP_TARGET=student, VITE_API_BASE_URL=https://api.domain
                  </div>
                </li>
                <li>
                  <strong>Dự án 2 — Website Quản trị</strong> (VD:{' '}
                  <code className="font-mono">khaothiso-admin.pages.dev</code>{' '}
                  hoặc gắn domain <code className="font-mono">admin.taodethi.xyz</code>):
                  <div className="mt-1 p-2 bg-slate-900 text-slate-100 font-mono rounded text-[11px]">
                    Build command: npm run build:admin
                    <br />
                    Build output directory: dist/admin
                    <br />
                    Env: VITE_APP_TARGET=admin, VITE_API_BASE_URL=https://api.domain
                  </div>
                </li>
              </ul>
            </div>

            <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <h3 className="text-sm font-bold text-slate-900">
                2. Hạn mức miễn phí &amp; Rủi ro chi phí (Cloudflare + Supabase / Firebase)
              </h3>
              <ul className="list-disc list-inside space-y-1.5">
                <li>
                  <strong>Cloudflare Pages (Free Tier)</strong>: Băng thông không giới hạn (Unlimited bandwidth), 500 lần build/tháng, miễn phí chứng chỉ SSL và gắn Custom Domain. Không yêu cầu thẻ tín dụng.
                </li>
                <li>
                  <strong>Supabase (Free Tier)</strong>: 500MB PostgreSQL Database, 1GB File Storage, 50.000 Monthly Active Users. Đã có sẵn file migration SQL + Row Level Security tại{' '}
                  <code className="font-mono bg-white px-1 py-0.5 border rounded">
                    supabase/migrations/001_schema_and_rls.sql
                  </code>
                  .
                </li>
                <li>
                  <strong>Firebase Firestore (Spark Free Plan)</strong>: 1 GiB lưu trữ, 50.000 lượt đọc/ngày, 20.000 lượt ghi/ngày hoàn toàn miễn phí.
                </li>
              </ul>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              3. Danh sách kiểm tra (Pre-Launch Checklist) trước khi đưa vào thi thật
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Đã đặt biến <code className="font-mono">SESSION_SIGNING_SECRET</code> ngẫu nhiên tối thiểu 32 ký tự trên Backend.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Đã hoàn tất tạo Quản trị viên đầu tiên và kiểm tra trạng thái Bootstrap hiển thị <strong>ĐÃ KHÓA VĨNH VIỄN</strong>.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Đã bấm <strong>Xóa dữ liệu [DEMO]</strong> để dọn sạch toàn bộ đề mẫu thử nghiệm trước khi mở cho học sinh.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Đã cấu hình <code className="font-mono">ALLOWED_ORIGINS</code> chứa đúng tên miền của Website Học sinh và Website Quản trị.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// 3. LEGACY QUESTION BANK (DEPRECATED - Replaced by Folder Management)
// =========================================================================
export const TeacherQuestionBankPage: React.FC = () => {
  return null;
};

// =========================================================================
// 4. TEACHER RESULTS MANAGEMENT PAGE (`/admin/results`) + CSV EXPORT
// =========================================================================
interface TeacherResultsPageProps {
  onOpenExamSubmissionsModal: (examId: string) => void;
}

export const TeacherResultsPage: React.FC<TeacherResultsPageProps> = ({
  onOpenExamSubmissionsModal,
}) => {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<string>('all');

  useEffect(() => {
    async function loadResults() {
      setLoading(true);
      try {
        const res = await apiFetch('/api/teacher/results');
        if (res.ok) {
          const data = await res.json();
          setSubmissions(data.submissions || []);
          setExams(data.exams || []);
        }
      } finally {
        setLoading(false);
      }
    }
    loadResults();
  }, []);

  const handleExportCsv = async (examId: string, shareCode: string) => {
    const res = await apiFetch(`/api/teacher/exams/${examId}/export-csv`);
    if (!res.ok) return;
    const csvText = await res.text();
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bang_Diem_${shareCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = submissions.filter(
    (s) => selectedExamId === 'all' || s.examId === selectedExamId
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Quản lý Kết quả &amp; Xuất Bảng điểm CSV
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi lượt làm bài, số lần chuyển tab và xuất bảng điểm CSV chuẩn tiếng Việt khi đủ quyền sở hữu đề
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg font-medium"
          >
            <option value="all">Tất cả đề thi của tôi ({exams.length})</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title} (Mã: {ex.shareCode})
              </option>
            ))}
          </select>

          {selectedExamId !== 'all' && (
            <button
              type="button"
              onClick={() => {
                const ex = exams.find((x) => x.id === selectedExamId);
                if (ex) handleExportCsv(ex.id, ex.shareCode);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất CSV Bảng điểm</span>
            </button>
          )}
        </div>
      </div>

      {/* Per-exam quick summary cards with CSV export */}
      {exams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exams.map((ex) => {
            const count = submissions.filter((s) => s.examId === ex.id).length;
            return (
              <div
                key={ex.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono font-bold text-blue-700">
                    MÃ: {ex.shareCode} · v{ex.version || 1}
                  </div>
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {ex.title}
                  </div>
                  <div className="text-xs text-slate-500">
                    {count} lượt nộp bài
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleExportCsv(ex.id, ex.shareCode)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenExamSubmissionsModal(ex.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Chi tiết</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
          Đang tải dữ liệu kết quả thi...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
          Chưa có lượt làm bài nào cho bộ lọc hiện tại.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                  <th className="py-3 px-4">Học sinh</th>
                  <th className="py-3 px-4">Lớp / Mã số</th>
                  <th className="py-3 px-4">Bài thi (Phiên bản)</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Điểm số</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filtered.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {sub.studentName}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {sub.studentClass}{' '}
                      {sub.studentCode ? `· ${sub.studentCode}` : ''}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {sub.examTitle || sub.shareCode}{' '}
                      <span className="font-mono text-slate-400">
                        (v{sub.examVersion || 1})
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {sub.status === 'submitted' ? (
                        <span className="text-emerald-700 font-semibold">
                          ● Đã nộp {sub.autoSubmitted ? '(Hết giờ)' : ''}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">
                          ▲ Đang làm bài
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                      {sub.scaledScore !== null
                        ? `${sub.scaledScore} / ${sub.totalScale}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenExamSubmissionsModal(sub.examId)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Chi tiết &amp; Mở đáp án
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
