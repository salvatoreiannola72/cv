import os
import sys

# Add current directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import time
import json
import yaml
from supabase import create_client, Client
import fitz  # PyMuPDF
from dotenv import load_dotenv
from .llm_factory import LLMFactory

# Load environment variables
load_dotenv()

# Supabase setup
url: str = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: Supabase URL or Key is missing in .env")
    exit(1)

# Warn if using publishable key (RLS might block access)
if "SERVICE_ROLE" not in (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "") and "public" in key:
    print("\nWARNING: You seem to be using a public/anon key. Row Level Security (RLS) might prevent this script from seeing all jobs or candidates.")
    print("Please add SUPABASE_SERVICE_ROLE_KEY=... to your backend/.env file for full access.\n")

supabase: Client = create_client(url, key)

# Load Configuration from Env
llm_config = {
    "provider": os.environ.get("LLM_PROVIDER", "google"),
    "model": os.environ.get("LLM_MODEL", "gemini-2.0-flash")
}

# Initialize LLM Provider
try:
    llm_provider = LLMFactory.create_provider(llm_config)
    print(f"Using LLM Provider: {llm_config.get('provider')} ({llm_config.get('model')})")
except Exception as e:
    print(f"Error initializing LLM provider: {e}")
    exit(1)

def extract_text_from_pdf(pdf_content):
    try:
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return ""

