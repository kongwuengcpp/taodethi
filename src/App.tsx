import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileUp,
  Plus,
  Edit3,
  Users,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Lock,
  Unlock,
  Search,
  LogOut,
  ShieldAlert,
  Globe,
  Folder,
  FolderPlus,
  FolderOpen,
  ArrowRightLeft,
} from 'lucide-react';
import { DocumentUploadModal } from './components/DocumentUploadModal';
import { SplitExamEditor } from './components/SplitExamEditor';
import { TeacherSubmissionsModal } from './components/TeacherSubmissionsModal';
import { StudentExamPortal } from './components/StudentExamPortal';
import {
  StudentHomePage,
  StudentMyResultsPage,
} from './components/StudentZonePages';
import {
  TeacherLoginPage,
  TeacherDashboardPage,
  TeacherResultsPage,
} from './components/TeacherZonePages';
import {
  apiFetch,
  setAuthSession,
  detectStandaloneAppTarget,
} from './lib/authClient';
import { syncExamMetadataToFirestore } from './lib/firebase';
import type { Exam, Submission, UserAccount, ExamFolder } from './types/exam';

interface ExamWithStats extends Exam {
  stats?: {
    totalAttempts: number;
    submittedCount: number;
    avgScore: number | null;
    reviewCount: number;
  };
}

