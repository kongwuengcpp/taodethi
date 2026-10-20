import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import type { SourcePageImage } from '../types/exam';

// Configure PDF.js worker using CDN matching installed version or fallback
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface ExtractionProgress {
  stage: string;
  percent: number;
}

/**
 * Renders plain text into a realistic A4 document page image dataUrl
 * so DOCX / text documents also have a visual sheet in the side-by-side comparison pane.
 */
export function renderTextSheetToDataUrl(
  title: string,
  textContent: string,
  pageNumber = 1
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1220;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Paper background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle page border
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  // Header bar
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(title || 'BẢN ĐỐI CHIẾU TÀI LIỆU GỐC', 54, 68);

  ctx.fillStyle = '#64748B';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillText(`Trang ${pageNumber}`, canvas.width - 130, 68);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(54, 84);
  ctx.lineTo(canvas.width - 54, 84);
  ctx.stroke();

  // Body lines with word wrapping
  ctx.fillStyle = '#1E293B';
  ctx.font = '15px "Plus Jakarta Sans", sans-serif';
  const maxWidth = canvas.width - 108;
  const lineHeight = 24;
  let y = 118;

  const paragraphs = textContent.split('\n');
  for (const para of paragraphs) {
    const trimmed = para.trimEnd();
    if (!trimmed) {
      y += 12;
      continue;
    }

    const isHeader = /^(?:Câu|Bài|PHẦN|BẢNG ĐÁP ÁN)\b/i.test(trimmed.trim());
    ctx.font = isHeader
      ? 'bold 15px "Plus Jakarta Sans", sans-serif'
      : '15px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = isHeader ? '#0F172A' : '#334155';

    const words = trimmed.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, 54, y);
        line = words[n] + ' ';
        y += lineHeight;
        if (y > canvas.height - 60) break;
      } else {
        line = testLine;
      }
    }
    if (y <= canvas.height - 60) {
      ctx.fillText(line, 54, y);
      y += lineHeight;
    } else {
      break;
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Runs Tesseract OCR (Vietnamese + English) on an image dataUrl or File
 */
async function runOcrOnImage(
  imageSource: string | File,
  onProgress?: (progress: ExtractionProgress) => void,
  pageLabel = 'trang 1'
): Promise<{ text: string; confidence: number }> {
  onProgress?.({
    stage: `Đang khởi tạo bộ nhận diện OCR Tiếng Việt (${pageLabel})...`,
    percent: 25,
  });

  const worker = await createWorker('vie+eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.({
          stage: `Đang quét OCR văn bản & ký hiệu (${pageLabel}): ${Math.round(
            m.progress * 100
          )}%`,
          percent: Math.min(95, 30 + Math.round(m.progress * 65)),
        });
      }
    },
  });

  try {
    const ret = await worker.recognize(imageSource);
    const text = ret.data.text || '';
    const confidence = typeof ret.data.confidence === 'number' ? ret.data.confidence : 80;
    await worker.terminate();
    return { text, confidence };
  } catch (err) {
    await worker.terminate();
    throw err;
  }
}

/**
 * Reads a File as a Data URL
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Extracts pages from PDF (uses embedded text if available; falls back to OCR for scanned pages)
 */
async function extractFromPdf(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<SourcePageImage[]> {
  onProgress?.({ stage: 'Đang đọc cấu trúc tệp PDF...', percent: 15 });
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = Math.min(pdf.numPages, 12); // Cap at 12 pages for fast browser processing
  const pages: SourcePageImage[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.({
      stage: `Đang xử lý trang PDF ${pageNum}/${numPages}...`,
      percent: Math.round((pageNum / numPages) * 80),
    });

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.75 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    let dataUrl = '';
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      dataUrl = canvas.toDataURL('image/png');
    }

    // Extract native text items sorted by vertical & horizontal position
    const textContent = await page.getTextContent();
    let lastY: number | null = null;
    let extractedLines = '';

    for (const item of textContent.items) {
      if ('str' in item) {
        const transform = item.transform;
        const y = transform ? transform[5] : 0;
        if (lastY !== null && Math.abs(y - lastY) > 6) {
          extractedLines += '\n';
        } else if (lastY !== null) {
          extractedLines += ' ';
        }
        extractedLines += item.str;
        lastY = y;
      }
    }

    const cleanedNative = extractedLines.trim();

    if (cleanedNative.length >= 30) {
      // Native digital PDF text
      pages.push({
        pageNumber: pageNum,
        dataUrl:
          dataUrl || renderTextSheetToDataUrl(file.name, cleanedNative, pageNum),
        extractedText: cleanedNative,
        method: 'native_text',
        confidence: 99,
      });
    } else if (dataUrl) {
      // Scanned PDF page -> Run OCR on rendered page image
      const ocrResult = await runOcrOnImage(
        dataUrl,
        onProgress,
        `PDF scan trang ${pageNum}`
      );
      pages.push({
        pageNumber: pageNum,
        dataUrl,
        extractedText: ocrResult.text,
        method: 'ocr',
        confidence: ocrResult.confidence,
      });
    }
  }

  return pages;
}

