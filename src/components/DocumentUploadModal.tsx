import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Sparkles,
  ClipboardPaste,
  Cpu,
} from 'lucide-react';
import {
  extractDocumentPages,
  createRealSampleOcrImageFile,
  getSampleExtractedPagesWithReviewFlag,
  renderTextSheetToDataUrl,
  type ExtractionProgress,
} from '../utils/documentExtractor';
import { parseExamFromPages } from '../utils/examParser';
import { apiFetch } from '../lib/authClient';
import type { Exam, Question, SourcePageImage } from '../types/exam';

interface DocumentUploadModalProps {
  onClose: () => void;
  onExtractedExam: (draftExam: Partial<Exam>) => void;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  onClose,
  onExtractedExam,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [extractionEngine, setExtractionEngine] = useState<
    'ocr_regex' | 'gemini_ai'
  >('ocr_regex');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress>({
    stage: '',
    percent: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [examTitleInput, setExamTitleInput] = useState('');
  const [examSubjectInput, setExamSubjectInput] = useState('Sinh Học');
  const [gradeLevelInput, setGradeLevelInput] = useState('Lớp 11');
  const [examCategoryInput, setExamCategoryInput] = useState('Cuối HK2');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const finalizeExtraction = async (
    fileName: string,
    fileType: string,
    pages: SourcePageImage[],
    customTitle?: string
  ) => {
    let parsedQuestions: Question[] = [];

    if (extractionEngine === 'gemini_ai') {
      setProgress({
        stage:
          'Đang gửi nội dung lên Backend AI Proxy (/api/teacher/extract-ai) để bóc tách cấu trúc TN - ĐS - TLN...',
        percent: 88,
      });

      const combinedText = pages.map((p) => p.extractedText).join('\n\n');
      const firstImage = pages[0]?.dataUrl?.startsWith('data:image/')
        ? pages[0].dataUrl
        : undefined;

      try {
        const aiRes = await apiFetch('/api/teacher/extract-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: combinedText,
            imageDataUrl: firstImage,
          }),
        });
        const aiData = await aiRes.json();
        if (aiRes.ok && Array.isArray(aiData.questions) && aiData.questions.length > 0) {
          parsedQuestions = aiData.questions.map((q: any, idx: number) => ({
            id: `ai-q-${Date.now()}-${idx + 1}`,
            orderIndex: idx + 1,
            type:
              q.type === 'multiple_choice' ||
              q.type === 'true_false' ||
              q.type === 'short_answer'
                ? q.type
                : 'single_choice',
            prompt: q.prompt || `Câu hỏi ${idx + 1}`,
            options: Array.isArray(q.options) ? q.options : [],
            statements: Array.isArray(q.statements) ? q.statements : undefined,
            correctAnswers: Array.isArray(q.correctAnswers)
              ? q.correctAnswers
              : [],
            points:
              typeof q.points === 'number' && q.points > 0
                ? q.points
                : q.type === 'true_false'
                ? 1.0
                : q.type === 'short_answer'
                ? 0.5
                : 0.25,
            explanation: q.explanation || '',
            needsReview:
              Boolean(q.needsReview) ||
              (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0),
            reviewReason:
              q.reviewReason ||
              (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0
                ? 'AI chưa xác định chắc chắn đáp án đúng trong tài liệu gốc — cần giáo viên kiểm tra.'
                : undefined),
            sourcePage: 1,
          }));
        } else {
          // Fallback to OCR/Regex parser if Gemini key is not configured or returned empty
          parsedQuestions = parseExamFromPages(pages);
        }
      } catch {
        parsedQuestions = parseExamFromPages(pages);
      }
    } else {
      parsedQuestions = parseExamFromPages(pages);
    }

    if (parsedQuestions.length === 0) {
      setError(
        'Không nhận diện được câu hỏi nào từ tài liệu. Vui lòng kiểm tra lại định dạng câu hỏi (ví dụ: Câu 1:, A., B., C., D.).'
      );
      setIsProcessing(false);
      return;
    }

    const baseName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    const draftExam: Partial<Exam> = {
      title: customTitle || examTitleInput.trim() || `Đề kiểm tra: ${baseName}`,
      subject: examSubjectInput.trim() || 'Sinh Học',
      gradeLevel: gradeLevelInput,
      examCategory: examCategoryInput,
      description: `Trích xuất từ tệp ${fileName} (${parsedQuestions.length} câu hỏi). Luồng tạo đề: Kiểm tra & chỉnh sửa -> Lưu nháp -> Xuất bản.`,
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
      solutionsReleased: false,
      status: 'draft',
      sourceFileName: fileName,
      sourceFileType: fileType,
      sourcePages: pages,
      questions: parsedQuestions,
    };

