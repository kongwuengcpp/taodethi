# Khảo Thí Số — Hệ Thống Tạo Bài Thi Online Từ Tài Liệu (MVP)

Xây dựng nền tảng web hỗ trợ giáo viên Việt Nam tải lên đề thi từ file tài liệu hoặc ảnh chụp (PDF, DOCX, JPG, PNG), tự động trích xuất văn bản & OCR tiếng Việt để bóc tách câu hỏi, đối chiếu trực tiếp với tài liệu gốc, xuất bản bài thi qua đường link và chấm điểm tự động an toàn tại máy chủ.

## User Review & Critical Decisions

> [!IMPORTANT]
> Dưới đây là các quyết định kiến trúc cốt lõi đã được xác nhận từ câu trả lời của bạn để đảm bảo hệ thống chạy ổn định, miễn phí 100% và không phát sinh chi phí ngầm:

- **Lưu trữ & Phân quyền (Đã xác nhận)**: Sử dụng Backend Express kết hợp cơ sở dữ liệu cục bộ bền vững trên máy chủ. Quyền Giáo viên được bảo vệ bằng mã phiên quản trị (`Teacher Access Token / PIN`) kiểm tra trực tiếp ở tầng API backend; học sinh không thể đọc đáp án hoặc can thiệp điểm số qua trình duyệt.
- **Công nghệ OCR & Trích xuất Đề (Đã xác nhận)**: Sử dụng 100% thư viện mã nguồn mở miễn phí (trình đọc cấu trúc DOCX/PDF văn bản, kết hợp **Tesseract OCR** hỗ trợ gói ngôn ngữ Tiếng Việt + Tiếng Anh và bộ phân tích cú pháp biểu thức chính quy thông minh cho cấu trúc đề thi Việt Nam). Hoàn toàn không gọi API trả phí và không lộ bất kỳ khóa bí mật nào.
- **Truy cập Học sinh (Đã xác nhận)**: Học sinh truy cập trực tiếp qua đường link bài thi (hoặc nhập Mã đề), điền **Họ và tên, Lớp, Mã số học sinh** (kèm Mã ca thi nếu giáo viên đặt mật khẩu) để vào làm bài ngay mà không cần tạo tài khoản phức tạp.
- **Chính sách Trung thực về Bảo mật Thi**: Hệ thống thực thi kiểm soát thời gian, tự động thu bài khi hết giờ và chấm điểm hoàn toàn ở phía máy chủ (Server-side Grading), đồng thời ghi nhận số lần chuyển tab để giáo viên tham khảo, nhưng **không tuyên bố chống gian lận tuyệt đối** trên môi trường trình duyệt web.

---

## 1. Overview & Core Concept

- **Chức năng cốt lõi**: Chuyển đổi nhanh các tệp đề thi sẵn có của giáo viên (file Word `.docx`, `.pdf` văn bản, `.pdf` scan hoặc ảnh chụp đề thi `.jpg/.png`) thành bài kiểm tra trực tuyến có tính giờ, tự động chấm điểm và thống kê kết quả.
- **Đối tượng sử dụng**:
  - **Giáo viên Việt Nam**: Cần công cụ số hóa đề thi toán, lý, hóa, anh, sử, địa... nhanh chóng, giữ nguyên thứ tự câu hỏi, hỗ trợ công thức toán học cơ bản và đối chiếu trực tiếp với ảnh/tài liệu gốc để chỉnh sửa các chỗ OCR chưa rõ.
  - **Học sinh**: Làm bài thi mượt mà trên cả điện thoại di động và máy tính với giao diện rõ ràng, dễ thao tác chuyển câu, đánh dấu câu phân vân và tự động lưu câu trả lời.
- **Giá trị mang lại**: Tiết kiệm 80% thời gian nhập liệu thủ công; đánh dấu rõ các câu cần giáo viên kiểm tra lại thay vì tự đoán đáp án; bảo mật đáp án trên server cho đến đúng thời điểm giáo viên cho phép xem lời giải.

---

## 2. User Experience & Visual Design

### Luồng trải nghiệm người dùng (Key User Flows)

1. **Giáo viên — Tải tài liệu & Bóc tách câu hỏi**:
   - Giáo viên đăng nhập chế độ Quản lý đề thi, chọn tải lên tệp `PDF`, `DOCX`, `JPG`, hoặc `PNG` (hoặc dùng tệp đề mẫu có sẵn để thử nghiệm nhanh).
   - Hệ thống kiểm tra loại tệp: nếu là DOCX hoặc PDF có lớp văn bản thì trích xuất trực tiếp; nếu là PDF scan hoặc ảnh chụp thì kích hoạt OCR Tiếng Việt để nhận diện chữ và ký hiệu toán học.
   - Bộ phân tích tự động tách theo thứ tự: Nội dung câu hỏi (`Câu 1:`, `Bài 1:`...), các phương án `A. / B. / C. / D.`, loại câu hỏi, điểm số, đáp án đúng và lời giải chi tiết (`Lời giải:` / `Hướng dẫn:`). Các câu không tìm thấy đáp án rõ ràng hoặc độ tin cậy OCR thấp sẽ được gắn nhãn **`Cần kiểm tra`**.
