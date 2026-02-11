const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiClient {
    public baseUrl: string; // Cambia da private a public per authService
    private token: string | null = null;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    setToken(token: string | null) {
        this.token = token;
    }

    getToken(): string | null {
        return this.token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const headers: HeadersInit = {
            ...options.headers,
        };

        // Non aggiungere Content-Type per FormData (lo fa il browser)
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || error.detail || 'Request failed');
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    }

    // Jobs
    async getJobs() {
        return this.request<JobPosting[]>('/api/jobs');
    }

    async getJobDetail(jobId: string) {
        return this.request<JobPosting>(`/api/jobs/${jobId}`);
    }

    // Candidates
    async getCandidates(jobId: string, search?: string) {
        const params = new URLSearchParams({ job_id: jobId });
        if (search) params.append('search', search);
        return this.request<Candidate[]>(`/api/candidates?${params}`);
    }

    async createCandidate(data: FormData) {
        return this.request<Candidate>('/api/candidates/create', {
            method: 'POST',
            body: data,
        });
    }

    async deleteCandidate(candidateId: string) {
        return this.request<void>(`/api/candidates/${candidateId}`, {
            method: 'DELETE',
        });
    }

    // Analysis
    async analyzeResumes(jobId?: string, candidateId?: string) {
        return this.request<{ message: string; status: string; task_id?: string }>(
            '/api/analyze',
            {
                method: 'POST',
                body: JSON.stringify({ job_id: jobId, candidate_id: candidateId }),
            }
        );
    }

    // Health
    async healthCheck() {
        return this.request<{ status: string }>('/api/health');
    }

    // Aggiungi questo metodo in ApiClient

    // Dashboard
    async getDashboardStats() {
        return this.request<{
            open_positions: number;
            total_candidates: number;
            top_candidates: TopCandidate[];
        }>('/api/dashboard/stats');
    }

    async getCandidateDetail(candidateId: string) {
        return this.request<{
            candidate: Candidate & { skills: string[] };
            scores: CandidateScore[];
        }>(`/api/candidates/${candidateId}/detail`);
    }

    async createJob(data: Partial<JobPosting>) {
        return this.request<JobPosting>('/api/jobs', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateJob(jobId: string, data: Partial<JobPosting>) {
        return this.request<JobPosting>(`/api/jobs/${jobId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    async deleteJob(jobId: string) {
        return this.request<void>(`/api/jobs/${jobId}`, {
            method: 'DELETE',
        });
    }
}

export const apiClient = new ApiClient(API_URL);

// Types
export interface JobPosting {
    id: string;
    title: string;
    description: string;
    requirements: string;
    location: string;
    required_skills: string[];
    created_at: string;
    employment_type: string;
    required_experience_years: number;
    status: string;
    salary_range: string | null;
}

export interface Candidate {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    location: string | null;
    current_status: string;
    overall_score: number | null;
    years_of_experience: number | null;
    created_at: string;
    cv_file_url: string;
    education_level: string | null;
    skills: string[];
}

// Aggiungi questo type
export interface TopCandidate {
    overall_score: number;
    candidate: {
        id: string;
        full_name: string;
    };
    job_posting?: {
        id: string;
        title: string;
    };
}

export interface CandidateScore {
    id: string;
    job_posting_id: string;
    overall_score: number;
    education_score: number;
    experience_score: number;
    skills_score: number;
    location_score: number;
    score_details: any;
    job_posting: {
        id: string;
        title: string;
    };
}