def process_cvs():
    # 1. Fetch all open job postings
    print("Fetching open job postings...")
    jobs_response = supabase.from_("job_postings").select("*").eq("status", "open").execute()
    jobs = jobs_response.data
    
    if not jobs:
        print("No open job postings found.")
        return

    print(f"Found {len(jobs)} open jobs.")

    # 2. Fetch all candidates
    print("Fetching candidates...")
    candidates_response = supabase.from_("candidates").select("*").execute()
    candidates = candidates_response.data

    if not candidates:
        print("No candidates found.")
        return

    print(f"Found {len(candidates)} candidates.")

    for candidate in candidates:
        print(f"\nProcessing candidate: {candidate['full_name']} (ID: {candidate['id']})")
        
        # Download CV
        if not candidate.get("cv_file_url"):
            print("  - No CV URL found, skipping.")
            continue

        try:
            # Extract path from URL (assuming standard Supabase storage URL structure)
            # URL format: .../storage/v1/object/public/cv-files/user_id/filename.pdf
            cv_path = candidate["cv_file_url"].split("/cv-files/")[-1]
            
            print(f"  - Downloading CV: {cv_path}")
            cv_data = supabase.storage.from_("cv-files").download(cv_path)
            
            cv_text = extract_text_from_pdf(cv_data)
            if not cv_text:
                print("  - Could not extract text from CV, skipping.")
                continue
                
        except Exception as e:
            print(f"  - Error downloading/reading CV: {e}")
            continue

        # 3. Determine jobs to evaluate
        # Fetch existing scores for this candidate to avoid re-work
        existing_scores_response = supabase.from_("candidate_scores").select("job_posting_id").eq("candidate_id", candidate['id']).execute()
        existing_job_ids = {item['job_posting_id'] for item in existing_scores_response.data}

        # Check if we need to re-run to extract info (name, phone, etc.)
        name_needs_update = candidate['full_name'].lower().startswith('cv ') or candidate['full_name'].lower().endswith('.pdf') or candidate['full_name'] == "CV con foto"
        phone_needs_update = not candidate.get('phone')
        
        jobs_to_evaluate = []
        if name_needs_update or phone_needs_update:
            # If info is missing, evaluate against ALL open jobs to ensure we get the info and fresh scores
            jobs_to_evaluate = jobs
        else:
            # Otherwise, only evaluate against new jobs
            jobs_to_evaluate = [j for j in jobs if j['id'] not in existing_job_ids]

        if not jobs_to_evaluate:
            print("  - All jobs scored and info complete, skipping.")
            continue

        print(f"  - Evaluating against {len(jobs_to_evaluate)} jobs...")

        # 4. Construct Batch Prompt
        jobs_section = ""
        for job in jobs_to_evaluate:
            jobs_section += f"""
JOB ID: {job['id']}
Title: {job['title']}
Description: {job['description']}
Requirements: {job['requirements']}
Required Skills: {', '.join(job.get('required_skills') or [])}
---
"""

        prompt = f"""
You are an expert HR recruiter. Evaluate the following candidate CV against the provided Job Descriptions.

JOBS TO EVALUATE:
{jobs_section}

CANDIDATE CV:
{cv_text[:15000]} 

Analyze the match for EACH job.

Also, extract the following information from the CV (once):
- Candidate Name (Full Name)
- Email
- Phone Number
- Years of Experience (as a number)
- Education Level (e.g., Bachelor, Master, PhD, High School)

Output strictly in JSON format with the following structure:
{{
    "extracted_info": {{
        "full_name": "<string or null>",
        "email": "<email or null>",
        "phone": "<string or null>",
        "years_of_experience": <number or null>,
        "education_level": "<string or null>"
    }},
    "evaluations": {{
        "<job_id>": {{
            "overall_score": <number 0-100>,
            "experience_score": <number 0-100>,
            "skills_score": <number 0-100>,
            "education_score": <number 0-100>,
            "location_score": <number 0-100>,
            "analysis": {{
                "summary": "<Concise professional summary>",
                "green_flags": ["<flag1>", "<flag2>"],
                "red_flags": ["<flag1>", "<flag2>"],
                "experience_analysis": "<Concise analysis>",
                "education_analysis": "<Concise analysis>",
                "skills_analysis": "<Concise analysis>",
                "match_reasoning": "<Why good/bad fit>"
            }}
        }}
    }}
}}
"""

        try:
            result = llm_provider.generate_analysis(prompt)
            
            if not result:
                print("    - Error: Empty response from LLM")
                continue

            # 5. Process Results
            
            # Update candidate info
            extracted = result.get("extracted_info", {})
            update_data = {}
            if extracted.get("full_name"): update_data["full_name"] = extracted["full_name"]
            if extracted.get("email"): update_data["email"] = extracted["email"]
            if extracted.get("phone"): update_data["phone"] = extracted["phone"]
            if extracted.get("years_of_experience") is not None:
                try:
                    update_data["years_of_experience"] = int(float(extracted["years_of_experience"]))
                except (ValueError, TypeError):
                    pass 
            if extracted.get("education_level"): update_data["education_level"] = extracted["education_level"]
            
            if update_data:
                supabase.from_("candidates").update(update_data).eq("id", candidate['id']).execute()
                print(f"    - Candidate info updated: {update_data.keys()}")

            # Insert Scores
            evaluations = result.get("evaluations", {})
            for job_id, eval_data in evaluations.items():
                # Verify job_id exists in our list (sanity check)
                if not any(j['id'] == job_id for j in jobs_to_evaluate):
                    print(f"    - Warning: LLM returned evaluation for unknown/unrequested job {job_id}, skipping.")
                    continue

                score_data = {
                    "candidate_id": candidate['id'],
                    "job_posting_id": job_id,
                    "overall_score": eval_data.get("overall_score", 0),
                    "experience_score": eval_data.get("experience_score", 0),
                    "skills_score": eval_data.get("skills_score", 0),
                    "education_score": eval_data.get("education_score", 0),
                    "location_score": eval_data.get("location_score", 0),
                    "score_details": eval_data.get("analysis", {})
                }
                
                supabase.from_("candidate_scores").upsert(score_data, on_conflict="candidate_id, job_posting_id").execute()
                print(f"    - Score saved for job {job_id}: {score_data['overall_score']}")

        except Exception as e:
            print(f"    - Error evaluating: {e}")

if __name__ == "__main__":
    process_cvs()
