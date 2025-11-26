import os
import time
import json
import yaml
from supabase import create_client, Client
import fitz  # PyMuPDF
from dotenv import load_dotenv
from llm_factory import LLMFactory

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
    "model": os.environ.get("LLM_MODEL", "gemini-1.5-flash")
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

        # 3. Evaluate against EACH open job
        for job in jobs:
            print(f"  - Evaluating for {job['title']}...")
            
            # Check if score already exists
            existing_score = supabase.from_("candidate_scores").select("id").eq("candidate_id", candidate['id']).eq("job_posting_id", job['id']).execute()
            
            # Check if we need to re-evaluate to extract name (if name looks like a filename)
            name_needs_update = candidate['full_name'].lower().startswith('cv ') or candidate['full_name'].lower().endswith('.pdf') or candidate['full_name'] == "CV con foto"

            if existing_score.data and not name_needs_update:
                print("    - Score already exists and name seems fine, skipping.")
                continue

            prompt = f"""
You are an expert HR recruiter. Evaluate the following candidate CV against the Job Description.

JOB DESCRIPTION:
Title: {job['title']}
Description: {job['description']}
Requirements: {job['requirements']}
Required Skills: {', '.join(job.get('required_skills') or [])}

CANDIDATE CV:
{cv_text[:10000]} # Truncate to avoid token limits if necessary

Analyze the match.

Also, extract the following information from the CV if available:
- Candidate Name (Full Name)
- Email
- Years of Experience (as a number)
- Education Level (e.g., Bachelor, Master, PhD, High School)

Output strictly in JSON format with the following structure:
{{
    "overall_score": <number 0-100>,
    "experience_score": <number 0-100>,
    "skills_score": <number 0-100>,
    "education_score": <number 0-100>,
    "location_score": <number 0-100>,
    "extracted_info": {{
        "full_name": "<string or null>",
        "email": "<email or null>",
        "years_of_experience": <number or null>,
        "education_level": "<string or null>"
    }},
    "analysis": {{
        "summary": "<Concise professional summary of the candidate>",
        "green_flags": ["<flag1>", "<flag2>"],
        "red_flags": ["<flag1>", "<flag2>"],
        "experience_analysis": "<Concise analysis of experience match>",
        "education_analysis": "<Concise analysis of education match>",
        "skills_analysis": "<Concise analysis of skills match>",
        "match_reasoning": "<Why this candidate is a good or bad fit>"
    }}
}}
"""

            try:
                result = llm_provider.generate_analysis(prompt)
                
                if not result:
                    print("    - Error: Empty response from LLM")
                    continue

                # Prepare data for candidate_scores
                score_data = {
                    "candidate_id": candidate['id'],
                    "job_posting_id": job['id'],
                    "overall_score": result.get("overall_score", 0),
                    "experience_score": result.get("experience_score", 0),
                    "skills_score": result.get("skills_score", 0),
                    "education_score": result.get("education_score", 0),
                    "location_score": result.get("location_score", 0),
                    "score_details": result.get("analysis", {}) # Store the detailed analysis here
                }

                # Upsert score
                supabase.from_("candidate_scores").upsert(score_data, on_conflict="candidate_id, job_posting_id").execute()
                print(f"    - Score saved: {score_data['overall_score']}")

                # Update candidate extracted info (only if found)
                extracted = result.get("extracted_info", {})
                update_data = {}
                if extracted.get("full_name"): update_data["full_name"] = extracted["full_name"]
                if extracted.get("email"): update_data["email"] = extracted["email"]
                if extracted.get("years_of_experience") is not None:
                    try:
                        update_data["years_of_experience"] = int(float(extracted["years_of_experience"]))
                    except (ValueError, TypeError):
                        pass # Keep original or ignore if invalid
                if extracted.get("education_level"): update_data["education_level"] = extracted["education_level"]
                
                if update_data:
                    supabase.from_("candidates").update(update_data).eq("id", candidate['id']).execute()
                    print(f"    - Candidate info updated: {update_data.keys()}")

            except Exception as e:
                print(f"    - Error evaluating: {e}")

if __name__ == "__main__":
    process_cvs()