/**
 * Extracts text from DOCX file using Mammoth
 */
async function extractFromDocx(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<SourcePageImage[]> {
  onProgress?.({ stage: 'Đang trích xuất văn bản từ tệp Word (.docx)...', percent: 35 });
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const rawText = (result.value || '').trim();

  onProgress?.({ stage: 'Đang tạo bản xem đối chiếu từ tài liệu Word...', percent: 80 });
  const sheetUrl = renderTextSheetToDataUrl(file.name, rawText, 1);

  return [
    {
      pageNumber: 1,
      dataUrl: sheetUrl,
      extractedText: rawText,
      method: 'native_text',
      confidence: 99,
    },
  ];
}

/**
 * Main dispatcher for extracting pages & text from PDF, DOCX, JPG, PNG
 */
export async function extractDocumentPages(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<SourcePageImage[]> {
  const lowerName = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (lowerName.endsWith('.docx') || mime.includes('wordprocessingml')) {
    return extractFromDocx(file, onProgress);
  }

  if (lowerName.endsWith('.pdf') || mime === 'application/pdf') {
    try {
      return await extractFromPdf(file, onProgress);
    } catch (pdfErr) {
      console.warn('PDF worker fallback:', pdfErr);
      throw new Error(
        'Không thể đọc tệp PDF này. Vui lòng kiểm tra định dạng tệp PDF hoặc tải lên ảnh chụp trang đề (JPG/PNG) / tệp Word (.docx).'
      );
    }
  }

  if (
    mime.startsWith('image/') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg')
  ) {
    onProgress?.({ stage: 'Đang nạp ảnh gốc để quét OCR...', percent: 15 });
    const dataUrl = await fileToDataUrl(file);
    const ocrResult = await runOcrOnImage(file, onProgress, 'ảnh đề thi');
    return [
      {
        pageNumber: 1,
        dataUrl,
        extractedText: ocrResult.text,
        method: 'ocr',
        confidence: ocrResult.confidence,
      },
    ];
  }

  throw new Error(
    'Định dạng tệp chưa được hỗ trợ. Vui lòng tải lên tệp PDF, DOCX, JPG hoặc PNG.'
  );
}

/**
 * Generates a real high-contrast PNG File containing a Vietnamese Physics/Math exam page
 * so teachers can test real Tesseract OCR extraction in 1 click without needing an external file!
 */
export async function createRealSampleOcrImageFile(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillText('DE KIEM TRA 15 PHUT - VAT LY & TOAN 12', 70, 80);

  const lines = [
    'Câu 1 (2.5 điểm): Chu kỳ dao động của con lắc đơn có chiều dài l là:',
    '*A. T = 2pi.căn(l/g)',
    'B. T = 1/(2pi).căn(l/g)',
    'C. T = 2pi.căn(g/l)',
    'D. T = căn(l/g)',
    'Lời giải: Công thức chu kỳ dao động điều hòa của con lắc đơn là T = 2pi.căn(l/g).',
    '',
    'Câu 2 (2.5 điểm): Cho hàm số y = 2x + 4. Giao điểm của đồ thị với trục tung có tung độ là:',
    'A. y = 2',
    'B. y = -2',
    '*C. y = 4',
    'D. y = 0',
    'Lời giải: Cho x = 0 suy ra y = 2(0) + 4 = 4.',
    '',
    'Câu 3 (2.5 điểm): Một vật chuyển động đều với vận tốc v = 12 m/s trong thời gian t = 5 s.',
    'A. Quãng đường đi được là 40 m',
    'B. Quãng đường đi được là 50 m',
    'C. Quãng đường đi được là 60 m',
    'D. Quãng đường đi được là 70 m',
    '',
    'Câu 4 (2.5 điểm): Giải phương trình 3x - 9 = 0. Điền kết quả x:',
    'Đáp án: 3',
    'Lời giải: Ta có 3x = 9 suy ra x = 3.',
  ];

  let y = 150;
  for (const line of lines) {
    if (!line) {
      y += 28;
      continue;
    }
    ctx.font = line.startsWith('Câu')
      ? 'bold 25px Arial, sans-serif'
      : '24px Arial, sans-serif';
    ctx.fillText(line, 70, y);
    y += 46;
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const file = new File([blob!], 'Anh_Chup_De_Thi_Mau_OCR.png', {
        type: 'image/png',
      });
      resolve(file);
    }, 'image/png');
  });
}

