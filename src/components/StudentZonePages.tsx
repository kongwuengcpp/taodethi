import React, { useState, useEffect } from 'react';
import {
  Search,
  ArrowRight,
  Clock,
  CheckCircle2,
  Lock,
  Unlock,
  AlertTriangle,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import { MathText } from '../utils/mathRenderer';
import { resolveApiUrl } from '../lib/authClient';
import {
  MY_RESULTS_STORAGE_KEY,
  type StoredPersonalResultItem,
} from './StudentExamPortal';
import type { PublicExamInfo, PublicQuestion, Submission } from '../types/exam';

interface StudentHomePageProps {
  onSelectExam: (shareCode: string) => void;
  onGoToMyResults: () => void;
}

export const StudentHomePage: React.FC<StudentHomePageProps> = ({
  onSelectExam,
  onGoToMyResults,
}) => {
  const [codeInput, setCodeInput] = useState('');
  const [publishedExams, setPublishedExams] = useState<PublicExamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');

  useEffect(() => {
    async function loadPublished() {
      setLoading(true);
      try {
        const res = await fetch(resolveApiUrl('/api/student/published-exams'));
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.exams)) {
            setPublishedExams(data.exams);
          }
        }
      } catch {
        // Network or fetch failure handled gracefully
      } finally {
        setLoading(false);
      }
    }
    loadPublished();
  }, []);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    if (!clean) {
      setLookupError('Vui lòng nhập mã đề thi do giáo viên cung cấp.');
      return;
    }
    setLookupError(null);
    try {
      const res = await fetch(
        resolveApiUrl(`/api/student/exams/${encodeURIComponent(clean)}/info`)
      );
      const data = await res.json();
      if (!res.ok) {
        setLookupError(
          data.error || 'Không tìm thấy bài thi đã xuất bản với mã này.'
        );
        return;
      }
      onSelectExam(data.exam.shareCode);
    } catch {
      setLookupError('Không thể kết nối máy chủ để tìm bài thi. Vui lòng thử lại.');
    }
  };

  const filteredExams = publishedExams.filter((exam) => {
    if (selectedGrade !== 'ALL' && (exam.gradeLevel || 'Lớp 12') !== selectedGrade) {
      return false;
    }
    if (
      selectedSubject !== 'ALL' &&
      !exam.subject.toLowerCase().includes(selectedSubject.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Student Entry Hero */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5 shadow-2xs">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-blue-700">
              Cổng Làm Bài Thi Trực Tuyến
            </span>
            <span aria-hidden="true">·</span>
            <span>Ứng dụng độc lập dành riêng cho Học sinh</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Nhập mã đề thi hoặc chọn đề mở để vào phòng làm bài
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
            Nhập mã đề thi do giáo viên cung cấp hoặc chọn trực tiếp từ danh sách đề thi đã xuất bản theo khối lớp và môn học bên dưới.
          </p>
        </div>

        <form
          onSubmit={handleCodeSubmit}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-xl"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="Nhập mã đề thi..."
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono uppercase bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <span>Mở phòng chuẩn bị thi</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {lookupError && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-800 max-w-xl">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{lookupError}</span>
          </div>
        )}
      </div>

      {/* Published Open Exams Section with Grade & Subject Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Danh sách Đề thi Đang Mở ({filteredExams.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chỉ các đề thi đã được giáo viên xuất bản chính thức mới xuất hiện tại đây
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium"
            >
              <option value="ALL">Tất cả Khối lớp</option>
              <option value="Lớp 10">Đề thi Lớp 10</option>
              <option value="Lớp 11">Đề thi Lớp 11</option>
              <option value="Lớp 12">Đề thi Lớp 12</option>
              <option value="THPT Quốc Gia">Ôn thi THPT Quốc Gia</option>
            </select>

            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium"
            >
              <option value="ALL">Tất cả Môn học</option>
              <option value="Toán">Toán Học</option>
              <option value="Vật Lý">Vật Lý</option>
              <option value="Hóa">Hóa Học</option>
              <option value="Sinh">Sinh Học</option>
              <option value="Tiếng Anh">Tiếng Anh</option>
              <option value="Ngữ Văn">Ngữ Văn</option>
            </select>

            <button
              type="button"
              onClick={onGoToMyResults}
              className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Kết quả đã nộp của tôi &rarr;
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
            Đang tải danh sách bài thi...
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-800">
              Hiện chưa có đề thi công khai nào đang mở trong danh mục này
            </p>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              Hệ thống không tự tạo dữ liệu mẫu giả trong môi trường sản phẩm. Vui lòng nhập Mã đề thi do giáo viên cung cấp hoặc chờ giáo viên xuất bản đề thi từ Cổng Quản trị.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredExams.map((exam) => {
              const sec = exam.sectionSummary;
              return (
                <div
                  key={exam.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                      <span className="font-bold text-blue-700">
                        MÃ: {exam.shareCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans font-semibold text-slate-700">
                        {exam.subject}
                      </span>
                      {exam.gradeLevel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans">{exam.gradeLevel}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{exam.durationMinutes} phút</span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {exam.title}
                    </h3>

                    {/* TN - ĐS - TLN Section Breakdown Line */}
                    {sec && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-1.5 tabular-nums">
                        <span>TN: {sec.tnCount} câu</span>
                        <span aria-hidden="true">·</span>
                        <span>ĐS: {sec.dsCount} câu</span>
                        <span aria-hidden="true">·</span>
                        <span>TLN: {sec.tlnCount} câu</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-bold text-slate-900">
                          Tổng: {sec.totalRawPoints}đ (Thang {exam.totalScale})
                        </span>
                      </div>
                    )}

                    {exam.description && (
                      <p className="text-xs text-slate-600 line-clamp-2">
                        {exam.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold ${
                        exam.isOpen ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {exam.isOpen ? '● Đang mở làm bài' : '▲ Chưa mở / Đã đóng'}
                    </span>

                    <button
                      type="button"
                      onClick={() => onSelectExam(exam.shareCode)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Xem cấu trúc &amp; Vào thi</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Student Instructions Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">
          Quy trình làm bài trực tuyến chuẩn (TN - ĐS - TLN)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
          <div className="space-y-1">
            <div className="font-semibold text-slate-900">
              01. Xem cấu trúc đề &amp; Nhập thông tin
            </div>
            <p>
              Kiểm tra số câu Trắc nghiệm (TN), Đúng/Sai (ĐS), Trả lời ngắn (TLN), thời gian và điểm số trước khi bấm bắt đầu tính giờ.
            </p>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-slate-900">
              02. Tự động lưu &amp; Khôi phục khi rớt mạng
            </div>
            <p>
              Mọi đáp án được tự động lưu liên tục. Nếu mất kết nối mạng hoặc vô tình tải lại trang, bài làm đang dở được tự động khôi phục.
            </p>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-slate-900">
              03. Xác nhận nộp bài &amp; Chấm điểm tự động
            </div>
            <p>
              Kiểm tra các câu chưa làm hoặc đánh dấu xem lại trước khi nộp. Máy chủ tự chấm điểm ngay theo thang điểm quy định.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// STUDENT PERSONAL RESULTS PAGE (`/my-results`)
// =========================================================================
interface StudentMyResultsPageProps {
  onGoToStudentHome: () => void;
}

export const StudentMyResultsPage: React.FC<StudentMyResultsPageProps> = ({
  onGoToStudentHome,
}) => {
  const [records, setRecords] = useState<StoredPersonalResultItem[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<{
    submission: Submission;
    questions: PublicQuestion[];
    examTitle: string;
    token: string;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MY_RESULTS_STORAGE_KEY);
      if (raw) {
        setRecords(JSON.parse(raw));
      }
    } catch {
      setRecords([]);
    }
  }, []);

  const handleInspectSubmission = async (item: StoredPersonalResultItem) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(
        resolveApiUrl(`/api/student/submissions/${item.submissionId}/result`),
        {
          headers: {
            'X-Submission-Token': item.studentAccessToken,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Không thể tải chi tiết kết quả bài thi.');
      } else {
        setSelectedDetail({
          submission: data.submission,
          questions: data.questions || [],
          examTitle: data.examTitle || item.examTitle,
          token: item.studentAccessToken,
        });
      }
    } catch {
      setError('Không thể kết nối máy chủ.');
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Kết quả bài thi của bản thân (/my-results)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bạn chỉ có thể xem điểm số và bài làm của chính mình theo chính sách bảo mật của kỳ thi
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToStudentHome}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          Về Trang chủ Học sinh
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {error}
        </div>
      )}

      {records.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <FileCheck className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">
            Bạn chưa có bài thi nào đã nộp trên trình duyệt này
          </p>
          <p className="text-xs text-slate-500">
            Sau khi hoàn thành và nộp một bài thi, điểm số và chi tiết bài làm của bạn sẽ được lưu tại đây.
          </p>
          <button
            type="button"
            onClick={onGoToStudentHome}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
          >
            Vào làm bài thi ngay
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {records.map((rec) => (
            <div
              key={rec.submissionId}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                  <span className="font-bold text-blue-700">
                    Mã đề: {rec.shareCode}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans">{rec.examSubject}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Nộp lúc: {new Date(rec.submittedAt).toLocaleString('vi-VN')}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  {rec.examTitle}
                </h2>
                <p className="text-xs text-slate-600">
                  Thí sinh: <strong>{rec.studentName}</strong> ({rec.studentClass})
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right font-mono tabular-nums">
                  <div className="text-lg font-bold text-blue-700">
                    {rec.scaledScore !== null
                      ? `${Number(rec.scaledScore).toFixed(2)} / ${rec.totalScale}`
                      : '—'}
                  </div>
                  <span className="text-xs text-slate-500">Điểm đạt được</span>
                </div>

                <button
                  type="button"
                  disabled={loadingDetail}
                  onClick={() => handleInspectSubmission(rec)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Xem chi tiết
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDetail && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Chi tiết bài làm: {selectedDetail.examTitle}
              </h3>
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                Thí sinh: {selectedDetail.submission.studentName} (
                {selectedDetail.submission.studentClass}) · Điểm:{' '}
                {selectedDetail.submission.scaledScore?.toFixed(2)} /{' '}
                {selectedDetail.submission.totalScale}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                handleInspectSubmission({
                  submissionId: selectedDetail.submission.id,
                  studentAccessToken: selectedDetail.token,
                  shareCode: selectedDetail.submission.shareCode,
                  examTitle: selectedDetail.examTitle,
                  examSubject: '',
                  studentName: selectedDetail.submission.studentName,
                  studentClass: selectedDetail.submission.studentClass,
                  submittedAt: selectedDetail.submission.submittedAt || '',
                  scaledScore: selectedDetail.submission.scaledScore,
                  totalScale: selectedDetail.submission.totalScale,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Làm mới trạng thái đáp án
            </button>
          </div>

          <div
            className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs ${
              selectedDetail.submission.solutionsVisible
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {selectedDetail.submission.solutionsVisible ? (
              <Unlock className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{selectedDetail.submission.solutionNotice}</span>
          </div>

          <div className="space-y-3">
            {selectedDetail.questions.map((q) => {
              const detail = selectedDetail.submission.gradeDetails?.find(
                (d) => d.questionId === q.id
              );
              const ans = selectedDetail.submission.answers[q.id];
              return (
                <div
                  key={q.id}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between font-mono tabular-nums">
                    <span className="font-bold text-slate-900">
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
                        {detail.earnedPoints} / {detail.maxPoints} điểm
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-900">
                    <MathText text={q.prompt} />
                  </div>
                  <div className="font-mono text-slate-700">
                    <strong>Bạn đã chọn/điền: </strong>
                    {q.type === 'short_answer'
                      ? ans?.shortText || '(Chưa trả lời)'
                      : q.type === 'true_false' && ans?.statementAnswers
                      ? Object.entries(ans.statementAnswers)
                          .map(([k, v]) => `${k}) ${v ? 'Đúng' : 'Sai'}`)
                          .join(' · ') || '(Chưa trả lời)'
                      : ans?.selectedOptions?.join(', ') || '(Chưa trả lời)'}
                  </div>
                  {selectedDetail.submission.solutionsVisible &&
                    detail?.correctAnswers && (
                      <div className="font-mono text-emerald-800">
                        <strong>Đáp án đúng: </strong>
                        {detail.correctAnswers.join(', ')}
                      </div>
                    )}
                  {selectedDetail.submission.solutionsVisible &&
                    detail?.explanation && (
                      <div className="pt-1 text-slate-700">
                        <strong>Lời giải: </strong>
                        <MathText text={detail.explanation} />
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
