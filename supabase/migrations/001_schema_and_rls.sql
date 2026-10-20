-- ============================================================================
-- KHẢO THÍ SỐ — SUPABASE POSTGRESQL SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- Dùng để triển khai cơ sở dữ liệu sản phẩm thực tế trên Supabase PostgreSQL
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. BẢNG HỒ SƠ NGƯỜI DÙNG & PHÂN QUYỀN (user_profiles)
-- Không cho phép người dùng tự nâng quyền lên 'teacher' hoặc 'admin'
create table if not exists public.user_profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trạng thái khởi tạo Quản trị viên đầu tiên (chỉ chạy 1 lần duy nhất)
create table if not exists public.system_bootstrap_state (
  id int primary key default 1 check (id = 1),
  bootstrap_completed boolean not null default false,
  bootstrapped_by_uid uuid references auth.users(id),
  bootstrapped_at timestamptz
);

insert into public.system_bootstrap_state (id, bootstrap_completed)
values (1, false)
on conflict (id) do nothing;

-- 2. BẢNG ĐỀ THI (exams)
create table if not exists public.exams (
  id text primary key,
  owner_id uuid not null references public.user_profiles(uid) on delete cascade,
  owner_name text,
  share_code text not null unique,
  title text not null,
  subject text not null,
  grade_level text default 'Lớp 12',
  exam_category text default 'Cuối HK2',
  description text default '',
  duration_minutes int not null default 45 check (duration_minutes between 1 and 300),
  total_scale numeric(6,2) not null default 10,
  open_at timestamptz,
  close_at timestamptz,
  access_code text default '',
  max_attempts int not null default 0,
  shuffle_questions boolean not null default false,
  shuffle_options boolean not null default false,
  true_false_scoring text not null default 'standard_10_25_50_100',
  show_solution_policy text not null default 'after_submit' check (show_solution_policy in ('after_submit', 'after_close', 'manual_release')),
  solutions_released boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  version int not null default 1,
  public_questions jsonb not null default '[]'::jsonb, -- Chỉ chứa đề bài, KHÔNG chứa đáp án đúng
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. BẢNG KHÓA ĐÁP ÁN & LỜI GIẢI NỘI BỘ (exam_answer_keys)
-- Tuyệt đối tách biệt khỏi bảng exams để học sinh không bao giờ đọc được qua client
create table if not exists public.exam_answer_keys (
  exam_id text primary key references public.exams(id) on delete cascade,
  owner_id uuid not null references public.user_profiles(uid) on delete cascade,
  version int not null default 1,
  full_questions_with_keys jsonb not null default '[]'::jsonb,
  source_pages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 4. BẢNG NGÂN HÀNG CÂU HỎI (question_bank)
create table if not exists public.question_bank (
  id text primary key,
  owner_id uuid not null references public.user_profiles(uid) on delete cascade,
  subject text not null,
  grade_level text default 'Lớp 12',
  question_type text not null check (question_type in ('single_choice', 'multiple_choice', 'true_false', 'short_answer')),
  question_payload jsonb not null,
  created_at timestamptz not null default now()
);

-- 5. BẢNG BÀI LÀM CỦA HỌC SINH (submissions)
create table if not exists public.submissions (
  id text primary key,
  exam_id text not null references public.exams(id) on delete cascade,
  exam_owner_id uuid not null references public.user_profiles(uid),
  exam_version int not null default 1,
  share_code text not null,
  student_uid uuid references auth.users(id),
  student_access_token_hash text,
  student_name text not null,
  student_class text not null,
  student_code text default '',
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  answers jsonb not null default '{}'::jsonb,
  flagged_questions jsonb not null default '[]'::jsonb,
  tab_switch_count int not null default 0,
  raw_score numeric(6,2),
  max_raw_score numeric(6,2),
  scaled_score numeric(6,2),
  total_scale numeric(6,2) not null default 10,
  auto_submitted boolean not null default false,
  question_snapshot jsonb not null default '[]'::jsonb
);

-- 6. BẢNG NHẬT KÝ THAO TÁC QUẢN TRỊ (audit_logs)
create table if not exists public.audit_logs (
  id text primary key,
  actor_uid text not null,
  actor_email text not null,
  actor_role text not null,
  action text not null,
  target_id text not null,
  details text not null,
  ip text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- BẬT ROW LEVEL SECURITY (RLS) CHO TOÀN BỘ CÁC BẢNG
-- ============================================================================
alter table public.user_profiles enable row level security;
alter table public.system_bootstrap_state enable row level security;
alter table public.exams enable row level security;
alter table public.exam_answer_keys enable row level security;
alter table public.question_bank enable row level security;
alter table public.submissions enable row level security;
alter table public.audit_logs enable row level security;

-- Helper function kiểm tra vai trò từ bảng user_profiles
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.user_profiles where uid = auth.uid();
$$;

-- Chính sách RLS cho user_profiles:
-- Người dùng chỉ đọc được hồ sơ của chính mình; Admin đọc được tất cả.
create policy "user_profiles_select_self_or_admin"
  on public.user_profiles for select
  using (auth.uid() = uid or public.get_my_role() = 'admin');

-- Tự đăng ký chỉ được phép tạo role = 'student'
create policy "user_profiles_insert_student_only"
  on public.user_profiles for insert
  with check (auth.uid() = uid and role = 'student');

-- Chỉ Admin mới được phép thay đổi cột role
create policy "user_profiles_update_admin_only"
  on public.user_profiles for update
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- Chính sách RLS cho exams:
-- Học sinh chỉ đọc được đề đã xuất bản ('published'); Giáo viên đọc/sửa/xóa đề do chính mình sở hữu; Admin toàn quyền.
create policy "exams_select_published_or_owner"
  on public.exams for select
  using (
    status = 'published'
    or owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  );

create policy "exams_insert_teacher_or_admin"
  on public.exams for insert
  with check (
    owner_id = auth.uid()
    and public.get_my_role() in ('teacher', 'admin')
  );

create policy "exams_update_owner_or_admin"
  on public.exams for update
  using (
    (owner_id = auth.uid() and public.get_my_role() in ('teacher', 'admin'))
    or public.get_my_role() = 'admin'
  );

create policy "exams_delete_owner_or_admin"
  on public.exams for delete
  using (
    (owner_id = auth.uid() and public.get_my_role() in ('teacher', 'admin'))
    or public.get_my_role() = 'admin'
  );

-- Chính sách RLS cho exam_answer_keys (KHÓA ĐÁP ÁN):
-- TUYỆT ĐỐI KHÔNG cho phép học sinh đọc bảng này! Chỉ giáo viên sở hữu đề hoặc Admin mới đọc/ghi được.
create policy "answer_keys_owner_or_admin_only"
  on public.exam_answer_keys for all
  using (
    (owner_id = auth.uid() and public.get_my_role() in ('teacher', 'admin'))
    or public.get_my_role() = 'admin'
  )
  with check (
    (owner_id = auth.uid() and public.get_my_role() in ('teacher', 'admin'))
    or public.get_my_role() = 'admin'
  );

-- Chính sách RLS cho question_bank:
-- Giáo viên chỉ truy cập ngân hàng câu hỏi của chính mình; Admin toàn quyền.
create policy "question_bank_owner_or_admin"
  on public.question_bank for all
  using (
    (owner_id = auth.uid() and public.get_my_role() in ('teacher', 'admin'))
    or public.get_my_role() = 'admin'
  )
  with check (
    (owner_id = auth.uid() and public.get_my_role() in ('teacher', 'admin'))
    or public.get_my_role() = 'admin'
  );

-- Chính sách RLS cho submissions:
-- Học sinh chỉ đọc bài nộp của chính mình; Giáo viên đọc bài nộp thuộc đề của mình; Ghi điểm do Backend thực hiện.
create policy "submissions_select_student_or_exam_owner"
  on public.submissions for select
  using (
    student_uid = auth.uid()
    or (exam_owner_id = auth.uid() and public.get_my_role() in ('teacher', 'admin'))
    or public.get_my_role() = 'admin'
  );

-- Chính sách RLS cho audit_logs:
-- Chỉ Admin mới đọc được toàn bộ nhật ký kiểm toán; không ai được sửa/xóa nhật ký.
create policy "audit_logs_select_admin_only"
  on public.audit_logs for select
  using (public.get_my_role() = 'admin');