/**
 * Generates a realistic multi-question Vietnamese exam document (native text)
 * including 1 question intentionally missing an answer so teachers see how "Cần kiểm tra" works!
 */
export function getSampleExtractedPagesWithReviewFlag(): SourcePageImage[] {
  const sampleText = `PHẦN I. TRẮC NGHIỆM KHÁCH QUAN & TOÁN HỌC
Câu 1 (2.0 điểm): Tập nghiệm của bất phương trình $2^x > 8$ là:
A. $(3; +\\infty)$
B. $(-\\infty; 3)$
C. $[3; +\\infty)$
D. $(2; +\\infty)$
Đáp án: A
Lời giải: Ta có $2^x > 8 \\iff 2^x > 2^3 \\iff x > 3$.

Câu 2 (2.0 điểm): Cho hình trụ có bán kính đáy $r = 3$ và độ dài đường sinh $l = 4$. Diện tích xung quanh của hình trụ này bằng:
A. $12\\pi$
B. $24\\pi$
C. $36\\pi$
D. $6\\pi$
Lời giải: Áp dụng công thức diện tích xung quanh hình trụ $S_{xq} = 2\\pi r l = 2\\pi \\cdot 3 \\cdot 4 = 24\\pi$. (Lưu ý: Câu này trong đề gốc chưa gạch chân đáp án để minh họa tính năng đánh dấu Cần kiểm tra).

Câu 3 (2.0 điểm): (Chọn nhiều đáp án) Những số nào sau đây là nghiệm của phương trình $x^2 - 5x + 6 = 0$?
*A. $x = 2$
B. $x = 1$
*C. $x = 3$
D. $x = 6$
Lời giải: Phương trình $x^2 - 5x + 6 = (x - 2)(x - 3) = 0$ có hai nghiệm $x = 2$ và $x = 3$.

Câu 4 (2.0 điểm): Xét tính Đúng/Sai của các mệnh đề sau về đạo hàm:
a) Đạo hàm của hàm số $y = x^4$ là $y' = 4x^3$. [Đúng]
b) Đạo hàm của hàm số $y = \\sin x$ là $y' = -\\cos x$. [Sai]
c) Đạo hàm của hằng số $C$ bằng $0$. [Đúng]
d) Tiếp tuyến của đồ thị $y = x^2$ tại $x_0 = 1$ có hệ số góc bằng $2$. [Đúng]
Lời giải: $(\\sin x)' = \\cos x$ nên mệnh đề b sai; các mệnh đề a, c, d đều đúng.

Câu 5 (2.0 điểm): Cho cấp số cộng $(u_n)$ có $u_1 = 3$ và công sai $d = 4$. Tính số hạng thứ 5 ($u_5$) của cấp số cộng:
Đáp án: 19
Lời giải: Áp dụng công thức $u_5 = u_1 + 4d = 3 + 4 \\times 4 = 19$.`;

  return [
    {
      pageNumber: 1,
      dataUrl: renderTextSheetToDataUrl(
        'De_On_Tap_Toan_12_Co_Cau_Can_Kiem_Tra.docx',
        sampleText,
        1
      ),
      extractedText: sampleText,
      method: 'native_text',
      confidence: 99,
    },
  ];
}