2. **Giáo viên — Đối chiếu bản gốc & Chỉnh sửa đề (Two-Zone Split View)**:
   - Giao diện chia 2 cột song song: **Cột trái** hiển thị hình ảnh trang đề gốc / văn bản gốc (có phóng to, thu nhỏ, chuyển trang); **Cột phải** là danh sách câu hỏi đã bóc tách.
   - Giáo viên có thể sửa toàn bộ nội dung câu hỏi (hỗ trợ hiển thị công thức toán LaTeX dạng `$...$`), đổi loại câu hỏi (*Trắc nghiệm 1 đáp án, Nhiều đáp án, Đúng/Sai, Trả lời ngắn*), cập nhật đáp án đúng, lời giải, điểm từng câu hoặc thêm/xóa câu hỏi.
3. **Giáo viên — Cấu hình, Xem trước & Xuất bản bài thi**:
   - Đặt tên bài thi, thời gian làm bài (phút), thang điểm quy đổi (ví dụ thang 10 hoặc 100), thời gian mở đề – đóng đề, mã ca thi (tùy chọn) và chế độ công bố đáp án (*Cho xem ngay sau khi nộp*, *Chỉ hiện sau khi đóng đề*, hoặc *Chỉ hiện khi giáo viên mở khóa*).
   - Chuyển sang **Trang xem trước (Preview)** để kiểm tra giao diện hiển thị thực tế và làm thử như học sinh trước khi bấm **Xuất bản** và lấy đường link chia sẻ.
4. **Học sinh — Vào phòng thi & Làm bài**:
   - Học sinh mở đường link bài thi, nhập Họ tên, Lớp, Mã học sinh (và mã ca thi nếu có).
   - Giao diện làm bài hiển thị đồng hồ đếm ngược đồng bộ với thời gian máy chủ, bảng danh sách câu hỏi (đã làm, chưa làm, đánh dấu xem lại), nút chuyển câu và hỗ trợ công thức toán rõ nét.
   - Tiến trình chọn đáp án được tự động lưu nháp liên tục. Khi hết giờ, hệ thống tự động khóa bài và nộp lên máy chủ.
5. **Chấm điểm & Quản lý kết quả**:
   - Máy chủ tự động chấm các câu hỏi có đáp án xác định (1 đáp án, nhiều đáp án, đúng/sai, trả lời ngắn khớp chuỗi chuẩn hóa).
   - Học sinh nhận điểm số ngay (hoặc theo cấu hình) và chỉ thấy đáp án đúng kèm lời giải khi thời gian/cấu hình của giáo viên cho phép.
   - Giáo viên xem bảng thống kê lượt làm bài, điểm số từng học sinh, chi tiết từng câu trả lời và trạng thái bài làm.

### Visual Identity & Theme

- **Phong cách thẩm mỹ (Aesthetic Direction)**: *Editorial Academic & Precision Workspace* — Tinh gọn, chuẩn mực sư phạm, độ tương phản cao giúp đọc đề thi và công thức toán học trong thời gian dài không mỏi mắt.
- **Bảng màu (60-30-10 Color Discipline)**:
  - **60% Nền chủ đạo (`--background`)**: Trắng giấy học thuật dịu mắt (`#F8FAFC`) kết hợp vùng nội dung trắng tinh khiết (`#FFFFFF`).
  - **30% Bề mặt cấu trúc (`--surface` / Borders)**: Viền mảnh `1px solid #E2E8F0`, chữ chính màu mực đậm (`#0F172A`), chữ phụ màu xám đá (`#475569`).
  - **10% Điểm nhấn ngữ nghĩa (`--primary` & Semantic States)**:
    - Xanh chàm học thuật (`#1D4ED8` / `blue-700`) cho các nút hành động chính và trạng thái đang chọn.
    - Vàng hổ phách (`#D97706` / `amber-600`) kèm biểu tượng cảnh báo cho câu hỏi **`Cần kiểm tra`** (giáo viên) hoặc câu **`Đánh dấu xem lại`** (học sinh).
    - Xanh lục (`#15803D` / `emerald-700`) và Đỏ thẫm (`#B91C1C` / `red-700`) luôn đi kèm nhãn văn bản rõ ràng (`Đúng` / `Sai` / `Đã nộp`).
