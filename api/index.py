import os
import sys

# Add current directory to sys.path to allow importing sibling modules in Vercel
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from . import process_cvs

app = FastAPI()

# Configure CORS
origins = [
    "http://localhost:8080",  # Vite default port
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalysisRequest(BaseModel):
    job_id: str | None = None

@app.post("/analyze")
async def analyze_cvs(request: AnalysisRequest):
    try:
        # In a real app, we might want to filter by job_id if provided,
        # but process_cvs currently processes all open jobs.
        # We can modify process_cvs to accept arguments later if needed.
        
        # Capture output? For now just run it.
        # Note: This is a blocking call. For production, use background tasks.
        process_cvs.process_cvs()
        
        return {"message": "Analysis completed successfully", "status": "success"}
    except Exception as e:
        print(f"Error during analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}
