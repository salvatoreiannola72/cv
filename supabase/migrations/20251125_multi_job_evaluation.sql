-- Migration: Enable multi-job evaluation

-- 1. Make job_posting_id nullable in candidates table
ALTER TABLE public.candidates 
ALTER COLUMN job_posting_id DROP NOT NULL;

-- 2. Add job_posting_id to candidate_scores table
ALTER TABLE public.candidate_scores 
ADD COLUMN job_posting_id UUID REFERENCES public.job_postings(id) ON DELETE CASCADE;

-- 3. Add unique constraint to prevent duplicate scores for the same candidate and job
ALTER TABLE public.candidate_scores 
ADD CONSTRAINT candidate_scores_candidate_job_unique UNIQUE (candidate_id, job_posting_id);

-- 4. Update RLS policies if necessary (existing ones might be broad enough, but good to check)
-- The existing policies for candidate_scores are:
-- "Authenticated users can view scores" (true)
-- "Authenticated users can insert scores" (true)
-- These should still work.