- **Typography & Hierarchy (Quy tắc 2+1 Font)**:
  - **Tiêu đề & Điều hướng**: `Plus Jakarta Sans` (SemiBold/Bold, rõ ràng, hỗ trợ tiếng Việt hoàn hảo).
  - **Nội dung câu hỏi & Lời giải**: `Plus Jakarta Sans` / `Public Sans` ở cỡ chữ `15px–16px`, chiều cao dòng `1.6` dễ đọc trên cả điện thoại và máy tính, tích hợp bộ hiển thị công thức toán học (KaTeX).
  - **Số liệu, Đồng hồ đếm ngược & Điểm số**: `JetBrains Mono` với `tabular-nums` để đồng hồ đếm ngược và bảng điểm thẳng hàng tuyệt đối, không bị giật khung hình mỗi giây.

---

## 3. Key Product Decisions & Trade-Offs

- **Quyết định 1: Kết hợp trích xuất văn bản gốc (Native Text) và OCR (Tesseract) kèm đối chiếu song song**
  - *Cách tiếp cận*: Tự động đọc văn bản trực tiếp từ `.docx` và `.pdf` kỹ thuật số; tự động chuyển trang `.pdf` scan hoặc ảnh `.jpg/.png` qua bộ nhận diện OCR tiếng Việt, đồng thời giữ nguyên khung xem ảnh/tài liệu gốc bên cạnh trình sửa câu hỏi.
  - *Lý do*: Đảm bảo tốc độ tức thì với file Word/PDF thường, vẫn đọc được ảnh chụp đề thi miễn phí 100%, và giúp giáo viên dễ dàng kiểm chứng những câu hệ thống gắn cờ `Cần kiểm tra`.
- **Quyết định 2: Bảo mật đáp án và chấm điểm hoàn toàn tại Backend Express**
  - *Cách tiếp cận*: Khi học sinh tải đề thi qua API `/api/student/exams/:code`, backend tự động lọc bỏ trường `correctAnswer` và `explanation` khỏi dữ liệu trả về. Chỉ sau khi học sinh nộp bài và thỏa mãn điều kiện công bố đáp án của giáo viên, backend mới trả về đáp án đúng và lời giải.
  - *Lý do*: Ngăn chặn hoàn toàn việc học sinh mở F12 (DevTools / Network tab) để xem trước đáp án hoặc tự sửa điểm số gửi lên server.
- **Quyết định 3: Hỗ trợ đầy đủ 4 dạng câu hỏi theo cấu trúc thi mới tại Việt Nam**
  - *Cách tiếp cận*: Hỗ trợ Trắc nghiệm 1 lựa chọn (`single_choice`), Trắc nghiệm nhiều lựa chọn (`multiple_choice`), Câu hỏi Đúng/Sai (`true_false`), và Câu trả lời ngắn điền đáp số (`short_answer`).
  - *Lý do*: Phù hợp thực tế kiểm tra đánh giá hiện hành tại các trường phổ thông và đại học ở Việt Nam.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19 + Tailwind)                        │
├──────────────────────────────────────┬───────────────────────────────────────┤
│        KHÔNG GIAN GIÁO VIÊN          │         KHÔNG GIAN HỌC SINH           │
│                                      │                                       │
│  ┌────────────────────────────────┐  │  ┌─────────────────────────────────┐  │
│  │ 1. Trình Tải & Bóc Tách Đề     │  │  │ 1. Cổng Vào Phòng Thi           │  │
│  │  - Tải PDF / DOCX / JPG / PNG  │  │  │  - Nhập Họ tên, Lớp, Mã HS      │  │
│  │  - Trích xuất chữ + OCR Việt   │  │  │  - Kiểm tra giờ mở/đóng đề      │  │
│  └───────────────┬────────────────┘  │  └────────────────┬────────────────┘  │
│                  ▼                   │                   ▼                   │
│  ┌────────────────────────────────┐  │  ┌─────────────────────────────────┐  │
│  │ 2. Bàn Đối Chiếu & Biên Tập    │  │  │ 2. Giao Diện Làm Bài (Exam UI)  │  │
│  │  [Khung Gốc] <─> [Trình Sửa]   │  │  │  - Đồng hồ đếm ngược chuẩn      │  │
│  │  - Lọc câu "Cần kiểm tra"      │  │  │  - Chuyển câu & Đánh dấu xem lại│  │
│  │  - Render Toán học (KaTeX)     │  │  │  - Tự lưu nháp & Tự nộp hết giờ │  │
│  └───────────────┬────────────────┘  │  └────────────────┬────────────────┘  │
│                  ▼                   │                   ▼                   │
│  ┌────────────────────────────────┐  │  ┌─────────────────────────────────┐  │
│  │ 3. Cấu Hình, Xem Trước & KQ    │  │  │ 3. Trang Kết Quả & Giải Chi Tiết│  │
│  │  - Xem trước (Preview Mode)    │  │  │  - Hiển thị điểm số             │  │
│  │  - Tạo Link thi & Thống kê điểm│  │  │  - Xem lời giải khi được phép   │  │
│  └───────────────┬────────────────┘  │  └────────────────┬────────────────┘  │
└──────────────────┼───────────────────┴───────────────────┼───────────────────┘
                   │ Header: X-Teacher-Token               │ Public Exam Token
                   ▼                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     BACKEND SERVER (Express + TypeScript)                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  • Middleware Phân Quyền: Kiểm tra X-Teacher-Token cho mọi API quản trị      │
