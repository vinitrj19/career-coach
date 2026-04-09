-- 1. Create Students Table
CREATE TABLE public.students (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    target_role TEXT,
    days_left INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Scores Table
CREATE TABLE public.scores (
    id SERIAL PRIMARY KEY,
    student_id UUID REFERENCES public.students(id),
    skill TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, skill)
);

-- 3. Create Quiz Attempts Table
CREATE TABLE public.quiz_attempts (
    id SERIAL PRIMARY KEY,
    student_id UUID REFERENCES public.students(id),
    question_id INTEGER NOT NULL,
    selected_answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: RLS (Row Level Security) is disabled for this hackathon prototype 
-- so our Node.js backend can instantly read/write via the REST API.
