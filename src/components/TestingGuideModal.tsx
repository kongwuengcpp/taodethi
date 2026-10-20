import React from 'react';
import {
  X,
  CheckCircle2,
  FileUp,
  Edit3,
  Clock,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

interface TestingGuideModalProps {
  onClose: () => void;
  onStartUploadDemo: () => void;
  onStartStudentDemo: () => void;
}

export const TestingGuideModal: React.FC<TestingGuideModalProps> = ({
  onClose,
  onStartUploadDemo,
  onStartStudentDemo,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Hướng dẫn kiểm thử từng tính năng của hệ thống MVP
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Quy trình 4 bước để kiểm chứng đầy đủ luồng Giáo viên và Học sinh ngay trên trình duyệt
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-700">
          {/* Step 1 */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FileUp className="w-4 h-4 text-blue-700" />
                Bước 1. Kiểm thử Tải tài liệu, OCR Tiếng Việt & Gắn cờ &ldquo;Cần kiểm tra&rdquo;
              </h3>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartUploadDemo();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap shrink-0"
              >
                Mở trình tải đề ngay
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="text-xs text-slate-600 space-y-1.5 pl-6 list-disc">
              <li>
                Bấm nút <strong>&ldquo;Tải & Bóc tách đề&rdquo;</strong> trên thanh điều hướng. Bạn có thể tải tệp thực tế từ máy tính (<code className="font-mono">.pdf</code>, <code className="font-mono">.docx</code>, <code className="font-mono">.jpg</code>, <code className="font-mono">.png</code>).
              </li>
              <li>
                Hoặc bấm vào 2 nút kiểm thử nhanh: <strong>&ldquo;Thử trích xuất Đề Word (.docx)&rdquo;</strong> và <strong>&ldquo;Thử quét OCR thực tế từ Ảnh chụp đề (.png)&rdquo;</strong>.
              </li>
              <li>
                Trong cả hai tệp mẫu, <strong>Câu 2</strong> hoặc <strong>Câu 3</strong> cố tình không đánh dấu đáp án đúng trong bản gốc — hệ thống sẽ <strong>không tự đoán mò</strong> mà tự động gắn nhãn màu cam <strong>&ldquo;Cần kiểm tra&rdquo;</strong> để giáo viên rà soát.
              </li>
            </ul>
          </div>

          {/* Step 2 */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-700" />
              Bước 2. Kiểm thử Bàn đối chiếu 2 cột, Công thức Toán & Trang Xem trước (Preview)
            </h3>
            <ul className="text-xs text-slate-600 space-y-1.5 pl-6 list-disc">
              <li>
                Sau khi bóc tách, màn hình chia làm 2 cột: <strong>Cột trái</strong> giữ nguyên hình ảnh trang đề gốc (có nút Phóng to / Thu nhỏ), <strong>Cột phải</strong> là danh sách câu hỏi.
              </li>
              <li>
                Bấm nút lọc <strong>&ldquo;Cần kiểm tra&rdquo;</strong> để nhảy ngay đến câu thiếu đáp án, nhấp chọn phương án đúng (ví dụ chọn <strong>B</strong> hoặc <strong>C</strong>), nhãn cảnh báo sẽ tự động chuyển thành <strong>&ldquo;Đã đủ đáp án&rdquo;</strong>.
              </li>
              <li>
                Thử gõ công thức toán trong dấu <code className="font-mono">$...$</code> (ví dụ <code className="font-mono">$\int_0^1 x^2 dx = \frac&#123;1&#125;&#123;3&#125;$</code>) để xem hiển thị KaTeX trực tiếp.
              </li>
              <li>
                Chuyển sang tab <strong>&ldquo;Xem trước đề (Preview)&rdquo;</strong> để kiểm tra bố cục đề thi trước khi bấm <strong>&ldquo;Xuất bản bài thi&rdquo;</strong>.
              </li>
            </ul>
          </div>

          {/* Step 3 */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-700" />
                Bước 3. Kiểm thử Chế độ Học sinh (Làm bài, Đánh dấu xem lại, Tự nộp & Chấm điểm)
              </h3>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartStudentDemo();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg whitespace-nowrap shrink-0"
              >
                Làm thử đề TOAN12
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="text-xs text-slate-600 space-y-1.5 pl-6 list-disc">
              <li>
                Bấm <strong>&ldquo;Làm bài thử (Chế độ Học sinh)&rdquo;</strong> hoặc nhập mã đề <code className="font-mono font-bold">TOAN12</code> ở Cổng vào phòng thi.
              </li>
              <li>
                Nhập Họ và tên, Lớp (ví dụ <code className="font-mono">12A1</code>) để bắt đầu tính giờ.
              </li>
              <li>
                Thử trả lời cả 4 dạng câu hỏi (1 đáp án, nhiều đáp án, Đúng/Sai 4 mệnh đề, trả lời ngắn), bấm <strong>&ldquo;Đánh dấu xem lại&rdquo;</strong> ở một câu bất kỳ và thử tải lại trang (F5) để kiểm chứng tính năng <strong>tự động lưu câu trả lời</strong>.
              </li>
              <li>
                Để kiểm thử <strong>Tự nộp bài khi hết giờ</strong>: bạn có thể dùng nút <strong>&ldquo;Mô phỏng còn 5 giây&rdquo;</strong> ngay trên thanh đồng hồ làm bài thử hoặc đặt thời gian bài thi là 1 phút.
              </li>
            </ul>
          </div>

          {/* Step 4 */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Bước 4. Kiểm thử Phân quyền Backend & Khóa Đáp án / Lời giải
            </h3>
            <ul className="text-xs text-slate-600 space-y-1.5 pl-6 list-disc">
              <li>
                Mở <strong>DevTools (F12 &rarr; Network)</strong> khi học sinh tải đề thi (<code className="font-mono">/api/student/exams/TOAN12/start</code>): bạn sẽ thấy JSON trả về hoàn toàn <strong>không chứa</strong> trường <code className="font-mono">correctAnswers</code> hay <code className="font-mono">explanation</code>.
              </li>
              <li>
                Trong cấu hình bài thi của Giáo viên, nếu chọn <strong>&ldquo;Khóa hoàn toàn cho đến khi Giáo viên bấm Mở khóa đáp án&rdquo;</strong>, sau khi học sinh nộp bài sẽ chỉ thấy điểm số mà chưa thấy đáp án/lời giải cho tới khi Giáo viên bấm nút mở khóa trong bảng Thống kê lượt làm bài.
              </li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            Mã bảo mật chế độ Giáo viên mặc định: <strong className="font-mono text-slate-900">GV2026</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
          >
            Đã hiểu, bắt đầu sử dụng
          </button>
        </div>
      </div>
    </div>
  );
};
