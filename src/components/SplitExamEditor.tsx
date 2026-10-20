import React, { useState } from 'react';
import {
  Save,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ZoomIn,
  ZoomOut,
  Copy,
  Check,
  ExternalLink,
  Settings,
  ListChecks,
  FileImage,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
} from 'lucide-react';
import { MathText } from '../utils/mathRenderer';
import { apiFetch } from '../lib/authClient';
import type {
  Exam,
  ExamStatus,
  Question,
  QuestionType,
  SolutionPolicy,
  TrueFalseScoringRule,
  TrueFalseStatement,
} from '../types/exam';

interface SplitExamEditorProps {
  exam: Exam;
  isSaving: boolean;
  onSaveExam: (updatedExam: Exam, publishAction?: boolean) => Promise<void>;
  onBack: () => void;
  onTryAsStudent: (shareCode: string) => void;
}

export const SplitExamEditor: React.FC<SplitExamEditorProps> = ({
  exam,
  isSaving,
  onSaveExam,
  onBack,
  onTryAsStudent,
}) => {
  const [draft, setDraft] = useState<Exam>(() => structuredClone(exam));
  const [rightTab, setRightTab] = useState<'questions' | 'settings' | 'preview'>(
    'questions'
  );
  const [leftMode, setLeftMode] = useState<'image' | 'text'>('image');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [questionFilter, setQuestionFilter] = useState<'all' | 'review'>('all');
  const [copiedLink, setCopiedLink] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning';
    text: string;
  } | null>(null);

  // Preview interactive state for Teacher Preview Mode
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({});
  const [previewShowSolutions, setPreviewShowSolutions] = useState(true);

  const reviewCount = draft.questions.filter((q) => q.needsReview).length;
  const totalRawPoints = draft.questions.reduce(
    (sum, q) => sum + (Number(q.points) || 0),
    0
  );

  const studentLink = `${window.location.origin}/exam/${draft.shareCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(studentLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const updateQuestion = (qId: string, updater: (q: Question) => Question) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === qId ? updater(q) : q)),
    }));
  };

  const handleQuestionTypeChange = (qId: string, newType: QuestionType) => {
    updateQuestion(qId, (q) => {
      if (newType === 'single_choice' || newType === 'multiple_choice') {
        const defaultOpts =
          q.options && q.options.length >= 2
            ? q.options
            : [
                { id: 'A', label: 'A', text: 'Phương án A' },
                { id: 'B', label: 'B', text: 'Phương án B' },
                { id: 'C', label: 'C', text: 'Phương án C' },
                { id: 'D', label: 'D', text: 'Phương án D' },
              ];
        const validAns = q.correctAnswers.filter((a) =>
          ['A', 'B', 'C', 'D'].includes(a)
        );
        return {
          ...q,
          type: newType,
          options: defaultOpts,
          points: q.points || 0.25,
          correctAnswers:
            newType === 'single_choice' ? validAns.slice(0, 1) : validAns,
          needsReview: validAns.length === 0,
          reviewReason:
            validAns.length === 0 ? 'Cần chọn đáp án đúng cho câu hỏi' : undefined,
        };
      }

      if (newType === 'true_false') {
        const defaultStatements: TrueFalseStatement[] =
          q.statements && q.statements.length > 0
            ? q.statements
            : [
                { id: 'a', label: 'a)', text: 'Mệnh đề a', isTrue: true },
                { id: 'b', label: 'b)', text: 'Mệnh đề b', isTrue: false },
                { id: 'c', label: 'c)', text: 'Mệnh đề c', isTrue: true },
                { id: 'd', label: 'd)', text: 'Mệnh đề d', isTrue: true },
              ];
        return {
          ...q,
          type: 'true_false',
          points: 1.0,
          statements: defaultStatements,
          correctAnswers: defaultStatements
            .filter((s) => typeof s.isTrue === 'boolean')
            .map((s) => `${s.id}:${s.isTrue}`),
          needsReview: defaultStatements.some((s) => typeof s.isTrue !== 'boolean'),
          reviewReason: undefined,
        };
      }

      // short_answer
      return {
        ...q,
        type: 'short_answer',
        points: 0.5,
        options: [],
        correctAnswers: q.correctAnswers.length > 0 ? [q.correctAnswers[0]] : [''],
        needsReview: !q.correctAnswers[0],
        reviewReason: !q.correctAnswers[0]
          ? 'Cần nhập đáp số chuẩn cho câu trả lời ngắn'
          : undefined,
      };
    });
  };

  const handleToggleOptionCorrect = (qId: string, optId: string) => {
    updateQuestion(qId, (q) => {
      let nextCorrect: string[];
      if (q.type === 'single_choice') {
        nextCorrect = [optId];
      } else {
        const exists = q.correctAnswers.includes(optId);
        nextCorrect = exists
          ? q.correctAnswers.filter((id) => id !== optId)
          : [...q.correctAnswers, optId];
      }
      const hasAnswer = nextCorrect.length > 0;
      return {
        ...q,
        correctAnswers: nextCorrect,
        needsReview: !hasAnswer,
        reviewReason: !hasAnswer ? 'Chưa chọn đáp án đúng' : undefined,
      };
    });
  };

  const handleStatementTruthChange = (
    qId: string,
    stId: string,
    isTrueVal: boolean
  ) => {
    updateQuestion(qId, (q) => {
      const nextStatements = (q.statements || []).map((s) =>
        s.id === stId ? { ...s, isTrue: isTrueVal } : s
      );
      const allDefined = nextStatements.every((s) => typeof s.isTrue === 'boolean');
      return {
        ...q,
        statements: nextStatements,
        correctAnswers: nextStatements
          .filter((s) => typeof s.isTrue === 'boolean')
          .map((s) => `${s.id}:${s.isTrue}`),
        needsReview: !allDefined,
        reviewReason: !allDefined
          ? 'Một số mệnh đề chưa chọn Đúng/Sai'
          : undefined,
      };
    });
  };

  const handleAddQuestion = () => {
    const newIndex = draft.questions.length + 1;
    const newQ: Question = {
      id: `q-${Date.now()}-${newIndex}`,
      orderIndex: newIndex,
      type: 'single_choice',
      prompt: `Nội dung câu hỏi số ${newIndex}...`,
      options: [
        { id: 'A', label: 'A', text: 'Phương án A' },
        { id: 'B', label: 'B', text: 'Phương án B' },
        { id: 'C', label: 'C', text: 'Phương án C' },
        { id: 'D', label: 'D', text: 'Phương án D' },
      ],
      correctAnswers: ['A'],
      points: 0.25,
      explanation: '',
      needsReview: false,
      sourcePage: currentPageIdx + 1,
    };
    setDraft((prev) => ({
      ...prev,
      questions: [...prev.questions, newQ],
    }));
  };

  const handleDeleteQuestion = (qId: string) => {
    setDraft((prev) => {
      const filtered = prev.questions
        .filter((q) => q.id !== qId)
        .map((q, i) => ({ ...q, orderIndex: i + 1 }));
      return { ...prev, questions: filtered };
    });
  };

  const handleMoveQuestion = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= draft.questions.length) return;
    setDraft((prev) => {
      const copy = [...prev.questions];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return {
        ...prev,
        questions: copy.map((q, i) => ({ ...q, orderIndex: i + 1 })),
      };
    });
  };

  const triggerSave = async (nextStatusOverride?: ExamStatus) => {
    setStatusMessage(null);
    const nextStatus = nextStatusOverride || draft.status;
    const updatedExam: Exam = {
      ...draft,
      status: nextStatus,
    };
    setDraft(updatedExam);
    await onSaveExam(updatedExam, nextStatus === 'published');
    setStatusMessage({
      type: 'success',
      text:
        nextStatus === 'published'
          ? `Đã xuất bản bài thi! Học sinh có thể truy cập qua mã đề ${updatedExam.shareCode}.`
          : nextStatus === 'closed'
          ? `Đã đóng bài thi ${updatedExam.shareCode}. Học sinh không thể bắt đầu lượt thi mới.`
          : 'Đã lưu mọi chỉnh sửa đề thi thành công.',
    });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const displayedQuestions =
    questionFilter === 'review'
      ? draft.questions.filter((q) => q.needsReview)
      : draft.questions;

  const activeSourcePage =
    draft.sourcePages && draft.sourcePages.length > 0
      ? draft.sourcePages[Math.min(currentPageIdx, draft.sourcePages.length - 1)]
      : null;

  return (
    <div className="space-y-4">
      {/* Workspace Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Quay lại danh sách
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 truncate">
              {draft.title || 'Đề kiểm tra chưa đặt tên'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              <span>Mã đề: {draft.shareCode}</span>
              <span aria-hidden="true">·</span>
              <span>{draft.questions.length} câu hỏi</span>
              <span aria-hidden="true">·</span>
              <span>Tổng điểm gốc: {totalRawPoints.toFixed(2)}</span>
              <span aria-hidden="true">·</span>
              <span>Thang quy đổi: {draft.totalScale}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  draft.status === 'published'
                    ? 'font-semibold text-emerald-700'
                    : draft.status === 'closed'
                    ? 'font-semibold text-red-700'
                    : 'font-semibold text-amber-700'
                }
              >
                {draft.status === 'published'
                  ? '● Đã xuất bản'
                  : draft.status === 'closed'
                  ? '■ Đã đóng đề'
                  : '▲ Bản nháp'}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                Đã sao chép link thi
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Sao chép link Học sinh
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onTryAsStudent(draft.shareCode)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Mở Phòng chuẩn bị thi
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => triggerSave()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            Lưu chỉnh sửa
          </button>

          {draft.status === 'published' && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => triggerSave('closed')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              Đóng bài thi
            </button>
          )}

          <button
            type="button"
            disabled={isSaving}
            onClick={() => triggerSave('published')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {draft.status === 'published' ? 'Cập nhật & Xuất bản' : 'Xuất bản bài thi'}
          </button>
        </div>
      </div>

      {/* Status Toast / Review Warning */}
      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{statusMessage.text}</span>
        </div>
      )}

      {reviewCount > 0 && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Hệ thống phát hiện{' '}
              <strong className="font-mono tabular-nums">{reviewCount} câu hỏi</strong> chưa rõ
              đáp án hoặc cần đối chiếu với ảnh gốc. Hệ thống không tự đoán mò đáp án — vui lòng
              kiểm tra trước khi xuất bản cho học sinh thi.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setRightTab('questions');
              setQuestionFilter(questionFilter === 'review' ? 'all' : 'review');
            }}
            className="px-3 py-1 font-semibold bg-white border border-amber-300 rounded-md hover:bg-amber-100/50 transition-colors whitespace-nowrap shrink-0"
          >
            {questionFilter === 'review'
              ? 'Hiện tất cả câu hỏi'
              : `Lọc ${reviewCount} câu Cần kiểm tra`}
          </button>
        </div>
      )}

      {/* Two-Zone Split Layout (Left: Original Document/Image, Right: Question Editor / Config / Preview) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT ZONE: Original Document / Image Viewer (5 cols on desktop) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden lg:sticky lg:top-4">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
            <div className="flex items-center gap-2">
              <FileImage className="w-4 h-4 text-slate-700" />
              <span className="text-xs font-bold text-slate-900">
                Tài liệu / Ảnh gốc đối chiếu
              </span>
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-lg">
              <button
                type="button"
                onClick={() => setLeftMode('image')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  leftMode === 'image'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bản chụp gốc
              </button>
              <button
                type="button"
                onClick={() => setLeftMode('text')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  leftMode === 'text'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Văn bản thô
              </button>
            </div>
          </div>

          {/* Zoom & Page controls */}
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 bg-white">
            <div className="flex items-center gap-1.5 font-mono tabular-nums">
              <button
                type="button"
                disabled={currentPageIdx <= 0}
                onClick={() => setCurrentPageIdx((i) => Math.max(0, i - 1))}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"
                title="Trang trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>
                Trang {currentPageIdx + 1} / {Math.max(1, draft.sourcePages.length)}
              </span>
              <button
                type="button"
                disabled={currentPageIdx >= draft.sourcePages.length - 1}
                onClick={() =>
                  setCurrentPageIdx((i) =>
                    Math.min(draft.sourcePages.length - 1, i + 1)
                  )
                }
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"
                title="Trang sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {leftMode === 'image' && (
              <div className="flex items-center gap-1 font-mono tabular-nums">
                <button
                  type="button"
                  onClick={() => setZoomPercent((z) => Math.max(50, z - 25))}
                  className="p-1 rounded hover:bg-slate-100"
                  title="Thu nhỏ"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="w-12 text-center">{zoomPercent}%</span>
                <button
                  type="button"
                  onClick={() => setZoomPercent((z) => Math.min(200, z + 25))}
                  className="p-1 rounded hover:bg-slate-100"
                  title="Phóng to"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Viewer Canvas */}
          <div className="h-[68vh] overflow-auto bg-slate-100 p-3">
            {activeSourcePage ? (
              leftMode === 'image' && activeSourcePage.dataUrl ? (
                <div className="flex justify-center min-w-full">
                  <img
                    src={activeSourcePage.dataUrl}
                    alt={`Trang tài liệu gốc ${activeSourcePage.pageNumber}`}
                    referrerPolicy="no-referrer"
                    style={{ width: `${zoomPercent}%`, maxWidth: 'none' }}
                    className="bg-white border border-slate-300 rounded shadow-xs object-contain transition-all duration-150"
                  />
                </div>
              ) : (
                <pre className="p-4 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {activeSourcePage.extractedText ||
                    'Không có văn bản thô cho trang này.'}
                </pre>
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <FileImage className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs">
                  Đề thi này chưa có tệp ảnh đính kèm hoặc được tạo thủ công.
                </p>
              </div>
            )}
          </div>

          {activeSourcePage && (
            <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>
                Phương thức:{' '}
                <strong className="text-slate-700">
                  {activeSourcePage.method === 'ocr'
                    ? 'Quét OCR Tiếng Việt (Tesseract)'
                    : activeSourcePage.method === 'gemini_ai'
                    ? 'Bóc tách AI (Gemini Backend Proxy)'
                    : 'Trích xuất lớp văn bản gốc'}
                </strong>
              </span>
              {typeof activeSourcePage.confidence === 'number' && (
                <span className="font-mono tabular-nums">
                  Độ tin cậy: {Math.round(activeSourcePage.confidence)}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* RIGHT ZONE: Question Editor / Exam Config / Student Preview (7 cols on desktop) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Sub-navigation tabs */}
          <div className="bg-white border border-slate-200 rounded-xl p-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setRightTab('questions')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  rightTab === 'questions'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                Câu hỏi &amp; Đáp án ({draft.questions.length})
              </button>

              <button
                type="button"
                onClick={() => setRightTab('settings')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  rightTab === 'settings'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                Cấu hình kỳ thi &amp; Bảo mật
              </button>

              <button
                type="button"
                onClick={() => setRightTab('preview')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  rightTab === 'preview'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Xem trước đề (Preview)
              </button>
            </div>

            {rightTab === 'questions' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setQuestionFilter('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      questionFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Tất cả ({draft.questions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionFilter('review')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      questionFilter === 'review'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    Cần kiểm tra ({reviewCount})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm câu
                </button>
              </div>
            )}
          </div>

          {/* TAB 1: QUESTIONS EDITOR */}
          {rightTab === 'questions' && (
            <div className="space-y-4">
              {displayedQuestions.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-900">
                    {questionFilter === 'review'
                      ? 'Tất cả câu hỏi đều đã được xác nhận đáp án rõ ràng.'
                      : 'Chưa có câu hỏi nào trong đề thi này.'}
                  </p>
                  {questionFilter === 'review' && (
                    <button
                      type="button"
                      onClick={() => setQuestionFilter('all')}
                      className="px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg"
                    >
                      Hiển thị toàn bộ câu hỏi
                    </button>
                  )}
                </div>
              ) : (
                displayedQuestions.map((q) => {
                  const actualIndex = draft.questions.findIndex(
                    (item) => item.id === q.id
                  );
                  return (
                    <div
                      key={q.id}
                      className={`bg-white border rounded-xl p-5 space-y-4 transition-colors ${
                        q.needsReview
                          ? 'border-amber-400 bg-amber-50/10'
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Question card top bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                            Câu {q.orderIndex}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <select
                            value={q.type}
                            onChange={(e) =>
                              handleQuestionTypeChange(
                                q.id,
                                e.target.value as QuestionType
                              )
                            }
                            className="px-2.5 py-1 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            <option value="single_choice">
                              Phần I · Trắc nghiệm 1 đáp án (TN)
                            </option>
                            <option value="multiple_choice">
                              Phần I · Trắc nghiệm nhiều đáp án (TN)
                            </option>
                            <option value="true_false">
                              Phần II · Đúng / Sai 4 mệnh đề (ĐS)
                            </option>
                            <option value="short_answer">
                              Phần III · Trả lời ngắn (TLN)
                            </option>
                          </select>

                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <span>Điểm:</span>
                            <input
                              type="number"
                              step="0.25"
                              min="0.1"
                              value={q.points}
                              onChange={(e) =>
                                updateQuestion(q.id, (curr) => ({
                                  ...curr,
                                  points: parseFloat(e.target.value) || 0,
                                }))
                              }
                              className="w-16 px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                            />
                          </div>

                          {q.needsReview ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Cần kiểm tra
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Đã đủ đáp án
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={actualIndex <= 0}
                            onClick={() => handleMoveQuestion(actualIndex, -1)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded disabled:opacity-30"
                            title="Chuyển lên"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={actualIndex >= draft.questions.length - 1}
                            onClick={() => handleMoveQuestion(actualIndex, 1)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded disabled:opacity-30"
                            title="Chuyển xuống"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Xóa câu hỏi"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Review Reason Banner if flagged */}
                      {q.needsReview && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2 text-xs text-amber-900">
                          <span>
                            <strong>Lý do cần kiểm tra:</strong>{' '}
                            {q.reviewReason ||
                              'Chưa xác định chắc chắn đáp án từ tài liệu gốc.'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuestion(q.id, (curr) => ({
                                ...curr,
                                needsReview: false,
                                reviewReason: undefined,
                              }))
                            }
                            className="px-2.5 py-1 text-xs font-semibold bg-white border border-amber-300 rounded hover:bg-amber-100 whitespace-nowrap shrink-0"
                          >
                            Đánh dấu Đã duyệt
                          </button>
                        </div>
                      )}

                      {/* Question Prompt Input + Live Math Render */}
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          Nội dung câu hỏi (hỗ trợ công thức LaTeX trong dấu{' '}
                          <code className="px-1 bg-slate-100 rounded">$...$</code>)
                        </label>
                        <textarea
                          rows={2}
                          value={q.prompt}
                          onChange={(e) =>
                            updateQuestion(q.id, (curr) => ({
                              ...curr,
                              prompt: e.target.value,
                            }))
                          }
                          className="w-full p-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        {q.prompt.includes('$') && (
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900">
                            <span className="text-xs font-semibold text-slate-500 block mb-1">
                              Hiển thị Toán học:
                            </span>
                            <MathText text={q.prompt} />
                          </div>
                        )}
                      </div>

                      {/* Options / Statements / Short Answer Input by Type */}
                      {(q.type === 'single_choice' ||
                        q.type === 'multiple_choice') && (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">
                              Các phương án lựa chọn (Nhấp vào chữ cái A/B/C/D để chọn{' '}
                              {q.type === 'single_choice'
                                ? '1 đáp án đúng'
                                : 'các đáp án đúng'}
                              ):
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateQuestion(q.id, (curr) => {
                                  const nextLetter = String.fromCharCode(
                                    65 + curr.options.length
                                  );
                                  return {
                                    ...curr,
                                    options: [
                                      ...curr.options,
                                      {
                                        id: nextLetter,
                                        label: nextLetter,
                                        text: `Phương án ${nextLetter}`,
                                      },
                                    ],
                                  };
                                })
                              }
                              className="text-xs font-semibold text-blue-700 hover:underline"
                            >
                              + Thêm phương án
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {q.options.map((opt) => {
                              const isSelected = q.correctAnswers.includes(opt.id);
                              return (
                                <div
                                  key={opt.id}
                                  className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                    isSelected
                                      ? 'border-emerald-600 bg-emerald-50/40'
                                      : 'border-slate-200 bg-white'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleOptionCorrect(q.id, opt.id)
                                    }
                                    className={`w-7 h-7 rounded-md text-xs font-bold font-mono flex items-center justify-center shrink-0 transition-colors ${
                                      isSelected
                                        ? 'bg-emerald-700 text-white'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                                    title="Chọn làm đáp án đúng"
                                  >
                                    {opt.label}
                                  </button>
                                  <input
                                    type="text"
                                    value={opt.text}
                                    onChange={(e) =>
                                      updateQuestion(q.id, (curr) => ({
                                        ...curr,
                                        options: curr.options.map((o) =>
                                          o.id === opt.id
                                            ? { ...o, text: e.target.value }
                                            : o
                                        ),
                                      }))
                                    }
                                    className="w-full px-2 py-1 text-sm bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {q.type === 'true_false' && (
                        <div className="space-y-2.5">
                          <span className="block text-xs font-semibold text-slate-700">
                            Các mệnh đề xét tính Đúng / Sai (4 ý a, b, c, d):
                          </span>
                          <div className="space-y-2">
                            {(q.statements || []).map((st) => (
                              <div
                                key={st.id}
                                className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                              >
                                <span className="text-xs font-bold font-mono text-slate-700 w-6 shrink-0">
                                  {st.label}
                                </span>
                                <input
                                  type="text"
                                  value={st.text}
                                  onChange={(e) =>
                                    updateQuestion(q.id, (curr) => ({
                                      ...curr,
                                      statements: (curr.statements || []).map(
                                        (item) =>
                                          item.id === st.id
                                            ? { ...item, text: e.target.value }
                                            : item
                                      ),
                                    }))
                                  }
                                  className="w-full px-2.5 py-1 text-sm bg-white border border-slate-300 rounded-md"
                                />
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStatementTruthChange(q.id, st.id, true)
                                    }
                                    className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                                      st.isTrue === true
                                        ? 'bg-emerald-700 text-white'
                                        : 'bg-white border border-slate-300 text-slate-600'
                                    }`}
                                  >
                                    Đúng
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStatementTruthChange(q.id, st.id, false)
                                    }
                                    className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                                      st.isTrue === false
                                        ? 'bg-red-700 text-white'
                                        : 'bg-white border border-slate-300 text-slate-600'
                                    }`}
                                  >
                                    Sai
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {q.type === 'short_answer' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Đáp số chuẩn (Học sinh điền khớp giá trị này sẽ được tính đúng; phân cách nhiều cách viết bằng dấu chấm phẩy `;`):
                          </label>
                          <input
                            type="text"
                            value={q.correctAnswers.join('; ')}
                            onChange={(e) => {
                              const vals = e.target.value
                                .split(';')
                                .map((s) => s.trim())
                                .filter(Boolean);
                              updateQuestion(q.id, (curr) => ({
                                ...curr,
                                correctAnswers: vals,
                                needsReview: vals.length === 0,
                                reviewReason:
                                  vals.length === 0
                                    ? 'Chưa nhập đáp số chuẩn'
                                    : undefined,
                              }));
                            }}
                            placeholder="VD: 6 hoặc 12.5; 12,5"
                            className="w-full max-w-md px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                      )}

                      {/* Explanation Editor */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Lời giải chi tiết (Chỉ hiển thị cho học sinh sau thời điểm giáo viên cho phép):
                        </label>
                        <textarea
                          rows={2}
                          value={q.explanation}
                          onChange={(e) =>
                            updateQuestion(q.id, (curr) => ({
                              ...curr,
                              explanation: e.target.value,
                            }))
                          }
                          placeholder="Nhập hướng dẫn giải hoặc công thức giải chi tiết..."
                          className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: EXAM CONFIGURATION & SECURITY */}
          {rightTab === 'settings' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cấu hình kỳ thi, Quy tắc chấm điểm &amp; Kiểm soát truy cập
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mọi quy tắc về thời gian mở/đóng đề, số lần làm bài tối đa, đảo câu hỏi/đáp án và thời điểm công bố lời giải đều được kiểm tra trực tiếp tại máy chủ Backend.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên bài thi
                  </label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, title: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Môn học
                  </label>
                  <input
                    type="text"
                    value={draft.subject}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, subject: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Khối lớp
                  </label>
                  <select
                    value={draft.gradeLevel || 'Lớp 12'}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, gradeLevel: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Lớp 10">Lớp 10</option>
                    <option value="Lớp 11">Lớp 11</option>
                    <option value="Lớp 12">Lớp 12</option>
                    <option value="THPT Quốc Gia">Ôn thi THPT Quốc Gia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phân loại Kỳ thi
                  </label>
                  <input
                    type="text"
                    value={draft.examCategory || 'Cuối HK2'}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, examCategory: e.target.value }))
                    }
                    placeholder="VD: Cuối HK2, Giữa HK1, Thi thử..."
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mã đường dẫn bài thi (Share Code)
                  </label>
                  <input
                    type="text"
                    value={draft.shareCode}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        shareCode: e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, ''),
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thời gian làm bài (Phút)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={draft.durationMinutes}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        durationMinutes: parseInt(e.target.value, 10) || 45,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thang điểm quy đổi
                  </label>
                  <select
                    value={draft.totalScale}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        totalScale: Number(e.target.value) || 10,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                  >
                    <option value={10}>Thang điểm 10 (Chuẩn phổ thông VN)</option>
                    <option value={100}>Thang điểm 100 (Đánh giá năng lực)</option>
                    <option value={20}>Thang điểm 20</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quy tắc chấm Phần II (Đúng/Sai 4 mệnh đề)
                  </label>
                  <select
                    value={draft.trueFalseScoring || 'standard_10_25_50_100'}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trueFalseScoring: e.target.value as TrueFalseScoringRule,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="standard_10_25_50_100">
                      Chuẩn Bộ GD&amp;ĐT (1 ý: 10%, 2 ý: 25%, 3 ý: 50%, 4 ý: 100%)
                    </option>
                    <option value="equal_per_statement">
                      Chia đều mỗi ý đúng (25% / mệnh đề)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Giới hạn số lượt làm bài mỗi học sinh
                  </label>
                  <select
                    value={draft.maxAttempts || 0}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        maxAttempts: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                  >
                    <option value={0}>Không giới hạn số lượt làm bài</option>
                    <option value={1}>Chỉ được phép thi 1 lần duy nhất</option>
                    <option value={2}>Tối đa 2 lượt làm bài</option>
                    <option value={3}>Tối đa 3 lượt làm bài</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thời gian bắt đầu mở đề (Bỏ trống nếu mở ngay)
                  </label>
                  <input
                    type="datetime-local"
                    value={
                      draft.openAt
                        ? new Date(
                            new Date(draft.openAt).getTime() -
                              new Date().getTimezoneOffset() * 60000
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ''
                    }
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        openAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thời gian đóng đề (Bỏ trống nếu không giới hạn ngày đóng)
                  </label>
                  <input
                    type="datetime-local"
                    value={
                      draft.closeAt
                        ? new Date(
                            new Date(draft.closeAt).getTime() -
                              new Date().getTimezoneOffset() * 60000
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ''
                    }
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        closeAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mật khẩu ca thi (Tùy chọn — bỏ trống nếu không đặt mật khẩu)
                  </label>
                  <input
                    type="text"
                    value={draft.accessCode}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, accessCode: e.target.value }))
                    }
                    placeholder="VD: SINH11CK2"
                    className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trạng thái xuất bản đề thi
                  </label>
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        status: e.target.value as ExamStatus,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="draft">▲ Bản nháp (Học sinh không truy cập được)</option>
                    <option value="published">● Đã xuất bản (Cho phép học sinh vào thi)</option>
                    <option value="closed">■ Đã đóng đề (Khóa nhận bài làm mới)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thời điểm cho phép học sinh xem đáp án đúng &amp; lời giải chi tiết
                  </label>
                  <select
                    value={draft.showSolutionPolicy}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        showSolutionPolicy: e.target.value as SolutionPolicy,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="after_submit">
                      Hiện đáp án &amp; lời giải ngay sau khi học sinh nộp bài
                    </option>
                    <option value="after_close">
                      Chỉ hiện sau thời điểm đóng đề thi
                    </option>
                    <option value="manual_release">
                      Khóa hoàn toàn cho đến khi Giáo viên bấm Mở khóa đáp án
                    </option>
                  </select>
                </div>
              </div>

              {/* Shuffle toggles */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.shuffleQuestions)}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        shuffleQuestions: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-slate-300 text-blue-700"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Đảo thứ tự câu hỏi tự động
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Mỗi học sinh khi vào phòng thi sẽ nhận thứ tự câu hỏi ngẫu nhiên khác nhau.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.shuffleOptions)}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        shuffleOptions: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-slate-300 text-blue-700"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Đảo thứ tự các phương án A/B/C/D
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Tự động trộn vị trí các lựa chọn trong câu hỏi trắc nghiệm.
                    </span>
                  </div>
                </label>
              </div>

              {draft.showSolutionPolicy !== 'after_submit' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      {draft.solutionsReleased ? (
                        <Unlock className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <Lock className="w-4 h-4 text-amber-600" />
                      )}
                      Trạng thái công bố đáp án thủ công:{' '}
                      {draft.solutionsReleased ? 'Đang mở khóa' : 'Đang khóa trên Server'}
                    </div>
                    <p className="text-xs text-slate-500">
                      Khi đang khóa, API máy chủ sẽ loại bỏ hoàn toàn đáp án đúng và lời giải khỏi kết quả trả về của học sinh.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        solutionsReleased: !d.solutionsReleased,
                      }))
                    }
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      draft.solutionsReleased
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-emerald-700 text-white hover:bg-emerald-800'
                    }`}
                  >
                    {draft.solutionsReleased
                      ? 'Khóa lại đáp án'
                      : 'Mở khóa đáp án ngay'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PREVIEW BEFORE PUBLISHING */}
          {rightTab === 'preview' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-blue-700">
                    Chế độ Xem trước đề thi (Preview trước khi xuất bản)
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                    {draft.title}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                    Môn: {draft.subject} · Thời gian: {draft.durationMinutes} phút · Thang điểm:{' '}
                    {draft.totalScale} · Số câu: {draft.questions.length}
                  </p>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={previewShowSolutions}
                    onChange={(e) => setPreviewShowSolutions(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  Hiển thị đáp án &amp; lời giải trên trang xem trước
                </label>
              </div>

              <div className="space-y-5">
                {draft.questions.map((q) => (
                  <div
                    key={q.id}
                    className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                      <span className="font-bold text-slate-900 text-sm">
                        Câu {q.orderIndex}
                      </span>
                      <span>{q.points} điểm</span>
                    </div>

                    <div className="text-sm text-slate-900">
                      <MathText text={q.prompt} />
                    </div>

                    {(q.type === 'single_choice' ||
                      q.type === 'multiple_choice') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {q.options.map((opt) => {
                          const isCorrect =
                            previewShowSolutions &&
                            q.correctAnswers.includes(opt.id);
                          const isClicked = previewAnswers[q.id] === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                setPreviewAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: opt.id,
                                }))
                              }
                              className={`flex items-center gap-2.5 p-2.5 text-left rounded-lg border text-sm transition-colors ${
                                isCorrect
                                  ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-medium'
                                  : isClicked
                                  ? 'border-blue-600 bg-blue-50 text-blue-950'
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              <span className="w-6 h-6 rounded bg-slate-100 text-slate-800 text-xs font-bold font-mono flex items-center justify-center shrink-0">
                                {opt.label}
                              </span>
                              <MathText text={opt.text} />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.type === 'true_false' && q.statements && (
                      <div className="space-y-2 pt-1">
                        {q.statements.map((st) => (
                          <div
                            key={st.id}
                            className="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 rounded-lg text-sm"
                          >
                            <div>
                              <strong className="font-mono mr-1.5">
                                {st.label}
                              </strong>
                              <MathText text={st.text} />
                            </div>
                            {previewShowSolutions && (
                              <span
                                className={`text-xs font-bold font-mono shrink-0 ${
                                  st.isTrue
                                    ? 'text-emerald-700'
                                    : 'text-red-700'
                                }`}
                              >
                                {typeof st.isTrue === 'boolean'
                                  ? st.isTrue
                                    ? 'ĐÚNG'
                                    : 'SAI'
                                  : 'Chưa rõ'}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {q.type === 'short_answer' && (
                      <div className="pt-1 space-y-1.5">
                        <input
                          type="text"
                          placeholder="Học sinh nhập câu trả lời ngắn tại đây..."
                          className="w-full max-w-xs px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                        />
                        {previewShowSolutions && (
                          <div className="text-xs font-mono text-emerald-700 font-semibold">
                            Đáp số chuẩn: {q.correctAnswers.join(' hoặc ') || '(Chưa có)'}
                          </div>
                        )}
                      </div>
                    )}

                    {previewShowSolutions && q.explanation && (
                      <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg text-xs text-slate-700">
                        <strong className="text-blue-900">Lời giải: </strong>
                        <MathText text={q.explanation} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
