# Hiresight

A powerful and intuitive CV management system for companies to streamline their hiring process. This application automatically ranks candidates based on their CVs against open job positions, leveraging the power of Large Language Models (LLMs) for intelligent analysis.

## Description

CV Handler is a comprehensive solution for managing job applications. It combines a modern React frontend for seamless user interaction with a robust Python backend for advanced AI processing. The system allows recruiters to create job postings, upload candidate CVs, and receive detailed, AI-driven evaluations of each candidate's suitability for specific roles.

## Features

*   **Job Position Management:** Create, edit, and manage job positions with detailed descriptions and requirements.
*   **CV Upload and Parsing:** Easily upload CVs (PDF). The system securely stores them and automatically extracts text for analysis.
*   **AI-Powered Ranking:** A dedicated Python service uses LLMs (Google Gemini, Ollama, etc.) to analyze CVs against job descriptions, providing a match score (0-100%) and detailed reasoning.
*   **Smart Score Sorting:** Candidates are automatically sorted by their match score, ensuring the best fits are always visible at the top.
*   **Deep Linking:** Selecting a candidate from a specific job list automatically opens their profile with that job's evaluation pre-selected.
*   **Detailed Candidate Profiles:** View comprehensive candidate details, including experience, education, skills, "Green/Red Flags," and a professional summary.
*   **Secure Access:** CVs are stored in private buckets with secure, temporary signed URL access.

## Tech Stack

### Frontend
*   **[React](https://reactjs.org/)**: UI library.
*   **[TypeScript](https://www.typescriptlang.org/)**: Type safety.
*   **[Vite](https://vitejs.dev/)**: Build tool.
*   **[Tailwind CSS](https://tailwindcss.com/)**: Styling.
*   **[shadcn/ui](https://ui.shadcn.com/)**: UI components.
*   **[React Query](https://tanstack.com/query/latest)**: Data fetching and state management.

### Backend & Services
*   **[Supabase](https://supabase.io/)**: Database (PostgreSQL), Authentication, and Storage.
*   **[Python](https://www.python.org/)**: Backend logic for CV processing.
*   **LLM Providers**:
    *   **Google Gemini**: Default provider for high-quality analysis.
    *   **Ollama**: Supported for local LLM inference.

## Architecture

The application follows a decoupled architecture:
1.  **Frontend (React)**: Handles user interaction, displays data, and uploads files to Supabase Storage.
2.  **Database (Supabase)**: Stores job postings, candidate metadata, and evaluation scores.
3.  **Backend Service (Python)**:
    *   Monitors the database for new candidates/jobs.
    *   Downloads CVs from Supabase Storage.
    *   Sends content to the configured LLM for analysis.
    *   Writes structured evaluation results (scores, analysis) back to the database.

## Getting Started

Follow these steps to set up the project locally.

### Prerequisites
*   Node.js & npm
*   Python 3.8+
*   Supabase Account

### 1. Clone the Repository
```bash
git clone https://github.com/your_username/cv_handler.git
cd cv_handler
```

### 2. Frontend Setup
1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Create a `.env` file in the root directory:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```

### 3. Backend Setup (Python)
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create a virtual environment:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```
3.  Install Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```
    *(Note: Ensure you have `supabase`, `google-generativeai`, `PyMuPDF`, `python-dotenv`, `pyyaml` installed if requirements.txt is missing)*
4.  Create a `.env` file in the `backend` directory:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
    GOOGLE_API_KEY=your_google_gemini_key
    ```
    *> [!IMPORTANT]*
    > You must use the `SERVICE_ROLE_KEY` for the backend to bypass Row Level Security (RLS) and access all data.

5.  Configure the LLM in `config.yaml` (optional):
    ```yaml
    llm:
      provider: "google" # or "ollama"
      model: "gemini-2.5-flash"
    ```

### 4. Running the AI Processor
To process CVs and generate rankings, run the script:
```bash
python process_cvs.py
```
*You can set this up as a cron job or run it periodically.*

## License

Distributed under the MIT License.