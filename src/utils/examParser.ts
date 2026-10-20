import type {
  Question,
  QuestionOption,
  TrueFalseStatement,
  QuestionType,
  SourcePageImage,
} from '../types/exam';

interface ParsedBlock {
  orderIndex: number;
  rawHeader: string;
  bodyText: string;
  sourcePage: number;
  ocrConfidence?: number;
}

/**
 * Extracts global answer key dictionary from end-of-document tables like:
 * "BẢNG ĐÁP ÁN: 1A 2C 3A,C 4B 5: 12.5" or "1.A  2.B  3.C  4.D"
 */
function extractGlobalAnswerKey(fullText: string): Record<number, string> {
  const answerMap: Record<number, string> = {};
  const answerSectionRegex =
    /(?:BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+TỔNG\s+HỢP|PHẦN\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s*[:\n])([\s\S]*)$/i;
  const match = fullText.match(answerSectionRegex);
  if (!match) return answerMap;

  const tail = match[1];
  // Match patterns like "Câu 1: A", "1. A", "1A", "3A-C", "5: 6"
  const pairRegex =
    /(?:Câu\s*)?(\d{1,3})\s*(?:[:.\-]\s*|\s+)([A-D](?:\s*[-,]\s*[A-D])*|\d+(?:[.,]\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = pairRegex.exec(tail)) !== null) {
    const qNum = parseInt(m[1], 10);
    const val = m[2].trim();
    if (!isNaN(qNum) && val) {
      answerMap[qNum] = val;
    }
  }
  return answerMap;
}

/**
 * Parses a single question text block into structured Question
 */
