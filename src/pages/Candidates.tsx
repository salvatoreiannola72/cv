import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, ArrowLeft, Users, Mail, Phone, MapPin, Briefcase, FileText, Trash2, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ImportCandidatesDialog } from "@/components/candidates/ImportCandidatesDialog";

const candidateSchema = z.object({
  full_name: z.string().min(2, "Nome troppo corto").max(100),
  email: z.string().email("Email non valida"),
  phone: z.string().optional(),
  location: z.string().optional(),
});

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  current_status: string;
  overall_score: number | null;
  years_of_experience: number | null;
  created_at: string;
}

interface JobPosting {
  id: string;
  title: string;
  description: string;
  requirements: string;
  location: string;
  required_skills: string[];
  created_at: string;
}

const Candidates = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("job");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>(jobId || "");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    location: "",
    cv_file: null as File | null,
  });

  // Derived state for the selected job object
  const selectedJob = jobPostings.find(j => j.id === selectedJobId);

  useEffect(() => {
    checkAuth();
    loadJobPostings();
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [analyzing, setAnalyzing] = useState(false);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const loadJobPostings = async () => {
    try {
      const { data, error } = await supabase
        .from("job_postings")
        .select("*") // Fetch all fields to show details
        .order("created_at", { ascending: false });

      if (error) throw error;
      setJobPostings(data || []);
      
      if (data && data.length > 0 && !selectedJobId) {
        setSelectedJobId(data[0].id);
      }
    } catch (error) {
      console.error("Errore caricamento posizioni:", error);
    }
  };

  const loadCandidates = useCallback(async () => {
    if (!selectedJobId) return;
    
    setLoading(true);
    try {
      // Build the query
      let query: any = supabase
        .from("candidate_scores")
        .select(`
          overall_score,
          candidate:candidates!inner(*)
        `)
        .eq("job_posting_id", selectedJobId)
        .order("overall_score", { ascending: false });

      // Apply search filter if query exists
      if (debouncedSearchQuery) {
        // We use !inner join to filter by candidate fields
        // The syntax for OR across columns in a joined table:
        // We reference the alias 'candidate' and the columns
        query = query.or(`full_name.ilike.%${debouncedSearchQuery}%,cv_text_content.ilike.%${debouncedSearchQuery}%`, { foreignTable: "candidate" });
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform data to match Candidate interface
      const formattedCandidates: Candidate[] = (data || []).map((item: any) => ({
        ...item.candidate,
        overall_score: item.overall_score,
      }));

      setCandidates(formattedCandidates);
    } catch (error) {
      console.error("Errore caricamento candidati:", error);
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile caricare i candidati",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedJobId, debouncedSearchQuery, toast]);

  const triggerAnalysis = async (silent: boolean = false) => {
    if (!selectedJobId) return;
    
    setAnalyzing(true);
    if (!silent) {
      toast({
        title: "Analisi avviata",
        description: "L'analisi dei CV è in corso. Potrebbe richiedere qualche minuto...",
      });
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiUrl}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ job_id: selectedJobId }),
      });

      if (!response.ok) {
        throw new Error("Errore nella comunicazione con il server");
      }

      const result = await response.json();
      
      if (!silent) {
        toast({
          title: "Analisi completata",
          description: "I punteggi sono stati aggiornati.",
        });
      }
      
      loadCandidates();
    } catch (error) {
      console.error("Errore analisi:", error);
      if (!silent) {
        toast({
          variant: "destructive",
          title: "Errore",
          description: "Impossibile completare l'analisi. Assicurati che il backend sia in esecuzione.",
        });
      }
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (selectedJobId) {
      loadCandidates();
      
      // Check if we need to run initial analysis
      // We use a key specific to the job to avoid running it multiple times for the same job in the session
      const hasRunInitialAnalysis = sessionStorage.getItem(`initialAnalysisRun_${selectedJobId}`);
      if (!hasRunInitialAnalysis) {
        triggerAnalysis(true);
        sessionStorage.setItem(`initialAnalysisRun_${selectedJobId}`, "true");
      }
    }
  }, [selectedJobId, loadCandidates]); 

  const handleUploadCandidate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      candidateSchema.parse(formData);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utente non autenticato");

      // Check for duplicate email
      const { data: existingCandidate } = await supabase
        .from("candidates")
        .select("id")
        .eq("email", formData.email)
        .maybeSingle();

      if (existingCandidate) {
        throw new Error("Un candidato con questa email esiste già.");
      }

      let cvUrl = null;
      if (formData.cv_file) {
        const fileExt = formData.cv_file.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("cv-files")
          .upload(fileName, formData.cv_file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("cv-files")
          .getPublicUrl(fileName);

        cvUrl = publicUrl;
      }

      const { error } = await supabase.from("candidates").insert([
        {
          job_posting_id: selectedJobId, // Optional: link to job if needed, or null
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone || null,
          location: formData.location || null,
          cv_file_url: cvUrl,
          added_by: user.id,
        },
      ]);

      if (error) throw error;

      toast({
        title: "Candidato aggiunto",
        description: "Il candidato è stato inserito con successo",
      });

      setDialogOpen(false);
      // Trigger analysis after upload
      triggerAnalysis(false);
      
      setFormData({
        full_name: "",
        email: "",
        phone: "",
        location: "",
        cv_file: null,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message || "Errore nell'inserimento del candidato",
      });
    }
  };


  const handleDeleteCandidate = async (candidateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // Delete scores first
      const { error: scoresError } = await supabase
        .from("candidate_scores")
        .delete()
        .eq("candidate_id", candidateId);

      if (scoresError) console.error("Error deleting scores:", scoresError);

      // Delete status history
      const { error: historyError } = await supabase
        .from("candidate_status_history")
        .delete()
        .eq("candidate_id", candidateId);

      if (historyError) console.error("Error deleting history:", historyError);

      // Delete candidate
      const { error } = await supabase
        .from("candidates")
        .delete()
        .eq("id", candidateId);

      if (error) throw error;

      toast({
        title: "Candidato eliminato",
        description: "Il candidato è stato rimosso con successo",
      });

      setCandidates(candidates.filter(c => c.id !== candidateId));
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile eliminare il candidato",
      });
    }
  };

  const getScoreBadge = (score: number | null) => {
    if (!score) return <Badge variant="outline" className="border-gray-200 text-gray-500">N/A</Badge>;
    
    if (score >= 80) {
      return <Badge className="bg-green-50 text-green-700 border border-green-200 shadow-none">{score.toFixed(1)}</Badge>;
    } else if (score >= 60) {
      return <Badge className="bg-yellow-50 text-yellow-700 border border-yellow-200 shadow-none">{score.toFixed(1)}</Badge>;
    } else {
      return <Badge className="bg-gray-50 text-gray-600 border border-gray-200 shadow-none">{score.toFixed(1)}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-[20px] shadow-sm border border-gray-100 gap-4">
              <div className="flex items-center gap-6 flex-1 w-full md:w-auto">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 whitespace-nowrap">
                  <Users className="h-5 w-5 text-gray-500" />
                  Candidati
                  <span className="ml-2 text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {candidates.length}
                  </span>
                </h3>
                
                {/* Search Bar */}
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    placeholder="Cerca per nome o contenuto CV..." 
                    className="pl-10 h-10 rounded-xl bg-gray-50 border-gray-200 focus:bg-white transition-all w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2 w-full md:w-auto justify-end">
                <ImportCandidatesDialog 
                  jobId={selectedJobId} 
                  onImportComplete={() => triggerAnalysis(false)} 
                />
                <Button 
                  onClick={() => triggerAnalysis(false)} 
                  disabled={analyzing || !selectedJobId}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-900/20"
                >
                  {analyzing ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Analisi in corso...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Analizza CV
                    </>
                  )}
                </Button>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button disabled={!selectedJobId} className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-lg shadow-gray-900/20">
                      <Upload className="mr-2 h-4 w-4" />
                      Aggiungi
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-[20px]">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold">Aggiungi Candidato</DialogTitle>
                      <DialogDescription>
                        Inserisci i dati del candidato e carica il CV
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUploadCandidate} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Nome Completo *</Label>
                        <Input
                          id="full_name"
                          value={formData.full_name}
                          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                          placeholder="Mario Rossi"
                          required
                          className="rounded-xl"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="mario.rossi@email.com"
                          required
                          className="rounded-xl"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefono</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="+39 333 1234567"
                          className="rounded-xl"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location">Località</Label>
                        <Input
                          id="location"
                          value={formData.location}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                          placeholder="Milano, Italia"
                          className="rounded-xl"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="cv_file">CV (PDF)</Label>
                        <Input
                          id="cv_file"
                          type="file"
                          accept=".pdf"
                          onChange={(e) => setFormData({ ...formData, cv_file: e.target.files?.[0] || null })}
                          className="rounded-xl file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:mr-4 hover:file:bg-gray-200"
                        />
                        <p className="text-xs text-muted-foreground">
                          Carica il curriculum in formato PDF
                        </p>
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-xl">
                          Annulla
                        </Button>
                        <Button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl">Aggiungi</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Job Selection & Details (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Job Selection List */}
            <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] bg-white top-4 p-4">
              <h3 className="text-lg font-semibold text-gray-900 ml-2">Posizioni Aperte</h3>
              <div className="space-y-3 max-h-[400px] overflow-y-auto p-2 custom-scrollbar mt-3">
                {jobPostings.map((job) => (
                  <Card 
                    key={job.id} 
                    className={`cursor-pointer transition-all duration-200 border-none shadow-sm hover:shadow-md ${
                      selectedJobId === job.id ? "ring-2 ring-gray-900 bg-gray-900 text-white" : "bg-gray-100 hover:bg-gray-50"
                    }`}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <CardContent className="p-4">
                      <h3 className={`font-semibold text-sm mb-1 ${selectedJobId === job.id ? "text-white" : "text-gray-900"}`}>
                        {job.title}
                      </h3>
                      <div className={`flex items-center gap-2 text-xs ${selectedJobId === job.id ? "text-gray-300" : "text-gray-500"}`}>
                        <MapPin className="h-3 w-3" />
                        {job.location}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </Card>

            {/* Selected Job Details */}
            {selectedJob && (
              <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] bg-white sticky top-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-gray-500" />
                    Dettagli
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">Descrizione</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{selectedJob.description}</p>
                  </div>
                  
                  <div className="border-t pt-4">
                    <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">Requisiti</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{selectedJob.requirements}</p>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">Competenze</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedJob.required_skills?.map((skill: string, idx: number) => (
                        <Badge key={idx} variant="secondary" className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 border-none">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: Candidates List (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white p-6 rounded-[20px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] min-h-[500px]">
              {loading ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Caricamento...</p>
                </div>
              ) : !selectedJobId ? (
                <div className="text-center py-12">
                  <Briefcase className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-gray-900">Nessuna posizione selezionata</h3>
                  <p className="text-gray-500">
                    Seleziona una posizione per visualizzare i candidati
                  </p>
                </div>
              ) : candidates.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-gray-900">Nessun candidato trovato</h3>
                  <p className="text-gray-500 mb-4">
                    {debouncedSearchQuery ? "Prova a modificare i filtri di ricerca" : "Aggiungi il primo candidato per questa posizione"}
                  </p>
                  {debouncedSearchQuery && (
                    <Button variant="outline" onClick={() => setSearchQuery("")}>
                      Reset ricerca
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-4">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="group flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer bg-white"
                      onClick={() => navigate(`/candidate/${candidate.id}`, { state: { jobId: selectedJobId } })}
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-semibold text-lg">
                          {candidate.full_name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">{candidate.full_name}</h4>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {candidate.email}
                            </span>
                            {candidate.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {candidate.phone}
                              </span>
                            )}
                            {candidate.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {candidate.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden md:block">
                          <div className="text-sm font-medium text-gray-900">
                            {candidate.years_of_experience !== null ? `${candidate.years_of_experience} anni exp` : "Exp N/A"}
                          </div>
                          <div className="text-xs text-gray-400">
                            {new Date(candidate.created_at).toLocaleDateString("it-IT")}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 items-end min-w-[100px]">
                          {getScoreBadge(candidate.overall_score)}
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Questa azione non può essere annullata. Il candidato verrà rimosso permanentemente dal database e da tutte le comparazioni.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={(e) => handleDeleteCandidate(candidate.id, e)}
                              >
                                Elimina
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Candidates;
