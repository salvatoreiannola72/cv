import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("VITE_SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")

if not url or not key:
    print("Error: Missing env vars")
    exit(1)

supabase: Client = create_client(url, key)

response = supabase.from_("candidate_scores").select("id, job_posting_id, overall_score", count="exact").execute()
print(f"Total scores found: {len(response.data)}")

if len(response.data) > 0:
    print("Sample scores:")
    for score in response.data[:5]:
        print(f"- Job: {score['job_posting_id']}, Score: {score['overall_score']}")
else:
    print("No scores found. Please run process_cvs.py")