│  • Bộ Lọc Bảo Mật Đề Thi: Xóa sạch đáp án & lời giải khi trả đề cho học sinh│
│  • Động Cơ Chấm Điểm (Grading Engine): Tính điểm tại server, kiểm tra hạn nộp│
│  • Lưu Trữ Bền Vững: Cơ sở dữ liệu cục bộ lưu Đề thi, Câu hỏi, File gốc, Bài │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Bài thi (`Exam`)**:
  - Mã định danh (`id`), Mã truy cập ngắn (`shareCode`), Tiêu đề, Mô tả, Thời lượng làm bài (`durationMinutes`), Thang điểm (`totalScale`: 10 hoặc 100), Thời gian mở đề (`openAt`), Thời gian đóng đề (`closeAt`), Mật khẩu ca thi tùy chọn (`accessCode`), Chính sách xem đáp án (`showSolutionPolicy`: `'after_submit' | 'after_close' | 'manual_release'`), Trạng thái xuất bản (`status`: `'draft' | 'published'`), Danh sách tệp/ảnh gốc đính kèm (`sourceFiles`).
- **Câu hỏi (`Question`)**:
  - Thứ tự (`orderIndex`), Loại câu hỏi (`single_choice` | `multiple_choice` | `true_false` | `short_answer`), Nội dung đề (`prompt` — hỗ trợ công thức toán `$...$`), Các phương án lựa chọn (`options`: A, B, C, D...), Đáp án chuẩn (`correctAnswers`), Điểm số (`points`), Lời giải (`explanation`), Cờ đánh dấu (`needsReview`: `true` nếu chưa rõ đáp án hoặc cần giáo viên rà soát lại).
- **Lượt làm bài của Học sinh (`Submission`)**:
  - Mã lượt thi (`id`), Mã bài thi (`examId`), Thông tin học sinh (`studentName`, `studentClass`, `studentCode`), Thời điểm bắt đầu (`startedAt`), Hạn chót phải nộp (`deadlineAt`), Thời điểm nộp (`submittedAt`), Câu trả lời đã lưu (`answers`), Danh sách câu đánh dấu xem lại (`flaggedQuestions`), Điểm số đạt được (`score`), Số lần rời màn hình (`tabSwitchCount`), Trạng thái (`in_progress` | `submitted`).

### Interactive Component & State Mapping

- **Trình tải lên & Bóc tách đề**: Nhận file `.pdf`, `.docx`, `.jpg`, `.png` (kèm bộ sinh đề mẫu thực tế dạng file ảnh/văn bản để giáo viên có thể bấm kiểm thử ngay trong 1 cú nhấp chuột), hiển thị thanh tiến trình đọc văn bản / nhận diện OCR tiếng Việt và chuyển sang màn hình đối chiếu.
- **Bàn đối chiếu 2 cột (Split-View Editor)**:
  - Cột trái giữ nguyên ảnh gốc hoặc trang tài liệu vừa tải lên để giáo viên phóng to/thu nhỏ đối chiếu.
  - Cột phải cho phép lọc nhanh các câu có nhãn `Cần kiểm tra`, sửa trực tiếp nội dung câu hỏi, phương án, chọn đáp án đúng và gõ công thức toán học có xem trước trực tiếp.
- **Chế độ Xem trước (Teacher Preview)**: Mô phỏng chính xác màn hình làm bài của học sinh ngay trong không gian giáo viên trước khi xuất bản.
- **Phòng thi Học sinh (Student Exam Runner)**:
  - Đồng bộ thời gian với server khi bắt đầu làm bài; lưu nháp tự động vào cả `localStorage` và máy chủ; tự động gọi API nộp bài ngay khi đồng hồ chạm `00:00`.
  - Sau khi nộp bài, tự động đối chiếu chính sách `showSolutionPolicy` và `closeAt` trên server để quyết định chỉ hiển thị điểm hay hiển thị toàn bộ đáp án đúng và lời giải chi tiết.