function parseSingleQuestionBlock(
  block: ParsedBlock,
  globalAnswerKey: Record<number, string>
): Question {
  const { orderIndex, bodyText, sourcePage, ocrConfidence } = block;
  let workingText = bodyText.trim();

  // 1. Extract points if specified in header or start of prompt: e.g. "(2.5 điểm)", "(0,5đ)", "[1 điểm]"
  let points = 1;
  const pointsRegex = /^\s*[(\[]\s*(\d+(?:[.,]\d+)?)\s*(?:điểm|đ)\s*[)\]]\s*[:.\-]?\s*/i;
  const pointsMatch = workingText.match(pointsRegex);
  if (pointsMatch) {
    points = parseFloat(pointsMatch[1].replace(',', '.')) || 1;
    workingText = workingText.slice(pointsMatch[0].length).trim();
  } else {
    const headerPointsMatch = block.rawHeader.match(
      /[(\[]\s*(\d+(?:[.,]\d+)?)\s*(?:điểm|đ)\s*[)\]]/i
    );
    if (headerPointsMatch) {
      points = parseFloat(headerPointsMatch[1].replace(',', '.')) || 1;
    }
  }

  // 2. Extract Explanation ("Lời giải:", "Hướng dẫn giải:", "Hướng dẫn:", "Giải:")
  let explanation = '';
  const explanationRegex =
    /(?:^|\n)\s*(?:Lời\s*giải|Hướng\s*dẫn(?:\s*giải)?|Giải\s*chi\s*tiết)\s*[:.\-]\s*([\s\S]*)$/i;
  const expMatch = workingText.match(explanationRegex);
  if (expMatch && expMatch.index !== undefined) {
    explanation = expMatch[1].trim();
    workingText = workingText.slice(0, expMatch.index).trim();
  }

  // 3. Extract explicit inline "Đáp án: ..." line if present
  let explicitAnswerRaw = '';
  const explicitAnsRegex =
    /(?:^|\n)\s*(?:Đáp\s*án(?:\s*đúng)?|Đáp\s*số|Kết\s*quả)\s*[:.\-]\s*([^\n]+)$/i;
  const ansMatch = workingText.match(explicitAnsRegex);
  if (ansMatch && ansMatch.index !== undefined) {
    explicitAnswerRaw = ansMatch[1].trim();
    workingText = workingText.slice(0, ansMatch.index).trim();
  }

  // Check if global answer key has an entry for this question number
  if (!explicitAnswerRaw && globalAnswerKey[orderIndex]) {
    explicitAnswerRaw = globalAnswerKey[orderIndex];
  }

  // 4. Detect True/False 4-statement format: a) ... b) ... c) ... d) ...
  const statementRegex = /(?:^|\n)\s*([a-d])\)\s+([^\n]+)/gi;
  const statementMatches = [...workingText.matchAll(statementRegex)];

  if (statementMatches.length >= 2) {
    const firstIdx = statementMatches[0].index ?? workingText.length;
    const prompt = workingText.slice(0, firstIdx).trim();
    const statements: TrueFalseStatement[] = [];
    const correctAnswers: string[] = [];
    let allStatementsHaveTruth = true;

    for (const sm of statementMatches) {
      const id = sm[1].toLowerCase();
      let stText = sm[2].trim();
      let isTrue: boolean | undefined = undefined;

      // Check inline [Đúng], (Đúng), [Đ], [Sai], (Sai), [S]
      const truthTagMatch = stText.match(
        /\s*[(\[]\s*(Đúng|Sai|Đ|S|True|False)\s*[)\]]\s*$/i
      );
      if (truthTagMatch) {
        const tag = truthTagMatch[1].toLowerCase();
        isTrue = tag === 'đúng' || tag === 'đ' || tag === 'true';
        stText = stText.slice(0, truthTagMatch.index).trim();
      } else if ( stText.startsWith('*') ) {
        isTrue = true;
        stText = stText.slice(1).trim();
      }

      if (typeof isTrue === 'boolean') {
        correctAnswers.push(`${id}:${isTrue}`);
      } else {
        allStatementsHaveTruth = false;
      }

      statements.push({
        id,
        label: `${id})`,
        text: stText,
        isTrue,
      });
    }

    const lowOcr = typeof ocrConfidence === 'number' && ocrConfidence < 75;
    const needsReview = !allStatementsHaveTruth || lowOcr || !prompt;
    const reviewReasons: string[] = [];
    if (!allStatementsHaveTruth) {
      reviewReasons.push('Một số mệnh đề Đúng/Sai chưa có đáp án xác định');
    }
    if (lowOcr) {
      reviewReasons.push(`Độ tin cậy OCR thấp (${Math.round(ocrConfidence!)}%)`);
    }

    return {
      id: `q-${Date.now()}-${orderIndex}-${Math.random().toString(36).slice(2, 6)}`,
      orderIndex,
      type: 'true_false',
      prompt: prompt || `Câu hỏi Đúng/Sai số ${orderIndex}`,
      options: [],
      statements,
      correctAnswers,
      points,
      explanation,
      needsReview,
      reviewReason: reviewReasons.join(' · ') || undefined,
      sourcePage,
      ocrConfidence,
    };
  }

  // 5. Detect Multiple Choice Options A. B. C. D. (supports both multi-line and inline options)
  // Normalize inline options like "  A. ...   B. ...   C. ...   D. ..." into newline-prefixed markers
  const normalizedForOptions = workingText.replace(
    /(?:^|\n|\s{2,}|\t+)(\*?[A-D])\s*[.:)]\s+/g,
    '\n@@OPT@@$1. '
  );

  const optParts = normalizedForOptions.split('\n@@OPT@@');
  if (optParts.length >= 3) {
    const promptRaw = optParts[0].trim();
    const options: QuestionOption[] = [];
    const starredAnswers: string[] = [];

    for (let i = 1; i < optParts.length; i++) {
      const seg = optParts[i].trim();
      const m = seg.match(/^(\*?)([A-D])\.\s*([\s\S]*)$/);
      if (m) {
        const isStarred = m[1] === '*';
        const letter = m[2].toUpperCase();
        let optText = m[3].trim();

        // Also check if option ends with [Đúng] or (Đáp án đúng)
        if (/\s*[(\[]\s*(?:Đúng|Đáp án)\s*[)\]]\s*$/i.test(optText)) {
          optText = optText
            .replace(/\s*[(\[]\s*(?:Đúng|Đáp án)\s*[)\]]\s*$/i, '')
            .trim();
          starredAnswers.push(letter);
        } else if (isStarred) {
          starredAnswers.push(letter);
        }

        options.push({
          id: letter,
          label: letter,
          text: optText,
        });
      }
    }

    // Parse explicitAnswerRaw if starredAnswers is empty
    const finalCorrect = [...starredAnswers];
    if (finalCorrect.length === 0 && explicitAnswerRaw) {
      const letters = explicitAnswerRaw
        .toUpperCase()
        .match(/\b[A-D]\b/g);
      if (letters) {
        for (const l of letters) {
          if (!finalCorrect.includes(l)) finalCorrect.push(l);
        }
      }
    }

    const isMulti =
      finalCorrect.length > 1 ||
      /chọn\s+nhiều|nhiều\s+đáp\s+án|tất\s+cả\s+các\s+đáp\s+án/i.test(promptRaw);
    const type: QuestionType = isMulti ? 'multiple_choice' : 'single_choice';

    const lowOcr = typeof ocrConfidence === 'number' && ocrConfidence < 75;
    const missingAns = finalCorrect.length === 0;
    const incompleteOpts = options.length < 4;
    const needsReview = missingAns || lowOcr || incompleteOpts;

    const reviewReasons: string[] = [];
    if (missingAns) {
      reviewReasons.push('Chưa tìm thấy đáp án đúng — cần giáo viên chọn đáp án');
    }
    if (incompleteOpts) {
      reviewReasons.push(`Chỉ nhận diện được ${options.length} phương án lựa chọn`);
    }
    if (lowOcr) {
      reviewReasons.push(`Độ tin cậy OCR thấp (${Math.round(ocrConfidence!)}%)`);
    }

    return {
      id: `q-${Date.now()}-${orderIndex}-${Math.random().toString(36).slice(2, 6)}`,
      orderIndex,
      type,
      prompt: promptRaw,
      options,
      correctAnswers: finalCorrect,
      points,
      explanation,
      needsReview,
      reviewReason: reviewReasons.join(' · ') || undefined,
      sourcePage,
      ocrConfidence,
    };
  }

  // 6. Otherwise treat as Short Answer (Câu trả lời ngắn / Tự luận điền đáp số)
  const shortCorrect: string[] = [];
  if (explicitAnswerRaw) {
    shortCorrect.push(explicitAnswerRaw);
  }

  const lowOcr = typeof ocrConfidence === 'number' && ocrConfidence < 75;
  const missingAns = shortCorrect.length === 0;
  const needsReview = missingAns || lowOcr;
  const reviewReasons: string[] = [];
  if (missingAns) {
    reviewReasons.push('Câu trả lời ngắn chưa có đáp số chuẩn — cần giáo viên bổ sung');
  }
  if (lowOcr) {
    reviewReasons.push(`Độ tin cậy OCR thấp (${Math.round(ocrConfidence!)}%)`);
  }

  return {
    id: `q-${Date.now()}-${orderIndex}-${Math.random().toString(36).slice(2, 6)}`,
    orderIndex,
    type: 'short_answer',
    prompt: workingText,
    options: [],
    correctAnswers: shortCorrect,
    points,
    explanation,
    needsReview,
    reviewReason: reviewReasons.join(' · ') || undefined,
    sourcePage,
    ocrConfidence,
  };
}