    setIsProcessing(false);
    onExtractedExam(draftExam);
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setIsProcessing(true);
    setProgress({ stage: `Đang kiểm tra tệp ${file.name}...`, percent: 10 });

    try {
      const pages = await extractDocumentPages(file, (p) => setProgress(p));
      setProgress({
        stage: 'Đang phân tích cấu trúc câu hỏi (TN / ĐS / TLN), đáp án và lời giải...',
        percent: 90,
      });
      await finalizeExtraction(
        file.name,
        file.type || 'application/octet-stream',
        pages
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Đã xảy ra lỗi khi trích xuất tài liệu.'
      );
      setIsProcessing(false);
    }
  };

  const handleRunRealOcrDemo = async () => {
    setError(null);
    setIsProcessing(true);
    setProgress({
      stage: 'Đang tạo ảnh chụp đề thi mẫu (.png) để chạy Tesseract OCR thực tế...',
      percent: 10,
    });
    try {
      const sampleImgFile = await createRealSampleOcrImageFile();
      const pages = await extractDocumentPages(sampleImgFile, (p) =>
        setProgress(p)
      );
      await finalizeExtraction(
        sampleImgFile.name,
        'image/png',
        pages,
        'Đề Kiểm Tra 15 Phút — Vật Lý & Toán (Trích xuất OCR từ Ảnh)'
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Lỗi khi chạy thử nghiệm OCR.'
      );
      setIsProcessing(false);
    }
  };

  const handleLoadSampleDocWithReviewFlag = async () => {
    setError(null);
    setIsProcessing(true);
    setProgress({
      stage: 'Đang bóc tách đề mẫu có công thức Toán & cờ Cần kiểm tra...',
      percent: 60,
    });
    const pages = getSampleExtractedPagesWithReviewFlag();
    await finalizeExtraction(
      'De_On_Tap_Toan_12_Co_Cau_Can_Kiem_Tra.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pages,
      'Đề Ôn Tập Toán 12 — Minh họa 4 dạng câu hỏi & Cờ Cần Kiểm Tra'
    );
  };

  const handleParsePastedText = async () => {
    if (!pastedText.trim()) {
      setError('Vui lòng dán nội dung văn bản đề thi vào khung bên dưới.');
      return;
    }
    setError(null);
    setIsProcessing(true);
    const pageImage = renderTextSheetToDataUrl(
      examTitleInput || 'Văn bản đề thi dán trực tiếp',
      pastedText.trim(),
      1
    );
    const pages: SourcePageImage[] = [
      {
        pageNumber: 1,
        dataUrl: pageImage,
        extractedText: pastedText.trim(),
        method: extractionEngine === 'gemini_ai' ? 'gemini_ai' : 'native_text',
        confidence: 100,
      },
    ];
    await finalizeExtraction(
      'Van_Ban_De_Thi_Truc_Tiep.txt',
      'text/plain',
      pages,
      examTitleInput.trim() || 'Đề kiểm tra tạo từ văn bản'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Nhập câu hỏi từ Tài liệu (PDF, DOCX, JPG, PNG)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Quy trình chuẩn: Tải tài liệu &rarr; Trích xuất OCR/AI &rarr; Giáo viên kiểm tra &amp; chỉnh sửa &rarr; Lưu nháp &rarr; Xuất bản
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[84vh] overflow-y-auto">
          {/* Metadata inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên bài thi dự kiến
              </label>
              <input
                type="text"
                value={examTitleInput}
                onChange={(e) => setExamTitleInput(e.target.value)}
                placeholder="VD: Sinh Học 11 Cuối Kì 2 TN-DS-TLN"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Môn học
              </label>
              <select
                value={examSubjectInput}
                onChange={(e) => setExamSubjectInput(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="Toán Học">Toán Học</option>
                <option value="Vật Lý">Vật Lý</option>
                <option value="Hóa Học">Hóa Học</option>
                <option value="Sinh Học">Sinh Học</option>
                <option value="Tiếng Anh">Tiếng Anh</option>
                <option value="Ngữ Văn">Ngữ Văn</option>
                <option value="Lịch Sử">Lịch Sử</option>
                <option value="Địa Lý">Địa Lý</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Khối lớp / Kỳ thi
              </label>
              <div className="flex gap-1.5">
                <select
                  value={gradeLevelInput}
                  onChange={(e) => setGradeLevelInput(e.target.value)}
                  className="w-1/2 px-2 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Lớp 10">Lớp 10</option>
                  <option value="Lớp 11">Lớp 11</option>
                  <option value="Lớp 12">Lớp 12</option>
                  <option value="THPT Quốc Gia">THPT QG</option>
                </select>
                <select
                  value={examCategoryInput}
                  onChange={(e) => setExamCategoryInput(e.target.value)}
                  className="w-1/2 px-2 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Giữa HK1">Giữa HK1</option>
                  <option value="Cuối HK1">Cuối HK1</option>
                  <option value="Giữa HK2">Giữa HK2</option>
                  <option value="Cuối HK2">Cuối HK2</option>
                  <option value="Thi Thử THPT">Thi Thử</option>
                  <option value="Khảo Sát">Khảo Sát</option>
                </select>
              </div>
            </div>
          </div>

          {/* Extraction Engine Selector */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-700" />
                <span>Chế độ nhận diện &amp; bóc tách câu hỏi</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Khóa API Gemini (nếu bật) chỉ chạy trên Backend Server, không bao giờ lộ ở trình duyệt.
              </p>
            </div>
            <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setExtractionEngine('ocr_regex')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  extractionEngine === 'ocr_regex'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tesseract OCR + Regex (Miễn phí)
              </button>
              <button
                type="button"
                onClick={() => setExtractionEngine('gemini_ai')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  extractionEngine === 'gemini_ai'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                OCR + AI Gemini (Backend Proxy)
              </button>
            </div>
          </div>

          {/* Mode switcher */}
          <div className="flex items-center gap-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('file')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'file'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Tải tệp tin (PDF, DOCX, JPG, PNG)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'paste'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>Dán văn bản đề thi thô</span>
            </button>
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isProcessing ? (
            <div className="py-12 px-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-4">
              <Loader2 className="w-9 h-9 text-blue-600 animate-spin mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {progress.stage || 'Đang xử lý tài liệu...'}
                </p>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  Tiến độ: {progress.percent}%
                </p>
              </div>
              <div className="w-full max-w-md mx-auto h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${Math.max(8, progress.percent)}%` }}
                />
              </div>
            </div>
          ) : activeTab === 'file' ? (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.files?.[0] || null;
                  handleFileChange(dropped);
                }}
                className="border-2 border-dashed border-slate-300 hover:border-blue-600 bg-slate-50/70 hover:bg-blue-50/30 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.jpg,.jpeg,.png"
                  onChange={(e) =>
                    handleFileChange(e.target.files?.[0] || null)
                  }
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  Nhấn để chọn tệp hoặc kéo thả tài liệu đề thi vào đây
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Hỗ trợ: <span className="font-mono">.pdf</span> (văn bản hoặc bản scan),{' '}
                  <span className="font-mono">.docx</span> (Word),{' '}
                  <span className="font-mono">.jpg / .png</span> (ảnh chụp đề thi)
                </p>
              </div>

              {/* Quick real extraction test buttons */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>
                    Chưa có sẵn file trên máy? Chạy thử nghiệm trích xuất thực tế ngay:
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleLoadSampleDocWithReviewFlag}
                    className="flex items-start gap-3 p-3 bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-lg text-left transition-colors"
                  >
                    <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        1. Thử bóc tách Đề Toán 12 (Đủ TN - ĐS - TLN)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Có công thức LaTeX, câu Đúng/Sai 4 ý và câu khuyết đáp án gắn cờ &ldquo;Cần kiểm tra&rdquo;.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleRunRealOcrDemo}
                    className="flex items-start gap-3 p-3 bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-lg text-left transition-colors"
                  >
                    <ImageIcon className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        2. Chạy Tesseract OCR thật trên Ảnh (.PNG)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Sinh ảnh chụp đề thi và chạy động cơ OCR Tiếng Việt trực tiếp để đối chiếu bản gốc.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="font-semibold text-slate-800">
                  Mẹo định dạng văn bản để máy nhận diện chính xác 100%:
                </p>
                <p>
                  • Bắt đầu mỗi câu bằng <code className="font-mono text-blue-700">Câu 1 (0.25 điểm):</code>. Đánh dấu <code className="font-mono text-emerald-700">*A.</code> trước phương án đúng hoặc để bảng đáp án <code className="font-mono">1.A 2.C</code> ở cuối đề.
                </p>
                <p>
                  • Nếu câu nào không có đáp án trong văn bản, hệ thống sẽ tự động gắn nhãn{' '}
                  <strong className="text-amber-700">Cần kiểm tra</strong> để giáo viên chọn lại trước khi lưu nháp/xuất bản.
                </p>
              </div>
              <textarea
                rows={8}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`Câu 1 (0.25 điểm): Đạo hàm của hàm số $y = x^2 + 3x$ là:\n*A. $y' = 2x + 3$\nB. $y' = x + 3$\nC. $y' = 2x$\nD. $y' = 3$\nLời giải: Áp dụng quy tắc đạo hàm cơ bản.\n\nCâu 2 (0.5 điểm): Nghiệm của phương trình $2x - 6 = 0$ là bao nhiêu?\nĐáp án: 3`}
                className="w-full p-3.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePastedText}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Phân tích &amp; Chuyển sang Bước Kiểm tra</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
