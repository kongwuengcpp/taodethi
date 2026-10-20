import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  Flag,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Send,
  RefreshCw,
  Lock,
  Unlock,
  UserCheck,
  ShieldAlert,
  FastForward,
  ArrowLeft,
} from 'lucide-react';
import { MathText } from '../utils/mathRenderer';
import { resolveApiUrl } from '../lib/authClient';
import type {
  PublicExamInfo,
  PublicQuestion,
  StudentAnswer,
  Submission,
} from '../types/exam';

interface StudentExamPortalProps {
  examCodeOrId: string;
  onBackToStudentHome: () => void;
  onGoToMyResults: () => void;
}

export interface StoredPersonalResultItem {
  submissionId: string;
  studentAccessToken: string;
  shareCode: string;
  examTitle: string;
  examSubject: string;
  studentName: string;
  studentClass: string;
  submittedAt: string;
  scaledScore: number | null;
  totalScale: number;
}

export const MY_RESULTS_STORAGE_KEY = 'khao_thi_so_student_personal_results_v2';
const ACTIVE_SESSION_STORAGE_KEY = 'khao_thi_so_active_student_session_v2';

export function savePersonalResultRecord(record: StoredPersonalResultItem) {
  try {
    const raw = localStorage.getItem(MY_RESULTS_STORAGE_KEY);
    const list: StoredPersonalResultItem[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((x) => x.submissionId !== record.submissionId);
    filtered.unshift(record);
    localStorage.setItem(
      MY_RESULTS_STORAGE_KEY,
      JSON.stringify(filtered.slice(0, 30))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export const StudentExamPortal: React.FC<StudentExamPortalProps> = ({
  examCodeOrId,
  onBackToStudentHome,
  onGoToMyResults,
}) => {
  const [stage, setStage] = useState<'lobby' | 'taking' | 'result'>('lobby');
  const [examInfo, setExamInfo] = useState<PublicExamInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Student entry form
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [startingExam, setStartingExam] = useState(false);

  // Active exam state
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submissionToken, setSubmissionToken] = useState<string>('');
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [lastSavedText, setLastSavedText] = useState<string>('Đã sẵn sàng');
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshingResult, setRefreshingResult] = useState(false);

  const autoSubmitTriggeredRef = useRef(false);
  const latestStateRef = useRef({
    answers,
    flagged,
    tabSwitchCount,
    submission,
    submissionToken,
    examInfo,
  });

  useEffect(() => {
    latestStateRef.current = {
      answers,
      flagged,
      tabSwitchCount,
      submission,
      submissionToken,
      examInfo,
    };
  }, [answers, flagged, tabSwitchCount, submission, submissionToken, examInfo]);

  // Monitor online/offline connection status & auto-recover sync
  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      setLastSavedText('Đã kết nối lại mạng — đang đồng bộ...');
    };
    const onOffline = () => {
      setIsOffline(true);
      setLastSavedText('Mất kết nối — Đang lưu an toàn vào bộ nhớ máy');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const fetchExamInfo = useCallback(async (codeToLookup: string) => {
    const clean = codeToLookup.trim();
    if (!clean) return;
    setLoadingInfo(true);
    setError(null);
    try {
      const res = await fetch(
        resolveApiUrl(`/api/student/exams/${encodeURIComponent(clean)}/info`)
      );
      const data = await res.json();
      if (!res.ok) {
        setExamInfo(null);
        setError(data.error || 'Không tìm thấy bài thi đã xuất bản.');
      } else {
        setExamInfo(data.exam);
      }
    } catch {
      setError('Không thể kết nối máy chủ để tải thông tin đề thi.');
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  useEffect(() => {
    const savedRaw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw);
        if (
          parsed.submission &&
          parsed.submission.status === 'in_progress' &&
          (parsed.submission.shareCode?.toUpperCase() ===
            examCodeOrId.toUpperCase() ||
            parsed.submission.examId === examCodeOrId) &&
          Array.isArray(parsed.questions)
        ) {
          const deadlineMs = new Date(parsed.submission.deadlineAt).getTime();
          if (deadlineMs > Date.now() - 5000) {
            setSubmission(parsed.submission);
            setSubmissionToken(parsed.submissionToken || '');
            setQuestions(parsed.questions);
            setAnswers(parsed.answers || {});
            setFlagged(parsed.flagged || []);
            setTabSwitchCount(parsed.tabSwitchCount || 0);
            setRemainingSeconds(
              Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000))
            );
            setStage('taking');
            fetchExamInfo(examCodeOrId);
            return;
          } else {
            localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
          }
        }
      } catch {
        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      }
    }

    fetchExamInfo(examCodeOrId);
  }, [examCodeOrId, fetchExamInfo]);

  // Persist active state to localStorage on every answer or flag change
  useEffect(() => {
    if (stage === 'taking' && submission && questions.length > 0) {
      localStorage.setItem(
        ACTIVE_SESSION_STORAGE_KEY,
        JSON.stringify({
          submission,
          submissionToken,
          questions,
          answers,
          flagged,
          tabSwitchCount,
        })
      );
    }
  }, [stage, submission, submissionToken, questions, answers, flagged, tabSwitchCount]);

  // Save draft to backend server periodically and on reconnection
  useEffect(() => {
    if (stage !== 'taking' || !submission || isOffline) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          resolveApiUrl(`/api/student/submissions/${submission.id}/save`),
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Submission-Token': submissionToken,
            },
            body: JSON.stringify({
              answers,
              flaggedQuestions: flagged,
              tabSwitchCount,
            }),
          }
        );
        if (res.ok) {
          const nowStr = new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          setLastSavedText(`Đã tự lưu lúc ${nowStr}`);
        }
      } catch {
        setLastSavedText('Đang lưu tạm ngoại tuyến (tự đồng bộ khi có mạng)');
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [answers, flagged, tabSwitchCount, stage, submission, submissionToken, isOffline]);

  // Track tab / window visibility switches for teacher reference
  useEffect(() => {
    if (stage !== 'taking') return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setTabSwitchCount((c) => c + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [stage]);

  const handleSubmitExam = useCallback(
    async (isAutoSubmit = false) => {
      const currSub = latestStateRef.current.submission;
      const currToken = latestStateRef.current.submissionToken;
      const currInfo = latestStateRef.current.examInfo;
      if (!currSub || isSubmitting) return;
      setIsSubmitting(true);
      setShowConfirmSubmit(false);
      setError(null);

      try {
        const res = await fetch(
          resolveApiUrl(`/api/student/submissions/${currSub.id}/submit`),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Submission-Token': currToken,
            },
            body: JSON.stringify({
              answers: latestStateRef.current.answers,
              flaggedQuestions: latestStateRef.current.flagged,
              tabSwitchCount: latestStateRef.current.tabSwitchCount,
              autoSubmitted: isAutoSubmit,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Lỗi khi nộp bài thi.');
          setIsSubmitting(false);
          return;
        }

        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        const finishedSub: Submission = data.submission;
        setSubmission(finishedSub);
        if (Array.isArray(data.questions)) {
          setQuestions(data.questions);
        }

        savePersonalResultRecord({
          submissionId: finishedSub.id,
          studentAccessToken: currToken,
          shareCode: finishedSub.shareCode,
          examTitle: currInfo?.title || `Đề thi ${finishedSub.shareCode}`,
          examSubject: currInfo?.subject || 'Tổng hợp',
          studentName: finishedSub.studentName,
          studentClass: finishedSub.studentClass,
          submittedAt: finishedSub.submittedAt || new Date().toISOString(),
          scaledScore: finishedSub.scaledScore,
          totalScale: finishedSub.totalScale,
        });

        setStage('result');
      } catch {
        setError(
          'Mất kết nối mạng khi nộp bài. Câu trả lời của bạn vẫn được giữ nguyên trong bộ nhớ máy, vui lòng bấm Nộp lại ngay khi có mạng.'
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting]
  );

  // Countdown timer & Auto-submit when remainingSeconds hits 0
  useEffect(() => {
    if (stage !== 'taking' || !submission) return;
    autoSubmitTriggeredRef.current = false;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!autoSubmitTriggeredRef.current) {
            autoSubmitTriggeredRef.current = true;
            handleSubmitExam(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [stage, submission, handleSubmitExam]);

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examInfo) return;
    setError(null);
    setStartingExam(true);

    try {
      const res = await fetch(
        resolveApiUrl(
          `/api/student/exams/${encodeURIComponent(examInfo.shareCode)}/start`
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentName,
            studentClass,
            studentCode,
            accessCode,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Không thể bắt đầu bài thi.');
        setStartingExam(false);
        return;
      }

      const sub: Submission = data.submission;
      const token: string = data.studentAccessToken || '';
      const qs: PublicQuestion[] = data.exam.questions || [];
      const deadlineMs = new Date(sub.deadlineAt).getTime();
      const secs = Math.max(10, Math.floor((deadlineMs - Date.now()) / 1000));

      setSubmission(sub);
      setSubmissionToken(token);
      setQuestions(qs);
      setAnswers({});
      setFlagged([]);
      setTabSwitchCount(0);
      setCurrentIdx(0);
      setRemainingSeconds(secs);
      setStage('taking');
    } catch {
      setError('Không thể kết nối máy chủ khi bắt đầu bài thi.');
    } finally {
      setStartingExam(false);
    }
  };

  const handleRefreshResultSolutions = async () => {
    if (!submission) return;
    setRefreshingResult(true);
    try {
      const res = await fetch(
        resolveApiUrl(`/api/student/submissions/${submission.id}/result`),
        {
          headers: {
            'X-Submission-Token': submissionToken,
          },
        }
      );
      const data = await res.json();
      if (res.ok && data.submission) {
        setSubmission(data.submission);
      }
    } catch {
      // Network error handled gracefully
    } finally {
      setRefreshingResult(false);
    }
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const isQuestionAnswered = (q: PublicQuestion): boolean => {
    const ans = answers[q.id];
    if (!ans) return false;
    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      return Boolean(ans.selectedOptions && ans.selectedOptions.length > 0);
    }
    if (q.type === 'true_false') {
      if (q.statements && q.statements.length > 0) {
        return (
          Boolean(ans.statementAnswers) &&
          Object.keys(ans.statementAnswers!).length > 0
        );
      }
      return Boolean(ans.selectedOptions && ans.selectedOptions.length > 0);
    }
    if (q.type === 'short_answer') {
      return Boolean(ans.shortText && ans.shortText.trim().length > 0);
    }
    return false;
  };

  const toggleFlagQuestion = (qId: string) => {
    setFlagged((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  };

  const handleSelectSingleOrMulti = (q: PublicQuestion, optId: string) => {
    setAnswers((prev) => {
      const existing = prev[q.id]?.selectedOptions || [];
      let nextOpts: string[];
      if (q.type === 'single_choice') {
        nextOpts = [optId];
      } else {
        nextOpts = existing.includes(optId)
          ? existing.filter((x) => x !== optId)
          : [...existing, optId];
      }
      return {
        ...prev,
        [q.id]: {
          questionId: q.id,
          selectedOptions: nextOpts,
        },
      };
    });
  };

  const handleSelectStatementTruth = (
    qId: string,
    stId: string,
    val: boolean
  ) => {
    setAnswers((prev) => {
      const existingMap = prev[qId]?.statementAnswers || {};
      return {
        ...prev,
        [qId]: {
          questionId: qId,
          statementAnswers: {
            ...existingMap,
            [stId]: val,
          },
        },
      };
    });
  };

  const handleShortTextChange = (qId: string, textVal: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: {
        questionId: qId,
        shortText: textVal,
      },
    }));
  };

  // =========================================================================
  // STAGE 1: EXAM PREPARATION MENU & LOBBY (`/exam/:examId`)
  // Modeled on structured TN - ĐS - TLN exam preparation screen
  // =========================================================================
  if (stage === 'lobby') {
    const sec = examInfo?.sectionSummary;

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToStudentHome}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại Danh sách Đề thi
          </button>
        </div>

        {loadingInfo ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
            Đang tải cấu trúc đề thi và thông tin phòng chờ...
          </div>
        ) : error && !examInfo ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={onBackToStudentHome}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
            >
              Tra cứu mã đề khác
            </button>
          </div>
        ) : (
          examInfo && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-2xs">
              {/* Exam Header */}
              <div className="pb-5 border-b border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                  <span className="font-bold text-blue-700">
                    MÃ ĐỀ: {examInfo.shareCode}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans font-semibold text-slate-700">
                    {examInfo.subject}
                  </span>
                  {examInfo.gradeLevel && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans">{examInfo.gradeLevel}</span>
                    </>
                  )}
                  {examInfo.examCategory && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans">{examInfo.examCategory}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>Phiên bản v{examInfo.version || 1}</span>
                </div>

                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {examInfo.title}
                </h1>

                {examInfo.description && (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {examInfo.description}
                  </p>
                )}
              </div>

              {/* Structured Exam Preparation Menu (TN - ĐS - TLN Breakdown) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Cấu trúc Đề thi &amp; Phân bố Điểm số (TN - ĐS - TLN)
                  </h2>
                  <div className="text-xs font-mono font-bold text-blue-700 tabular-nums">
                    Tổng điểm gốc: {sec?.totalRawPoints ?? examInfo.totalScale}đ · Quy đổi thang: {examInfo.totalScale}đ
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono tabular-nums">
                  <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-1">
                    <div className="text-[11px] font-sans font-bold text-blue-700">
                      PHẦN I · Trắc nghiệm (TN)
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {sec?.tnCount ?? 0} câu
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {sec && sec.tnCount > 0
                        ? `${sec.tnPointsEach} điểm / 1 câu (Tổng ${sec.tnTotalPoints}đ)`
                        : 'Không có câu hỏi Phần I'}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-1">
                    <div className="text-[11px] font-sans font-bold text-emerald-700">
                      PHẦN II · Đúng / Sai (ĐS)
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {sec?.dsCount ?? 0} câu (4 ý/câu)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {sec && sec.dsCount > 0
                        ? `${sec.dsPointsEach} điểm / 1 câu (Tổng ${sec.dsTotalPoints}đ)`
                        : 'Không có câu hỏi Phần II'}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-1">
                    <div className="text-[11px] font-sans font-bold text-amber-700">
                      PHẦN III · Trả lời ngắn (TLN)
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {sec?.tlnCount ?? 0} câu
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {sec && sec.tlnCount > 0
                        ? `${sec.tlnPointsEach} điểm / 1 câu (Tổng ${sec.tlnTotalPoints}đ)`
                        : 'Không có câu hỏi Phần III'}
                    </div>
                  </div>
                </div>

                {/* Exam Configuration Summary Row */}
                <div className="pt-2 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600">
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Thời gian làm bài
                    </span>
                    <strong className="font-mono text-slate-900">
                      {examInfo.durationMinutes} phút
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Tổng số câu hỏi
                    </span>
                    <strong className="font-mono text-slate-900">
                      {examInfo.questionCount} câu
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Số lượt làm bài
                    </span>
                    <strong className="text-slate-900">
                      {examInfo.maxAttempts && examInfo.maxAttempts > 0
                        ? `Tối đa ${examInfo.maxAttempts} lượt`
                        : 'Không giới hạn'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Trộn đề tự động
                    </span>
                    <strong className="text-slate-900">
                      {examInfo.shuffleQuestions || examInfo.shuffleOptions
                        ? 'Có đảo câu/đáp án'
                        : 'Giữ nguyên thứ tự gốc'}
                    </strong>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {!examInfo.isOpen ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
                  <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Bài thi hiện đang đóng</div>
                    <p className="mt-0.5">{examInfo.closedReason}</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleStartExam} className="space-y-4">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-700" />
                    Thông tin Thí sinh dự thi
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Họ và tên học sinh <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="VD: Nguyễn Minh Anh"
                        className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Lớp / Trường <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={studentClass}
                        onChange={(e) => setStudentClass(e.target.value)}
                        placeholder="VD: 11A2"
                        className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mã số học sinh / SBD (tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={studentCode}
                        onChange={(e) => setStudentCode(e.target.value)}
                        placeholder="VD: HS018"
                        className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    {examInfo.requiresAccessCode && (
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Mã ca thi (Mật khẩu bài thi do giáo viên cấp){' '}
                          <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={accessCode}
                          onChange={(e) => setAccessCode(e.target.value)}
                          placeholder="Nhập mật khẩu bài thi..."
                          className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    )}
                  </div>

                  {/* Exam Guidelines */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1.5">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-blue-700 shrink-0" />
                      Quy chế &amp; Khôi phục tự động khi mất kết nối:
                    </div>
                    <p>
                      • Thời gian làm bài ({examInfo.durationMinutes} phút) đếm ngược từ lúc bấm <strong>Bắt đầu làm bài</strong> và tự động nộp khi hết giờ.
                    </p>
                    <p>
                      • Câu trả lời được tự động lưu lên máy chủ và lưu dự phòng trong trình duyệt. Nếu mất mạng hoặc tải lại trang, bài làm đang dở được tự động khôi phục.
                    </p>
                    {examInfo.trueFalseScoring === 'standard_10_25_50_100' && (
                      <p>
                        • <strong>Cách tính điểm Phần II (Đúng/Sai 4 ý)</strong>: Đúng 1 ý được 10%, đúng 2 ý được 25%, đúng 3 ý được 50%, đúng cả 4 ý được 100% điểm của câu.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={startingExam}
                      className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                    >
                      {startingExam
                        ? 'Đang khởi tạo đề thi...'
                        : 'Bắt đầu làm bài thi'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        )}
      </div>
    );
  }

  // =========================================================================
  // STAGE 2: ACTIVE EXAM RUNNER (`/exam/:examId`)
  // =========================================================================
  if (stage === 'taking' && submission && questions.length > 0) {
    const activeQ = questions[currentIdx] || questions[0];
    const isFlagged = flagged.includes(activeQ.id);
    const answeredCount = questions.filter((q) => isQuestionAnswered(q)).length;
    const isLowTime = remainingSeconds <= 60;

    return (
      <div className="space-y-4">
        <div className="sticky top-0 z-30 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 truncate">
              {examInfo?.title || `Mã đề: ${submission.shareCode}`} (v
              {submission.examVersion || 1})
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums truncate">
              Thí sinh: {submission.studentName} ({submission.studentClass}) ·{' '}
              {lastSavedText}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setRemainingSeconds(5)}
              title="Đặt đồng hồ về 5 giây để kiểm thử tính năng Tự động nộp bài khi hết giờ"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FastForward className="w-3.5 h-3.5" />
              Thử hết giờ (5s)
            </button>

            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono tabular-nums text-sm font-bold border ${
                isLowTime
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-slate-100 text-slate-900 border-slate-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTimer(remainingSeconds)}</span>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setShowConfirmSubmit(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              Nộp bài ({answeredCount}/{questions.length})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Active Question Area */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2 font-mono tabular-nums">
                <span className="text-base font-bold text-slate-900">
                  Câu {activeQ.orderIndex} / {questions.length}
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-xs text-slate-500">
                  {activeQ.points} điểm
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-xs font-sans font-medium text-blue-700">
                  {activeQ.type === 'single_choice'
                    ? 'Chọn 1 đáp án'
                    : activeQ.type === 'multiple_choice'
                    ? 'Chọn nhiều đáp án'
                    : activeQ.type === 'true_false'
                    ? 'Xét tính Đúng / Sai'
                    : 'Điền câu trả lời ngắn'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => toggleFlagQuestion(activeQ.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isFlagged
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                {isFlagged ? 'Đã đánh dấu xem lại' : 'Đánh dấu xem lại'}
              </button>
            </div>

            <div className="text-base text-slate-900 leading-relaxed">
              <MathText text={activeQ.prompt} />
            </div>

            {(activeQ.type === 'single_choice' ||
              activeQ.type === 'multiple_choice') && (
              <div className="space-y-3">
                {activeQ.options.map((opt) => {
                  const selectedList =
                    answers[activeQ.id]?.selectedOptions || [];
                  const isSelected = selectedList.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectSingleOrMulti(activeQ, opt.id)}
                      className={`w-full flex items-center gap-3.5 p-3.5 text-left rounded-xl border transition-colors ${
                        isSelected
                          ? 'border-blue-700 bg-blue-50/60 text-slate-900'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <div className="text-sm flex-1">
                        <MathText text={opt.text} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {activeQ.type === 'true_false' && (
              <div className="space-y-3">
                {activeQ.statements && activeQ.statements.length > 0 ? (
                  activeQ.statements.map((st) => {
                    const currentVal =
                      answers[activeQ.id]?.statementAnswers?.[st.id];
                    return (
                      <div
                        key={st.id}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                      >
                        <div className="text-sm text-slate-900">
                          <strong className="font-mono mr-2">{st.label}</strong>
                          <MathText text={st.text} />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectStatementTruth(
                                activeQ.id,
                                st.id,
                                true
                              )
                            }
                            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                              currentVal === true
                                ? 'bg-blue-700 text-white border-blue-700'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            Đúng
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectStatementTruth(
                                activeQ.id,
                                st.id,
                                false
                              )
                            }
                            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                              currentVal === false
                                ? 'bg-blue-700 text-white border-blue-700'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            Sai
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {['Đúng', 'Sai'].map((val) => {
                      const isSelected =
                        answers[activeQ.id]?.selectedOptions?.[0] === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() =>
                            handleSelectSingleOrMulti(activeQ, val)
                          }
                          className={`p-3.5 text-sm font-semibold rounded-xl border ${
                            isSelected
                              ? 'border-blue-700 bg-blue-50 text-blue-900'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeQ.type === 'short_answer' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Nhập đáp số của bạn (Số nguyên, số thập phân hoặc biểu thức ngắn):
                </label>
                <input
                  type="text"
                  value={answers[activeQ.id]?.shortText || ''}
                  onChange={(e) =>
                    handleShortTextChange(activeQ.id, e.target.value)
                  }
                  placeholder="Nhập câu trả lời tại đây..."
                  className="w-full max-w-md px-4 py-2.5 text-base font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
              <button
                type="button"
                disabled={currentIdx <= 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Câu trước
              </button>

              <span className="text-xs text-slate-500 font-mono tabular-nums">
                Đã trả lời {answeredCount} / {questions.length} câu
              </span>

              <button
                type="button"
                disabled={currentIdx >= questions.length - 1}
                onClick={() =>
                  setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 transition-colors"
              >
                Câu tiếp theo
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Question Palette */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-900">
              Bảng danh sách câu hỏi
            </h3>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const answered = isQuestionAnswered(q);
                const isCurr = idx === currentIdx;
                const isFlag = flagged.includes(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    className={`relative h-10 rounded-lg font-mono tabular-nums text-xs font-bold border transition-colors flex items-center justify-center ${
                      isCurr
                        ? 'ring-2 ring-blue-700 border-blue-700 bg-blue-50 text-blue-900'
                        : isFlag
                        ? 'border-amber-400 bg-amber-50 text-amber-900'
                        : answered
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {q.orderIndex}
                    {isFlag && (
                      <span
                        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500"
                        title="Cần xem lại"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span>Đã có câu trả lời:</span>
                <strong className="font-mono tabular-nums text-emerald-700">
                  {answeredCount} câu
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Chưa trả lời:</span>
                <strong className="font-mono tabular-nums text-slate-700">
                  {questions.length - answeredCount} câu
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Đánh dấu xem lại:</span>
                <strong className="font-mono tabular-nums text-amber-700">
                  {flagged.length} câu
                </strong>
              </div>
            </div>
          </div>
        </div>

        {showConfirmSubmit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-lg">
              <h3 className="text-base font-bold text-slate-900">
                Xác nhận nộp bài thi
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Bạn đã hoàn thành{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {answeredCount}/{questions.length}
                </strong>{' '}
                câu hỏi
                {flagged.length > 0
                  ? ` và còn ${flagged.length} câu đang đánh dấu cần xem lại`
                  : ''}
                . Sau khi nộp bài, bạn sẽ không thể chỉnh sửa câu trả lời nữa.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmSubmit(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Quay lại kiểm tra
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSubmitExam(false)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                >
                  {isSubmitting ? 'Đang chấm điểm...' : 'Xác nhận nộp bài ngay'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // STAGE 3: RESULT & SOLUTION VIEW
  // =========================================================================
  if (stage === 'result' && submission) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                {submission.autoSubmitted
                  ? 'Đã tự động thu bài khi hết giờ'
                  : 'Đã nộp bài thi thành công'}
              </span>
              <h1 className="text-xl font-bold text-slate-900 mt-1">
                Kết quả bài thi: {examInfo?.title || submission.shareCode}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                Học sinh: {submission.studentName} · Lớp: {submission.studentClass}{' '}
                · Phiên bản đề: v{submission.examVersion || 1} · Nộp lúc:{' '}
                {submission.submittedAt
                  ? new Date(submission.submittedAt).toLocaleString('vi-VN')
                  : ''}
              </p>
            </div>

            <div className="text-right font-mono tabular-nums bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
              <span className="text-xs text-blue-800 block font-sans font-semibold">
                Điểm số đạt được
              </span>
              <span className="text-2xl font-bold text-blue-700">
                {submission.scaledScore !== null
                  ? `${submission.scaledScore.toFixed(2)} / ${submission.totalScale}`
                  : '—'}
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">
                Điểm gốc: {submission.rawScore ?? 0} / {submission.maxRawScore ?? 0}
              </span>
            </div>
          </div>

          <div
            className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
              submission.solutionsVisible
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {submission.solutionsVisible ? (
                <Unlock className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>
                <strong>Trạng thái công bố đáp án & lời giải:</strong>{' '}
                {submission.solutionNotice}
              </span>
            </div>

            {!submission.solutionsVisible && (
              <button
                type="button"
                disabled={refreshingResult}
                onClick={handleRefreshResultSolutions}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold bg-white border border-amber-300 rounded-lg hover:bg-amber-100/50 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    refreshingResult ? 'animate-spin' : ''
                  }`}
                />
                Kiểm tra lại trạng thái mở đáp án
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBackToStudentHome}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Về Trang chủ Phòng thi
            </button>
            <button
              type="button"
              onClick={onGoToMyResults}
              className="px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
            >
              Xem lịch sử Kết quả của tôi (/my-results)
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Chi tiết kết quả từng câu hỏi
          </h2>
          {questions.map((q) => {
            const detail = submission.gradeDetails?.find(
              (d) => d.questionId === q.id
            );
            const studentAns = submission.answers[q.id];

            return (
              <div
                key={q.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="font-bold text-slate-900 text-sm">
                    Câu {q.orderIndex}
                  </span>
                  {detail && (
                    <span
                      className={`font-semibold ${
                        detail.isCorrect
                          ? 'text-emerald-700'
                          : detail.partialCredit
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      {detail.earnedPoints} / {detail.maxPoints} điểm ·{' '}
                      {detail.isCorrect
                        ? 'Chính xác'
                        : detail.partialCredit
                        ? 'Đúng một phần'
                        : 'Chưa chính xác'}
                    </span>
                  )}
                </div>

                <div className="text-sm text-slate-900">
                  <MathText text={q.prompt} />
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                  <div>
                    <strong className="text-slate-700">
                      Câu trả lời của bạn:{' '}
                    </strong>
                    <span className="font-mono text-slate-900">
                      {q.type === 'short_answer'
                        ? studentAns?.shortText || '(Chưa trả lời)'
                        : q.type === 'true_false' && studentAns?.statementAnswers
                        ? Object.entries(studentAns.statementAnswers)
                            .map(([k, v]) => `${k}) ${v ? 'Đúng' : 'Sai'}`)
                            .join(' · ') || '(Chưa trả lời)'
                        : studentAns?.selectedOptions?.join(', ') ||
                          '(Chưa trả lời)'}
                    </span>
                  </div>

                  {submission.solutionsVisible && detail?.correctAnswers && (
                    <div className="text-emerald-800 pt-1">
                      <strong>Đáp án đúng: </strong>
                      <span className="font-mono font-bold">
                        {detail.correctAnswers.join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                {submission.solutionsVisible && detail?.explanation && (
                  <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-lg text-xs text-slate-800 leading-relaxed">
                    <strong className="text-blue-900">
                      Lời giải chi tiết:{' '}
                    </strong>
                    <MathText text={detail.explanation} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
};
