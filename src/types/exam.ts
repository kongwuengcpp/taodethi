export type UserRole = 'student' | 'teacher' | 'admin';

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  createdBy?: string;
}

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer';

export interface QuestionOption {
  id: string; // 'A', 'B', 'C', 'D', etc.
  label: string; // 'A', 'B', 'C', 'D'
  text: string;
}

export interface TrueFalseStatement {
  id: string; // 'a', 'b', 'c', 'd'
  label: string; // 'a)', 'b)', 'c)', 'd)'
  text: string;
  isTrue?: boolean;
}

export interface Question {
  id: string;
  orderIndex: number;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  statements?: TrueFalseStatement[];
  correctAnswers: string[];
  points: number;
  explanation: string;
  needsReview: boolean;
  reviewReason?: string;
  sourcePage?: number;
  ocrConfidence?: number;
  subject?: string;
  gradeLevel?: string;
  ownerId?: string;
  createdAt?: string;
}

export interface SourcePageImage {
  pageNumber: number;
  dataUrl: string;
  extractedText: string;
  method: 'native_text' | 'ocr' | 'gemini_ai';
  confidence?: number;
}

export type SolutionPolicy = 'after_submit' | 'after_close' | 'manual_release';

export type ExamStatus = 'draft' | 'published' | 'closed';

export type TrueFalseScoringRule =
  | 'standard_10_25_50_100'
  | 'equal_per_statement';

export interface ExamSectionSummary {
  tnCount: number;
  tnPointsEach: number;
  tnTotalPoints: number;
  dsCount: number;
  dsPointsEach: number;
  dsTotalPoints: number;
  tlnCount: number;
  tlnPointsEach: number;
  tlnTotalPoints: number;
  totalRawPoints: number;
}

export interface Exam {
  id: string;
  ownerId: string;
  ownerName?: string;
  shareCode: string;
  title: string;
  subject: string;
  gradeLevel?: string; // 'Lớp 10' | 'Lớp 11' | 'Lớp 12' | 'THPT Quốc Gia'
  examCategory?: string; // 'Giữa HK1' | 'Cuối HK1' | 'Giữa HK2' | 'Cuối HK2' | 'Thi Thử THPT' | 'Khảo Sát'
  description: string;
  durationMinutes: number;
  totalScale: number;
  openAt: string | null;
  closeAt: string | null;
  accessCode: string;
  maxAttempts?: number; // 0 = unlimited
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  trueFalseScoring?: TrueFalseScoringRule;
  showSolutionPolicy: SolutionPolicy;
  solutionsReleased: boolean;
  status: ExamStatus;
  version: number;
  folderId?: string | null;
  isDemoData?: boolean;
  questions: Question[];
  sourceFileName?: string;
  sourceFileType?: string;
  sourcePages: SourcePageImage[];
  createdAt: string;
  updatedAt: string;
}

export interface ExamFolder {
  id: string;
  name: string;
  color?: string; // 'blue' | 'emerald' | 'amber' | 'purple' | 'rose' | 'indigo' | 'cyan'
  ownerId?: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  examCount?: number;
}

export interface PublicQuestion {
  id: string;
  orderIndex: number;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  statements?: Array<{
    id: string;
    label: string;
    text: string;
  }>;
  points: number;
}

export interface PublicExamInfo {
  id: string;
  shareCode: string;
  title: string;
  subject: string;
  gradeLevel?: string;
  examCategory?: string;
  description: string;
  durationMinutes: number;
  totalScale: number;
  openAt: string | null;
  closeAt: string | null;
  requiresAccessCode: boolean;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  trueFalseScoring: TrueFalseScoringRule;
  questionCount: number;
  sectionSummary: ExamSectionSummary;
  version: number;
  status: ExamStatus;
  isOpen: boolean;
  closedReason?: string;
}

export interface StudentAnswer {
  questionId: string;
  selectedOptions?: string[];
  statementAnswers?: Record<string, boolean>;
  shortText?: string;
}

export interface QuestionGradeResult {
  questionId: string;
  earnedPoints: number;
  maxPoints: number;
  isCorrect: boolean;
  partialCredit?: boolean;
  studentAnswer?: StudentAnswer;
  correctAnswers?: string[];
  statementTruths?: Record<string, boolean>;
  explanation?: string;
}

export interface Submission {
  id: string;
  examId: string;
  examOwnerId: string;
  examTitle?: string;
  examSubject?: string;
  examVersion: number;
  shareCode: string;
  studentUid: string;
  studentAccessToken?: string;
  studentName: string;
  studentClass: string;
  studentCode: string;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  status: 'in_progress' | 'submitted';
  answers: Record<string, StudentAnswer>;
  flaggedQuestions: string[];
  tabSwitchCount: number;
  rawScore: number | null;
  maxRawScore: number | null;
  scaledScore: number | null;
  totalScale: number;
  autoSubmitted: boolean;
  solutionsVisible?: boolean;
  solutionNotice?: string;
  gradeDetails?: QuestionGradeResult[];
  questionSnapshot?: Question[];
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: UserRole;
  action:
    | 'BOOTSTRAP_ADMIN'
    | 'LOGIN'
    | 'LOGOUT'
    | 'CREATE_USER'
    | 'GRANT_ROLE'
    | 'CREATE_EXAM'
    | 'UPDATE_EXAM'
    | 'DUPLICATE_EXAM'
    | 'PUBLISH_EXAM'
    | 'CLOSE_EXAM'
    | 'VERSION_BUMP_EXAM'
    | 'DELETE_EXAM'
    | 'CREATE_QUESTION'
    | 'DELETE_QUESTION'
    | 'AI_EXTRACT_DOCUMENT'
    | 'EXPORT_RESULTS'
    | 'BACKUP_DATA'
    | 'RESTORE_DATA'
    | 'SEED_DEMO_SANDBOX'
    | 'CLEAR_DEMO_SANDBOX'
    | 'CREATE_FOLDER'
    | 'UPDATE_FOLDER'
    | 'DELETE_FOLDER'
    | 'MOVE_EXAM_FOLDER'
    | 'UNAUTHORIZED_ATTEMPT';
  targetId: string;
  details: string;
  ip: string;
  createdAt: string;
}

export interface SystemSetupStatus {
  initialized: boolean;
  adminCount: number;
  bootstrapLocked: boolean;
  hasEnvBootstrapSecret: boolean;
  hasOwnerEmailConstraint: boolean;
  hasGeminiKey: boolean;
  serverTime: string;
}
