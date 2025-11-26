-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table for HR team members
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'recruiter', 'reviewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create job_postings table
CREATE TABLE public.job_postings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT NOT NULL,
  location TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('full-time', 'part-time', 'contract', 'internship')),
  salary_range TEXT,
  required_experience_years INTEGER NOT NULL DEFAULT 0,
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'filled')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create candidates table
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_posting_id UUID NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  years_of_experience INTEGER,
  education_level TEXT,
  skills TEXT[] DEFAULT '{}',
  current_status TEXT NOT NULL DEFAULT 'new' CHECK (current_status IN ('new', 'to_contact', 'contacted', 'interviewed', 'rejected', 'hired')),
  cv_file_url TEXT,
  cv_text_content TEXT,
  overall_score NUMERIC(5,2),
  added_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create candidate_scores table for scoring history and breakdown
CREATE TABLE public.candidate_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  overall_score NUMERIC(5,2) NOT NULL,
  experience_score NUMERIC(5,2) NOT NULL,
  skills_score NUMERIC(5,2) NOT NULL,
  education_score NUMERIC(5,2) NOT NULL,
  location_score NUMERIC(5,2) NOT NULL,
  scoring_algorithm_version TEXT NOT NULL DEFAULT 'v1.0',
  score_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create candidate_status_history for audit trail
CREATE TABLE public.candidate_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create storage bucket for CV files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('cv-files', 'cv-files', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_status_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for job_postings
CREATE POLICY "Authenticated users can view job postings"
  ON public.job_postings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create job postings"
  ON public.job_postings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own job postings"
  ON public.job_postings FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own job postings"
  ON public.job_postings FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- RLS Policies for candidates
CREATE POLICY "Authenticated users can view candidates"
  ON public.candidates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create candidates"
  ON public.candidates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = added_by);

CREATE POLICY "Authenticated users can update candidates"
  ON public.candidates FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete candidates"
  ON public.candidates FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for candidate_scores
CREATE POLICY "Authenticated users can view scores"
  ON public.candidate_scores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert scores"
  ON public.candidate_scores FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for candidate_status_history
CREATE POLICY "Authenticated users can view status history"
  ON public.candidate_status_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert status history"
  ON public.candidate_status_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = changed_by);

-- Storage policies for cv-files bucket
CREATE POLICY "Authenticated users can upload CV files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cv-files');

CREATE POLICY "Authenticated users can view CV files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'cv-files');

CREATE POLICY "Authenticated users can delete CV files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'cv-files');

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_postings_updated_at
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'recruiter')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();