/**
 * Main entry point to parse extracted document pages into structured Questions
 */
export function parseExamFromPages(pages: SourcePageImage[]): Question[] {
  const fullCombinedText = pages.map((p) => p.extractedText).join('\n\n');
  const globalAnswerKey = extractGlobalAnswerKey(fullCombinedText);

  const blocks: ParsedBlock[] = [];
  let runningOrder = 1;

  for (const page of pages) {
    // Strip the global answer key table from the bottom of the page text so it isn't parsed as part of the last question
    const cleanedPageText = page.extractedText
      .replace(
        /(?:^|\n)\s*(?:BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+TỔNG\s+HỢP|PHẦN\s+ĐÁP\s+ÁN)[\s\S]*$/i,
        ''
      )
      // Also strip Section headers like "PHẦN I. Trắc nghiệm..."
      .replace(/(?:^|\n)\s*PHẦN\s+[I1V234X]+\s*[.:-][^\n]*/gi, '\n');

    // Match question starts: "Câu 1:", "Câu 1 (2 điểm):", "Bài 1:", "Question 1."
    const qHeaderRegex =
      /(?:^|\n)\s*((?:Câu|Bài|Question)\s+\d{1,3}(?:\s*[(\[]\s*\d+(?:[.,]\d+)?\s*(?:điểm|đ)\s*[)\]])?\s*[:.\-]?)/gi;

    const matches = [...cleanedPageText.matchAll(qHeaderRegex)];

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const headerStr = currentMatch[1].trim();
        const startPos = (currentMatch.index ?? 0) + currentMatch[0].length;
        const endPos =
          i + 1 < matches.length
            ? matches[i + 1].index ?? cleanedPageText.length
            : cleanedPageText.length;

        const body = cleanedPageText.slice(startPos, endPos).trim();
        if (body) {
          blocks.push({
            orderIndex: runningOrder++,
            rawHeader: headerStr,
            bodyText: body,
            sourcePage: page.pageNumber,
            ocrConfidence: page.confidence,
          });
        }
      }
    } else if (cleanedPageText.trim().length > 15) {
      // Fallback: Try numbered questions "1. ", "2. " at start of line
      const numHeaderRegex = /(?:^|\n)\s*(\d{1,2}\s*[.)])\s+/g;
      const numMatches = [...cleanedPageText.matchAll(numHeaderRegex)];
      if (numMatches.length >= 2) {
        for (let i = 0; i < numMatches.length; i++) {
          const currentMatch = numMatches[i];
          const headerStr = currentMatch[1].trim();
          const startPos = (currentMatch.index ?? 0) + currentMatch[0].length;
          const endPos =
            i + 1 < numMatches.length
              ? numMatches[i + 1].index ?? cleanedPageText.length
              : cleanedPageText.length;
          const body = cleanedPageText.slice(startPos, endPos).trim();
          if (body) {
            blocks.push({
              orderIndex: runningOrder++,
              rawHeader: headerStr,
              bodyText: body,
              sourcePage: page.pageNumber,
              ocrConfidence: page.confidence,
            });
          }
        }
      } else {
        // Single block fallback
        blocks.push({
          orderIndex: runningOrder++,
          rawHeader: `Câu ${runningOrder - 1}`,
          bodyText: cleanedPageText.trim(),
          sourcePage: page.pageNumber,
          ocrConfidence: page.confidence,
        });
      }
    }
  }

  return blocks.map((b) => parseSingleQuestionBlock(b, globalAnswerKey));
}
