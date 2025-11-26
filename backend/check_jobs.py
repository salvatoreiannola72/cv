import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("VITE_SUPABASE_URL")
key: str = os.environ.get("VITE_SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")

if not url or not key:
    print("Error: Missing env vars")
    exit(1)

supabase: Client = create_client(url, key)

response = supabase.from_("job_postings").select("id, title, status").execute()
print(f"Total jobs found: {len(response.data)}")
for job in response.data:
    print(f"- {job['title']} (Status: {job['status']})")