export default function App() {
  const [pathname, setPathname] = useState<string>(() => {
    if (typeof window === 'undefined') return '/';
    // Support hash-based routing: e.g. #/admin/login or #/teacher/login
    if (window.location.hash && window.location.hash.startsWith('#/')) {
      return window.location.hash.slice(1).replace(/\/+$/, '') || '/';
    }
    const params = new URLSearchParams(window.location.search);
    const examParam = params.get('exam');
    if (examParam) {
      const target = `/exam/${encodeURIComponent(examParam.toUpperCase())}`;
      window.history.replaceState({}, '', target);
      return target;
    }
    if (params.has('admin') || params.get('portal') === 'admin') {
      return '/admin/login';
    }
    return window.location.pathname.replace(/\/+$/, '') || '/';
  });

  const navigate = useCallback((nextPath: string) => {
    const clean = nextPath.replace(/\/+$/, '') || '/';
    window.history.pushState({}, '', clean);
    setPathname(clean);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onLocationChange = () => {
      let current = window.location.pathname.replace(/\/+$/, '') || '/';
      if (window.location.hash && window.location.hash.startsWith('#/')) {
        current = window.location.hash.slice(1).replace(/\/+$/, '') || '/';
      }
      const params = new URLSearchParams(window.location.search);
      if (params.has('admin') || params.get('portal') === 'admin') {
        current = '/admin/login';
      }
      setPathname(current);
    };
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('hashchange', onLocationChange);
    return () => {
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('hashchange', onLocationChange);
    };
  }, []);

  // Determine whether we are running the standalone Student Web App or Admin Web App
  const appTarget = detectStandaloneAppTarget(pathname);
  const isBuildTargetLocked = false;

  // Authoritative server-verified user state (stored strictly in memory)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  // Teacher / Admin Exam & Folder State
  const [exams, setExams] = useState<ExamWithStats[]>([]);
  const [folders, setFolders] = useState<ExamFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [uncategorizedCount, setUncategorizedCount] = useState<number>(0);
  const [loadingExams, setLoadingExams] = useState(false);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [versionBumpNotice, setVersionBumpNotice] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'published' | 'draft' | 'closed' | 'review'
  >('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Folder Modals State
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('blue');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  const [folderActionError, setFolderActionError] = useState<string | null>(null);

  const [editingFolder, setEditingFolder] = useState<ExamFolder | null>(null);
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<ExamFolder | null>(null);
  const [movingExam, setMovingExam] = useState<ExamWithStats | null>(null);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [submissionsModalData, setSubmissionsModalData] = useState<{
    exam: Exam;
    submissions: Submission[];
  } | null>(null);
  const [deleteConfirmExam, setDeleteConfirmExam] =
    useState<ExamWithStats | null>(null);

  const fetchTeacherWorkspaceData = useCallback(async () => {
    setLoadingExams(true);
    try {
      const [examsRes, foldersRes] = await Promise.all([
        apiFetch('/api/teacher/exams'),
        apiFetch('/api/teacher/folders'),
      ]);

      if (examsRes.ok) {
        const data = await examsRes.json();
        setExams(data.exams || []);
      }
      if (foldersRes.ok) {
        const fData = await foldersRes.json();
        setFolders(fData.folders || []);
        setUncategorizedCount(fData.uncategorizedCount || 0);
      }
    } finally {
      setLoadingExams(false);
    }
  }, []);

  // Check active session via HttpOnly cookie on initial load
  useEffect(() => {
    async function verifyInitialSession() {
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
            setAuthSession(null, data.user);
            if (
              data.user.role === 'teacher' ||
              data.user.role === 'admin'
            ) {
              fetchTeacherWorkspaceData();
            }
          }
        }
      } catch {
        // Network or fetch failure handled gracefully
      } finally {
        setAuthChecked(true);
      }
    }
    verifyInitialSession();
  }, [fetchTeacherWorkspaceData]);

  // Normalize admin route paths (/admin/* or /teacher/*)
  const normalizedPath = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const isLoginRoute =
    normalizedPath === '/admin/login' ||
    normalizedPath === '/teacher/login' ||
    normalizedPath === '/admin' ||
    normalizedPath === '/teacher' ||
    (appTarget === 'admin' && normalizedPath === '/');

  useEffect(() => {
    if (
      authChecked &&
      appTarget === 'admin' &&
      !isLoginRoute &&
      !currentUser
    ) {
      navigate('/admin/login');
    }
  }, [authChecked, appTarget, isLoginRoute, currentUser, navigate]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setAuthSession(null, null);
    setCurrentUser(null);
    setExams([]);
    setActiveExam(null);
    navigate('/admin/login');
  };

  const handleOpenExamEditor = async (examId: string) => {
    const res = await apiFetch(`/api/teacher/exams/${examId}`);
    const data = await res.json();
    if (res.ok && data.exam) {
      setActiveExam(data.exam);
      setVersionBumpNotice(null);
      navigate('/admin/exams');
    }
  };

  const handleCreatedExamFromExtraction = async (draftExam: Partial<Exam>) => {
    setShowUploadModal(false);
    const initialFolderId =
      draftExam.folderId ||
      (selectedFolderId !== 'all' && selectedFolderId !== 'uncategorized'
        ? selectedFolderId
        : null);
    const res = await apiFetch('/api/teacher/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draftExam,
        folderId: initialFolderId,
        status: 'draft',
      }),
    });
    const data = await res.json();
    if (res.ok && data.exam) {
      await syncExamMetadataToFirestore(data.exam);
      await fetchTeacherWorkspaceData();
      setActiveExam(data.exam);
      navigate('/admin/exams');
    }
  };

  const handleSaveExam = async (updatedExam: Exam) => {
    setIsSavingExam(true);
    setVersionBumpNotice(null);
    try {
      const res = await apiFetch(`/api/teacher/exams/${updatedExam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedExam),
      });
      const data = await res.json();
      if (res.ok && data.exam) {
        setActiveExam(data.exam);
        await syncExamMetadataToFirestore(data.exam);
        if (data.versionBumped) {
          setVersionBumpNotice(
            `Đề thi đã có ${data.activeAttemptsProtected} lượt học sinh tham gia. Hệ thống đã tự động nâng đề lên Phiên bản v${data.exam.version} để không làm ảnh hưởng đến các bài thi đang diễn ra.`
          );
        }
        await fetchTeacherWorkspaceData();
      }
    } finally {
      setIsSavingExam(false);
    }
  };

  const handleOpenSubmissionsModal = async (examId: string) => {
    const res = await apiFetch(`/api/teacher/exams/${examId}/submissions`);
    const data = await res.json();
    if (res.ok && data.exam) {
      setSubmissionsModalData({
        exam: data.exam,
        submissions: data.submissions || [],
      });
    }
  };

  const handleToggleReleaseSolutions = async (
    examId: string,
    nextReleased: boolean
  ) => {
    const res = await apiFetch(`/api/teacher/exams/${examId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solutionsReleased: nextReleased }),
    });
    const data = await res.json();
    if (res.ok && data.exam) {
      if (submissionsModalData && submissionsModalData.exam.id === examId) {
        setSubmissionsModalData({
          ...submissionsModalData,
          exam: data.exam,
        });
      }
      await fetchTeacherWorkspaceData();
    }
  };

  const handleConfirmDeleteExam = async () => {
    if (!deleteConfirmExam) return;
    await apiFetch(`/api/teacher/exams/${deleteConfirmExam.id}`, {
      method: 'DELETE',
    });
    setDeleteConfirmExam(null);
    await fetchTeacherWorkspaceData();
  };

  const handleCopyShareLink = (shareCode: string, id: string) => {
    const studentDomainBase =
      import.meta.env.VITE_STUDENT_APP_URL || window.location.origin;
    const url = `${studentDomainBase.replace(/\/+$/, '')}/exam/${shareCode}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Folder Color Styling Palette
  const FOLDER_COLORS = [
    { id: 'blue', label: 'Xanh dương', border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800 border-blue-200', active: 'bg-blue-600 text-white', dot: 'bg-blue-500' },
    { id: 'indigo', label: 'Xanh chàm', border: 'border-indigo-200', bg: 'bg-indigo-50', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', active: 'bg-indigo-600 text-white', dot: 'bg-indigo-500' },
    { id: 'emerald', label: 'Xanh lá', border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', active: 'bg-emerald-600 text-white', dot: 'bg-emerald-500' },
    { id: 'purple', label: 'Tím', border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800 border-purple-200', active: 'bg-purple-600 text-white', dot: 'bg-purple-500' },
    { id: 'rose', label: 'Hồng sen', border: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800 border-rose-200', active: 'bg-rose-600 text-white', dot: 'bg-rose-500' },
    { id: 'amber', label: 'Vàng cam', border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800 border-amber-200', active: 'bg-amber-600 text-white', dot: 'bg-amber-500' },
    { id: 'cyan', label: 'Xanh ngọc', border: 'border-cyan-200', bg: 'bg-cyan-50', text: 'text-cyan-700', badge: 'bg-cyan-100 text-cyan-800 border-cyan-200', active: 'bg-cyan-600 text-white', dot: 'bg-cyan-500' },
  ];

  const getFolderStyle = (color?: string) => {
    return FOLDER_COLORS.find((c) => c.id === color) || FOLDER_COLORS[0];
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setFolderActionError(null);
    try {
      const res = await apiFetch('/api/teacher/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          color: newFolderColor,
          description: newFolderDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFolderActionError(data.error || 'Tạo thư mục thất bại.');
        return;
      }
      setShowCreateFolderModal(false);
      setNewFolderName('');
      setNewFolderDesc('');
      await fetchTeacherWorkspaceData();
      if (data.folder?.id) {
        setSelectedFolderId(data.folder.id);
      }
    } catch {
      setFolderActionError('Không thể kết nối máy chủ khi tạo thư mục.');
    }
  };

  const handleUpdateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder || !editingFolder.name.trim()) return;
    setFolderActionError(null);
    try {
      const res = await apiFetch(`/api/teacher/folders/${editingFolder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingFolder.name.trim(),
          color: editingFolder.color,
          description: editingFolder.description?.trim() || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFolderActionError(data.error || 'Cập nhật thư mục thất bại.');
        return;
      }
      setEditingFolder(null);
      await fetchTeacherWorkspaceData();
    } catch {
      setFolderActionError('Không thể kết nối máy chủ.');
    }
  };

  const handleConfirmDeleteFolder = async (folderId: string) => {
    try {
      const res = await apiFetch(`/api/teacher/folders/${folderId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeleteFolderConfirm(null);
        if (selectedFolderId === folderId) {
          setSelectedFolderId('all');
        }
        await fetchTeacherWorkspaceData();
      }
    } catch {
      // Ignored
    }
  };

  const handleMoveExamFolder = async (examId: string, targetFolderId: string | null) => {
    try {
      const res = await apiFetch(`/api/teacher/exams/${examId}/folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
      if (res.ok) {
        setMovingExam(null);
        await fetchTeacherWorkspaceData();
      }
    } catch {
      // Ignored
    }
  };

  // Optional Preview Domain Switcher Bar (ONLY visible when previewing both standalone apps in single AI Studio preview URL)
  const renderPreviewDomainBar = () => {
    if (isBuildTargetLocked) return null;
    return (
      <div className="bg-slate-950 text-slate-300 border-b border-slate-800 px-4 py-1.5 text-[11px] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>
            Kiến trúc 2 Website Độc lập (Chung Backend API &amp; Database):
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <button
            type="button"
            onClick={() => navigate('/')}
            className={`px-2.5 py-0.5 rounded transition-colors ${
              appTarget === 'student'
                ? 'bg-blue-600 text-white font-bold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            1. Web Học sinh (www.*)
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(
                currentUser &&
                  (currentUser.role === 'teacher' ||
                    currentUser.role === 'admin')
                  ? '/admin/dashboard'
                  : '/admin/login'
              )
            }
            className={`px-2.5 py-0.5 rounded transition-colors ${
              appTarget === 'admin'
                ? 'bg-amber-600 text-white font-bold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            2. Web Quản trị GV (admin.*)
          </button>
        </div>
      </div>
    );
  };

  // =========================================================================
  // APPLICATION 1: STANDALONE STUDENT WEB APP (`/`, `/exam/:examId`, `/my-results`)
  // Strictly ZERO exam creation, question bank, user management, or admin links!
  // =========================================================================
  if (appTarget === 'student') {
    const isExamRunner = pathname.startsWith('/exam/');
    const examIdParam = isExamRunner
      ? decodeURIComponent(pathname.replace('/exam/', '').split('/')[0] || '')
      : '';

    return (
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
        {renderPreviewDomainBar()}

        {/* Pure Student Header — Zero Admin/Teacher Clutter */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Khảo Thí Số
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigate('/');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                pathname === '/'
                  ? 'text-slate-900 underline underline-offset-4'
                  : ''
              }`}
            >
              Danh sách Đề thi
            </a>
            <a
              href="/my-results"
              onClick={(e) => {
                e.preventDefault();
                navigate('/my-results');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                pathname === '/my-results'
                  ? 'text-slate-900 underline underline-offset-4'
                  : ''
              }`}
            >
              Kết quả đã nộp của tôi
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/my-results')}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Kết quả của tôi
            </button>
            <a
              href="/admin/login"
              onClick={(e) => {
                e.preventDefault();
                navigate(
                  currentUser &&
                    (currentUser.role === 'teacher' ||
                      currentUser.role === 'admin')
                    ? '/admin/dashboard'
                    : '/admin/login'
                );
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-2xs"
              title="Truy cập Cổng Quản trị & Tạo đề thi dành cho Giáo viên"
            >
              <span>Cổng Quản trị</span>
            </a>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 py-8">
          {isExamRunner && examIdParam ? (
            <StudentExamPortal
              examCodeOrId={examIdParam}
              onBackToStudentHome={() => navigate('/')}
              onGoToMyResults={() => navigate('/my-results')}
            />
          ) : pathname === '/my-results' ? (
            <StudentMyResultsPage onGoToStudentHome={() => navigate('/')} />
          ) : (
            <StudentHomePage
              onSelectExam={(code) => navigate(`/exam/${code}`)}
              onGoToMyResults={() => navigate('/my-results')}
            />
          )}
        </main>

        <footer className="bg-white border-t border-slate-200 px-6 py-4 mt-12">
          <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <span>
              Khảo Thí Số — Website Làm Bài Thi Trực Tuyến Dành Riêng Cho Học Sinh
            </span>
            <a
              href="/admin/login"
              onClick={(e) => {
                e.preventDefault();
                navigate(
                  currentUser &&
                    (currentUser.role === 'teacher' ||
                      currentUser.role === 'admin')
                    ? '/admin/dashboard'
                    : '/admin/login'
                );
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors underline-offset-2 hover:underline"
            >
              Dành cho Giáo viên &amp; Quản trị (/admin/login)
            </a>
          </div>
        </footer>
      </div>
    );
  }

  // =========================================================================
  // APPLICATION 2: STANDALONE TEACHER & ADMIN WEB APP (`/admin/*` or `admin.*`)
  // =========================================================================
  const totalSubmissionsCount = exams.reduce(
    (acc, e) => acc + (e.stats?.totalAttempts || 0),
    0
  );

  const filteredExams = useMemo(() => {
    return exams.filter((e) => {
      // 1. Folder Filter
      if (selectedFolderId !== 'all') {
        if (selectedFolderId === 'uncategorized') {
          if (e.folderId) return false;
        } else {
          if (e.folderId !== selectedFolderId) return false;
        }
      }

      // 2. Search
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        e.shareCode.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      // 3. Status
      if (statusFilter === 'published') return e.status === 'published';
      if (statusFilter === 'draft') return e.status === 'draft';
      if (statusFilter === 'closed') return e.status === 'closed';
      if (statusFilter === 'review')
        return (
          (e.stats?.reviewCount ??
            e.questions.filter((x) => x.needsReview).length) > 0
        );
      return true;
    });
  }, [exams, selectedFolderId, searchQuery, statusFilter]);

  const isDashboardView =
    pathname === '/admin/dashboard' ||
    pathname === '/teacher/dashboard' ||
    pathname === '/admin';
  const isResultsView =
    pathname === '/admin/results' || pathname === '/teacher/results';
  const isExamsView =
    pathname === '/admin/exams' ||
    pathname === '/teacher/exams' ||
    pathname === '/admin/questions' ||
    pathname === '/teacher/questions';

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {renderPreviewDomainBar()}

      {/* Dedicated Admin / Teacher Top Bar */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between gap-8 border-b border-slate-800">
        <a
          href="/admin/dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveExam(null);
            navigate(currentUser ? '/admin/dashboard' : '/admin/login');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Khảo Thí Số · Quản Trị Đề Thi
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <a
            href="/admin/dashboard"
            onClick={(e) => {
              e.preventDefault();
              setActiveExam(null);
              navigate('/admin/dashboard');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              isDashboardView ? 'text-white underline underline-offset-4' : ''
            }`}
          >
            Bảng điều khiển &amp; Bảo mật
          </a>
          <a
            href="/admin/exams"
            onClick={(e) => {
              e.preventDefault();
              setActiveExam(null);
              navigate('/admin/exams');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              isExamsView ? 'text-white underline underline-offset-4' : ''
            }`}
          >
            Quản lý đề thi &amp; Thư mục ({exams.length})
          </a>
          <a
            href="/admin/results"
            onClick={(e) => {
              e.preventDefault();
              setActiveExam(null);
              navigate('/admin/results');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              isResultsView ? 'text-white underline underline-offset-4' : ''
            }`}
          >
            Quản lý kết quả ({totalSubmissionsCount})
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {currentUser ? (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-red-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Đăng xuất ({currentUser.role.toUpperCase()})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/admin/login')}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Đăng nhập Quản trị
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 py-6">
        {isLoginRoute ? (
          <TeacherLoginPage
            onLoginSuccess={(user) => {
              setCurrentUser(user);
              if (user.role === 'teacher' || user.role === 'admin') {
                fetchTeacherWorkspaceData();
                navigate('/admin/dashboard');
              } else {
                navigate('/admin/dashboard');
              }
            }}
            onGoToStudentZone={() => navigate('/')}
          />
        ) : !currentUser ? (
          <div className="max-w-md mx-auto my-16 bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4">
            <p className="text-sm font-semibold text-slate-800">
              Vui lòng đăng nhập để truy cập hệ thống quản trị đề thi.
            </p>
            <button
              type="button"
              onClick={() => navigate('/admin/login')}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
            >
              Đi tới trang Đăng nhập (/admin/login)
            </button>
          </div>
        ) : currentUser.role === 'student' ? (
          /* Case 2 Guard: Authenticated Student attempting to access /admin/* routes */
          <div className="max-w-xl mx-auto my-12 bg-white border border-red-200 rounded-xl p-8 space-y-5">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-mono font-bold text-red-700 uppercase">
                HTTP 403 FORBIDDEN · TỪ CHỐI TRUY CẬP QUẢN TRỊ
              </div>
              <h1 className="text-xl font-bold text-slate-900">
                Tài khoản Học sinh không có quyền truy cập Website Quản trị
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Bạn đang đăng nhập với tài khoản <strong>{currentUser.email}</strong> có vai trò là{' '}
                <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono font-bold">
                  student
                </code>
                . Máy chủ đã chặn toàn bộ dữ liệu quản trị, ngân hàng câu hỏi và chức năng tạo/sửa đề thi đối với tài khoản học sinh.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
              >
                Chuyển sang Website Học sinh (/)
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Đăng xuất &amp; Đổi tài khoản Giáo viên
              </button>
            </div>
          </div>
        ) : isDashboardView ? (
          <TeacherDashboardPage
            currentUser={currentUser}
            examsCount={exams.length}
            foldersCount={folders.length}
            submissionsCount={totalSubmissionsCount}
            onNavigate={(route) =>
              navigate(route.replace(/^\/teacher/, '/admin'))
            }
            onRefreshWorkspace={fetchTeacherWorkspaceData}
          />
        ) : isResultsView ? (
          <TeacherResultsPage
            onOpenExamSubmissionsModal={handleOpenSubmissionsModal}
          />
        ) : activeExam ? (
          /* Two-Zone Split View Editor inside /admin/exams */
          <div className="space-y-4">
            {versionBumpNotice && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                <AlertTriangle className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <span>{versionBumpNotice}</span>
              </div>
            )}
            <SplitExamEditor
              exam={activeExam}
              isSaving={isSavingExam}
              onSaveExam={handleSaveExam}
              onBack={() => {
                setActiveExam(null);
                fetchTeacherWorkspaceData();
              }}
              onTryAsStudent={(code) => navigate(`/exam/${code}`)}
            />
          </div>
        ) : (
          /* /admin/exams — Teacher Exam Management List */
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-blue-700">
                    Quản lý Đề thi (/admin/exams)
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Quy trình chuẩn: Tải tài liệu &rarr; Kiểm tra &amp; Chỉnh sửa &rarr; Lưu nháp &rarr; Xuất bản &rarr; Đóng đề
                  </span>
                </div>
                <h1 className="text-xl font-bold text-slate-900">
                  Danh sách Đề thi của {currentUser.displayName}
                </h1>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Chỉ đề ở trạng thái Đã xuất bản mới xuất hiện bên Website Học sinh. Nếu bạn chỉnh sửa câu hỏi của đề thi đã có học sinh tham gia, hệ thống tự động nâng phiên bản (v2, v3...) để bảo vệ kết quả các bài làm trước đó.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <FileUp className="w-4 h-4" />
                  Tải tài liệu &amp; Tạo đề nháp mới
                </button>
              </div>
            </div>

            {/* Folder Management Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      Thư mục quản lý đề thi
                      <span className="text-xs font-normal text-slate-500">
                        ({folders.length} thư mục)
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tổ chức và phân loại đề thi theo khối lớp, kỳ thi, hoặc môn học để dễ dàng tìm kiếm
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setNewFolderName('');
                    setNewFolderDesc('');
                    setNewFolderColor('blue');
                    setFolderActionError(null);
                    setShowCreateFolderModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>+ Tạo thư mục mới</span>
                </button>
              </div>

              {/* Folder Pills List */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedFolderId('all')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    selectedFolderId === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>Tất cả đề</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      selectedFolderId === 'all'
                        ? 'bg-slate-800 text-slate-200'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {exams.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedFolderId('uncategorized')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    selectedFolderId === 'uncategorized'
                      ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                  <span>Chưa xếp thư mục</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      selectedFolderId === 'uncategorized'
                        ? 'bg-slate-700 text-slate-200'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {uncategorizedCount}
                  </span>
                </button>

                {folders.map((folder) => {
                  const style = getFolderStyle(folder.color);
                  const isSelected = selectedFolderId === folder.id;
                  const count =
                    folder.examCount ??
                    exams.filter((e) => e.folderId === folder.id).length;

                  return (
                    <div
                      key={folder.id}
                      className={`inline-flex items-center rounded-lg border text-xs font-semibold transition-all ${
                        isSelected
                          ? `${style.active} ${style.border} shadow-2xs`
                          : `bg-white ${style.text} border-slate-200 hover:border-slate-300 hover:bg-slate-50`
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFolderId(folder.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 cursor-pointer"
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSelected ? 'bg-white' : style.dot
                          }`}
                        />
                        <span className="truncate max-w-[170px]">
                          {folder.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                            isSelected
                              ? 'bg-black/20 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {count}
                        </span>
                      </button>

                      {isSelected && (
                        <div className="flex items-center border-l border-white/20 px-1 py-0.5 gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingFolder(folder);
                            }}
                            className="p-1 hover:bg-black/20 rounded text-[11px] transition-colors"
                            title="Sửa tên / đổi màu thư mục"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteFolderConfirm(folder);
                            }}
                            className="p-1 hover:bg-red-500/30 rounded text-[11px] transition-colors"
                            title="Xóa thư mục"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Active Folder Header Banner */}
              {selectedFolderId !== 'all' &&
                selectedFolderId !== 'uncategorized' &&
                (() => {
                  const activeFolder = folders.find(
                    (f) => f.id === selectedFolderId
                  );
                  if (!activeFolder) return null;
                  const style = getFolderStyle(activeFolder.color);
                  const count =
                    activeFolder.examCount ??
                    exams.filter((e) => e.folderId === activeFolder.id).length;

                  return (
                    <div
                      className={`p-3 rounded-lg border ${style.bg} ${style.border} flex flex-wrap items-center justify-between gap-3 text-xs`}
                    >
                      <div className="flex items-center gap-2">
                        <Folder className={`w-4 h-4 ${style.text}`} />
                        <div>
                          <span className="font-bold text-slate-900">
                            Thư mục: {activeFolder.name}
                          </span>
                          {activeFolder.description && (
                            <span className="text-slate-600 ml-2 font-normal">
                              — {activeFolder.description}
                            </span>
                          )}
                          <span className="ml-2 font-mono text-slate-600 font-semibold">
                            ({count} đề thi)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingFolder(activeFolder)}
                          className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          Đổi tên / màu
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteFolderConfirm(activeFolder)}
                          className="px-2.5 py-1 bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          Xóa thư mục
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedFolderId('all')}
                          className="px-2 py-1 text-slate-500 hover:text-slate-800 text-[11px] cursor-pointer"
                        >
                          Xem tất cả đề &times;
                        </button>
                      </div>
                    </div>
                  );
                })()}
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tất cả đề ({exams.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('published')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === 'published'
                      ? 'bg-white text-emerald-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Đã xuất bản
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('draft')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === 'draft'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bản nháp
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('closed')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === 'closed'
                      ? 'bg-white text-red-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Đã đóng
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('review')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === 'review'
                      ? 'bg-white text-amber-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Có câu Cần kiểm tra
                </button>
              </div>

              <div className="relative w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên bài thi, mã đề, môn..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {loadingExams ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
                Đang tải danh sách đề thi...
              </div>
            ) : filteredExams.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-800">
                  Hiện chưa có đề thi nào trong danh sách
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Hệ thống không tự tạo đề mẫu giả trong môi trường sản phẩm. Hãy tải lên tệp PDF, DOCX, ảnh đề thi hoặc tạo đề thi thực tế từ Bảng điều khiển.
                </p>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  Tải tài liệu tạo đề thi đầu tiên
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredExams.map((exam) => {
                  const reviewCount =
                    exam.stats?.reviewCount ??
                    exam.questions.filter((q) => q.needsReview).length;
                  const submittedCount = exam.stats?.submittedCount ?? 0;
                  const avgScore = exam.stats?.avgScore ?? null;

                  return (
                    <div
                      key={exam.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5 hover:border-slate-300 transition-colors"
                    >
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                          <span className="font-bold text-blue-700">
                            Mã đề: {exam.shareCode}
                          </span>
                          <span aria-hidden="true">·</span>
                          {/* Folder Tag */}
                          {(() => {
                            const folder = folders.find((f) => f.id === exam.folderId);
                            if (folder) {
                              const style = getFolderStyle(folder.color);
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFolderId(folder.id);
                                  }}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${style.badge}`}
                                  title="Lọc đề thi theo thư mục này"
                                >
                                  <Folder className="w-3 h-3" />
                                  <span>{folder.name}</span>
                                </button>
                              );
                            }
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMovingExam(exam);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                                title="Bấm để đưa đề thi vào thư mục"
                              >
                                <FolderOpen className="w-3 h-3" />
                                <span>Chưa xếp thư mục</span>
                              </button>
                            );
                          })()}
                          <span aria-hidden="true">·</span>
                          <span>Phiên bản v{exam.version || 1}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans font-medium text-slate-700">
                            {exam.subject}
                          </span>
                          {exam.gradeLevel && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-sans">{exam.gradeLevel}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{exam.questions.length} câu hỏi</span>
                          <span aria-hidden="true">·</span>
                          <span>{exam.durationMinutes} phút</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-sans font-semibold ${
                              exam.status === 'published'
                                ? 'text-emerald-700'
                                : exam.status === 'closed'
                                ? 'text-red-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {exam.status === 'published'
                              ? '● Đã xuất bản'
                              : exam.status === 'closed'
                              ? '■ Đã đóng đề'
                              : '▲ Bản nháp (Học sinh chưa thấy)'}
                          </span>
                          {reviewCount > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-sans font-semibold text-amber-700">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {reviewCount} câu Cần kiểm tra
                              </span>
                            </>
                          )}
                        </div>

                        <h2 className="text-base font-bold text-slate-900">
                          {exam.title}
                        </h2>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-mono tabular-nums">
                          <span>
                            Chủ sở hữu: <strong>{exam.ownerName || exam.ownerId}</strong>
                          </span>
                          <span>
                            Lượt nộp: <strong>{submittedCount}</strong>
                          </span>
                          <span>
                            Điểm TB:{' '}
                            <strong>
                              {avgScore !== null
                                ? `${avgScore} / ${exam.totalScale}`
                                : '—'}
                            </strong>
                          </span>
                          <span className="font-sans flex items-center gap-1">
                            {exam.showSolutionPolicy === 'after_submit' ||
                            exam.solutionsReleased ? (
                              <>
                                <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                                Đáp án: Cho phép xem sau khi nộp
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5 text-amber-600" />
                                Đáp án: Đang khóa trên Server
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setMovingExam(exam)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          title="Chuyển sang thư mục khác"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
                          <span>Chuyển thư mục</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenExamEditor(exam.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Đối chiếu &amp; Sửa đề
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenSubmissionsModal(exam.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <Users className="w-3.5 h-3.5" />
                          Lượt thi &amp; Điểm ({submittedCount})
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleCopyShareLink(exam.shareCode, exam.id)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          {copiedId === exam.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-700" />
                              Đã chép link
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Link (/exam/{exam.shareCode})
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate(`/exam/${exam.shareCode}`)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Xem Phòng chuẩn bị thi
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteConfirmExam(exam)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa đề thi"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {/* Create New Folder Modal */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-700" />
                <span>Tạo thư mục đề thi mới</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateFolderModal(false)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {folderActionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {folderActionError}
              </div>
            )}

            <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên thư mục <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="VD: Kiểm tra 15 phút Khối 12, Đề thi Giữa kỳ I..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Màu sắc nhận diện
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {FOLDER_COLORS.map((col) => {
                    const isPicked = newFolderColor === col.id;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setNewFolderColor(col.id)}
                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                          isPicked
                            ? `${col.border} ring-2 ring-blue-600 bg-slate-50`
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                        title={col.label}
                      >
                        <span className={`w-4 h-4 rounded-full ${col.dot}`} />
                        <span className="text-[10px] text-slate-600 truncate max-w-full">
                          {col.label.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mô tả ngắn (tùy chọn)
                </label>
                <input
                  type="text"
                  value={newFolderDesc}
                  onChange={(e) => setNewFolderDesc(e.target.value)}
                  placeholder="Ghi chú mục đích sử dụng thư mục..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
                >
                  Tạo thư mục
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Folder Modal */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-700" />
                <span>Chỉnh sửa thư mục đề thi</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingFolder(null)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {folderActionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {folderActionError}
              </div>
            )}

            <form onSubmit={handleUpdateFolderSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên thư mục <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingFolder.name}
                  onChange={(e) =>
                    setEditingFolder({ ...editingFolder, name: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Màu sắc nhận diện
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {FOLDER_COLORS.map((col) => {
                    const isPicked = editingFolder.color === col.id;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() =>
                          setEditingFolder({ ...editingFolder, color: col.id })
                        }
                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                          isPicked
                            ? `${col.border} ring-2 ring-blue-600 bg-slate-50`
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                        title={col.label}
                      >
                        <span className={`w-4 h-4 rounded-full ${col.dot}`} />
                        <span className="text-[10px] text-slate-600 truncate max-w-full">
                          {col.label.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mô tả
                </label>
                <input
                  type="text"
                  value={editingFolder.description || ''}
                  onChange={(e) =>
                    setEditingFolder({
                      ...editingFolder,
                      description: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingFolder(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Folder Confirm Modal */}
      {deleteFolderConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              <span>Xác nhận xóa thư mục</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa thư mục{' '}
              <strong className="text-slate-900">
                &ldquo;{deleteFolderConfirm.name}&rdquo;
              </strong>{' '}
              không?
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
              <strong>Bảo toàn dữ liệu:</strong> Toàn bộ đề thi bên trong thư mục này sẽ được giữ nguyên vẹn và tự động chuyển về mục <strong>&ldquo;Chưa xếp thư mục&rdquo;</strong> (không bị xóa mất đề thi).
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteFolderConfirm(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteFolder(deleteFolderConfirm.id)}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer shadow-2xs"
              >
                Xóa thư mục
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Exam To Folder Modal */}
      {movingExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-700" />
                <span>Chuyển đề thi vào Thư mục</span>
              </h3>
              <button
                type="button"
                onClick={() => setMovingExam(null)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="text-xs text-slate-600">
              Chọn thư mục đích cho bài thi:{' '}
              <strong className="text-slate-900 block mt-1 truncate font-medium">
                {movingExam.title}
              </strong>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {/* Option to unassign (remove from folder) */}
              <button
                type="button"
                onClick={() => handleMoveExamFolder(movingExam.id, null)}
                className={`w-full p-2.5 text-xs rounded-lg border text-left flex items-center justify-between transition-colors cursor-pointer ${
                  !movingExam.folderId
                    ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-slate-400" />
                  <span>Không xếp vào thư mục nào (Chưa phân loại)</span>
                </div>
                {!movingExam.folderId && (
                  <Check className="w-4 h-4 text-blue-700 shrink-0" />
                )}
              </button>

              {folders.map((folder) => {
                const style = getFolderStyle(folder.color);
                const isCurrent = movingExam.folderId === folder.id;

                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() =>
                      handleMoveExamFolder(movingExam.id, folder.id)
                    }
                    className={`w-full p-2.5 text-xs rounded-lg border text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isCurrent
                        ? `${style.bg} ${style.border} ${style.text} font-bold`
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                      <span className="truncate">{folder.name}</span>
                    </div>
                    {isCurrent && (
                      <Check className="w-4 h-4 text-blue-700 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setMovingExam(null);
                  setNewFolderName('');
                  setShowCreateFolderModal(true);
                }}
                className="text-xs text-blue-700 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>+ Tạo thư mục mới ngay</span>
              </button>

              <button
                type="button"
                onClick={() => setMovingExam(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showUploadModal && (
        <DocumentUploadModal
          onClose={() => setShowUploadModal(false)}
          onExtractedExam={handleCreatedExamFromExtraction}
        />
      )}

      {submissionsModalData && (
        <TeacherSubmissionsModal
          exam={submissionsModalData.exam}
          submissions={submissionsModalData.submissions}
          onClose={() => setSubmissionsModalData(null)}
          onToggleReleaseSolutions={handleToggleReleaseSolutions}
        />
      )}

      {deleteConfirmExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-lg">
            <h3 className="text-base font-bold text-slate-900">
              Xác nhận xóa bài thi
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa bài thi{' '}
              <strong className="text-slate-900">
                {deleteConfirmExam.title}
              </strong>{' '}
              và toàn bộ dữ liệu lượt làm bài của học sinh liên quan không?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmExam(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteExam}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
