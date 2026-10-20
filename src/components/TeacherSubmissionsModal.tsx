import React, { useState } from 'react';
import {
  X,
  Users,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  Eye,
  Search,
  Download,
} from 'lucide-react';
import { MathText } from '../utils/mathRenderer';
import type { Exam, Submission } from '../types/exam';

interface TeacherSubmissionsModalProps {
  exam: Exam;
  submissions: Submission[];
  onClose: () => void;
  onToggleReleaseSolutions: (examId: string, nextReleased: boolean) => Promise<void>;
}

export const TeacherSubmissionsModal: React.FC<TeacherSubmissionsModalProps> = ({
  exam,
  submissions,
  onClose,
  onToggleReleaseSolutions,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSub, setSelectedSub] = useState<Submission | null>(
    submissions[0] || null
  );
  const [isUpdatingRelease, setIsUpdatingRelease] = useState(false);

  const submittedList = submissions.filter((s) => s.status === 'submitted');
  const avgScore =
    submittedList.length > 0
      ? (
          submittedList.reduce((acc, s) => acc + (s.scaledScore || 0), 0) /
          submittedList.length
        ).toFixed(2)
      : '—';

  const maxScore =
    submittedList.length > 0
      ? Math.max(...submittedList.map((s) => s.scaledScore || 0)).toFixed(2)
      : '—';

  const filteredSubmissions = submissions.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.studentName.toLowerCase().includes(q) ||
      s.studentClass.toLowerCase().includes(q) ||
      s.studentCode.toLowerCase().includes(q)
    );
  });

  const handleExportCsv = () => {
    const headers = [
      'Ho va ten',
      'Lop',
      'Ma hoc sinh',
      'Trang thai',
      `Diem (Thang ${exam.totalScale})`,
      'Diem goc',
      'So lan chuyen tab',
      'Thoi gian bat dau',
      'Thoi gian nop',
    ];
    const rows = submissions.map((s) => [
      `"${s.studentName.replace(/"/g, '""')}"`,
      `"${s.studentClass.replace(/"/g, '""')}"`,
      `"${s.studentCode.replace(/"/g, '""')}"`,
      s.status === 'submitted' ? 'Da nop' : 'Dang lam',
      s.scaledScore !== null ? s.scaledScore : '',
      s.rawScore !== null ? s.rawScore : '',
      s.tabSwitchCount,
      s.startedAt ? new Date(s.startedAt).toLocaleString('vi-VN') : '',
      s.submittedAt ? new Date(s.submittedAt).toLocaleString('vi-VN') : '',
    ]);
    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bang_Diem_${exam.shareCode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleRelease = async () => {
    setIsUpdatingRelease(true);
    try {
      await onToggleReleaseSolutions(exam.id, !exam.solutionsReleased);
    } finally {
      setIsUpdatingRelease(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-6xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Thống kê Lượt làm bài & Điểm số: {exam.title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              Mã đề: {exam.shareCode} · Thang điểm: {exam.totalScale} · Chính sách đáp án:{' '}
              {exam.showSolutionPolicy === 'after_submit'
                ? 'Hiện ngay sau khi nộp'
                : exam.showSolutionPolicy === 'after_close'
                ? 'Hiện sau khi đóng đề'
                : 'Chỉ hiện khi Giáo viên mở khóa'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isUpdatingRelease}
              onClick={handleToggleRelease}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                exam.solutionsReleased
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              {exam.solutionsReleased ? (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  Đáp án: Đang mở cho học sinh
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  Đáp án: Đang khóa (Bấm để mở)
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={submissions.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất bảng điểm CSV
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50/70">
          <div className="p-4">
            <span className="text-xs text-slate-500">Tổng lượt vào thi</span>
            <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {submissions.length}
            </div>
          </div>
          <div className="p-4">
            <span className="text-xs text-slate-500">Đã nộp bài hoàn tất</span>
            <div className="text-xl font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
              {submittedList.length}
            </div>
          </div>
          <div className="p-4">
            <span className="text-xs text-slate-500">
              Điểm trung bình (/{exam.totalScale})
            </span>
            <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {avgScore}
            </div>
          </div>
          <div className="p-4">
            <span className="text-xs text-slate-500">
              Điểm cao nhất (/{exam.totalScale})
            </span>
            <div className="text-xl font-bold text-blue-700 font-mono tabular-nums mt-0.5">
              {maxScore}
            </div>
          </div>
        </div>

        {/* Content Split: Submissions Table & Detailed Answer Sheet */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Left: Table of Submissions (6 cols) */}
          <div className="lg:col-span-6 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo họ tên, lớp hoặc mã học sinh..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredSubmissions.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-2">
                  <Users className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-800">
                    Chưa có lượt làm bài nào
                  </p>
                  <p className="text-xs">
                    Hãy gửi đường link bài thi hoặc bấm &ldquo;Làm bài thử&rdquo; để kiểm tra quy trình chấm điểm.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-4">Học sinh</th>
                      <th className="py-2.5 px-3">Lớp / Mã</th>
                      <th className="py-2.5 px-3 text-right">Điểm số</th>
                      <th className="py-2.5 px-3 text-right">Rời màn hình</th>
                      <th className="py-2.5 px-4 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSubmissions.map((sub) => {
                      const isSelected = selectedSub?.id === sub.id;
                      return (
                        <tr
                          key={sub.id}
                          onClick={() => setSelectedSub(sub)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50/70'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {sub.studentName}
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-mono">
                            {sub.studentClass}
                            {sub.studentCode ? ` · ${sub.studentCode}` : ''}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                            {sub.scaledScore !== null
                              ? `${sub.scaledScore.toFixed(2)} / ${exam.totalScale}`
                              : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                            {sub.tabSwitchCount} lần
                          </td>
                          <td className="py-3 px-4 text-right">
                            {sub.status === 'submitted' ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {sub.autoSubmitted ? 'Tự nộp (Hết giờ)' : 'Đã nộp'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                                <Clock className="w-3.5 h-3.5" />
                                Đang làm
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right: Detailed Student Answer Sheet (6 cols) */}
          <div className="lg:col-span-6 overflow-y-auto p-5 bg-slate-50/50 space-y-4">
            {selectedSub ? (
              <>
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Bài làm của: {selectedSub.studentName} ({selectedSub.studentClass})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                      Bắt đầu: {new Date(selectedSub.startedAt).toLocaleString('vi-VN')}
                      {selectedSub.submittedAt
                        ? ` · Nộp lúc: ${new Date(
                            selectedSub.submittedAt
                          ).toLocaleString('vi-VN')}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-lg font-bold text-blue-700">
                      {selectedSub.scaledScore !== null
                        ? `${selectedSub.scaledScore.toFixed(2)} / ${exam.totalScale}`
                        : 'Đang làm'}
                    </div>
                    <div className="text-xs text-slate-500">
                      Điểm gốc: {selectedSub.rawScore ?? 0} /{' '}
                      {selectedSub.maxRawScore ?? 0}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {exam.questions.map((q) => {
                    const detail = selectedSub.gradeDetails?.find(
                      (d) => d.questionId === q.id
                    );
                    const ans = selectedSub.answers[q.id];
                    return (
                      <div
                        key={q.id}
                        className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between font-mono tabular-nums">
                          <span className="font-bold text-slate-900">
                            Câu {q.orderIndex}
                          </span>
                          <span
                            className={`font-semibold ${
                              detail?.isCorrect
                                ? 'text-emerald-700'
                                : detail?.partialCredit
                                ? 'text-amber-700'
                                : 'text-red-700'
                            }`}
                          >
                            {detail
                              ? `${detail.earnedPoints} / ${detail.maxPoints} điểm (${
                                  detail.isCorrect
                                    ? 'Đúng'
                                    : detail.partialCredit
                                    ? 'Đúng một phần'
                                    : 'Sai / Chưa làm'
                                })`
                              : `${q.points} điểm`}
                          </span>
                        </div>

                        <div className="text-slate-800 text-sm">
                          <MathText text={q.prompt} />
                        </div>

                        <div className="pt-1 text-slate-600 font-mono">
                          <div>
                            <strong>Học sinh chọn/điền: </strong>
                            {q.type === 'short_answer'
                              ? ans?.shortText || '(Bỏ trống)'
                              : q.type === 'true_false' && ans?.statementAnswers
                              ? Object.entries(ans.statementAnswers)
                                  .map(
                                    ([k, v]) => `${k}: ${v ? 'Đúng' : 'Sai'}`
                                  )
                                  .join(', ') || '(Bỏ trống)'
                              : ans?.selectedOptions?.join(', ') || '(Bỏ trống)'}
                          </div>
                          <div className="text-emerald-800 mt-0.5">
                            <strong>Đáp án đúng: </strong>
                            {q.correctAnswers.join(', ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <Eye className="w-7 h-7 text-slate-400 mb-2" />
                <p className="text-xs">
                  Chọn một học sinh ở danh sách bên trái để xem chi tiết bài làm và điểm từng câu.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
