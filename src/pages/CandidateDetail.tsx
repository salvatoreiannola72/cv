import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Mail, Phone, MapPin, Briefcase, GraduationCap, FileText, Download, ExternalLink, CheckCircle, ThumbsUp, ThumbsDown, AlertTriangle, Check, Trash2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

interface CandidateDetail {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  current_status: string;
  years_of_experience: number | null;
  education_level: string | null;
  skills: string[] | null;
  cv_file_url: string | null;
}

interface CandidateScore {
  id: string;
  job_posting_id: string;
  overall_score: number;
  education_score: number;
  experience_score: number;
  skills_score: number;
  location_score: number;
  score_details: any;
  job_posting: {
    title: string;
  };
}

const CandidateDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [scores, setScores] = useState<CandidateScore[]>([]);
  const [selectedScore, setSelectedScore] = useState<CandidateScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedCvUrl, setSignedCvUrl] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadCandidateData();
    }
  }, [id]);

  useEffect(() => {
    const generateSignedUrl = async () => {
      if (candidate?.cv_file_url) {
        try {
          // Check if it's a Supabase storage URL and extract path
          // Typical format: .../storage/v1/object/public/cv-files/path/to/file
          if (candidate.cv_file_url.includes('/cv-files/')) {
            const path = candidate.cv_file_url.split('/cv-files/')[1];
            if (path) {
              // Generate signed URL valid for 1 hour
              const { data, error } = await supabase.storage
                .from('cv-files')
                .createSignedUrl(path, 3600);

              if (error) throw error;
              if (data?.signedUrl) {
                setSignedCvUrl(data.signedUrl);
                return;
              }
            }
          }
        } catch (error) {
          console.error("Error generating signed URL:", error);
        }
        // Fallback to original URL
        setSignedCvUrl(candidate.cv_file_url);
      } else {
        setSignedCvUrl(null);
      }
    };

    generateSignedUrl();
  }, [candidate]);

  const loadCandidateData = async () => {
    try {
      // Fetch candidate info
      const { data: candidateData, error: candidateError } = await supabase
        .from("candidates")
        .select("*")
        .eq("id", id)
        .single();

      if (candidateError) throw candidateError;
      setCandidate(candidateData);

      // Fetch scores with job details
      const { data: scoreData, error: scoreError } = await supabase
        .from("candidate_scores")
        .select(`
          *,
          job_posting:job_postings(title)
        `)
        .eq("candidate_id", id);

      if (!scoreError && scoreData) {
        const scoresList = scoreData as unknown as CandidateScore[];
        // Sort by overall_score descending
        scoresList.sort((a, b) => b.overall_score - a.overall_score);
        
        setScores(scoresList);
        
        // Check for jobId in navigation state
        const stateJobId = location.state?.jobId;
        
        if (scoresList.length > 0) {
          let scoreToSelect: CandidateScore | undefined;

          if (stateJobId) {
            scoreToSelect = scoresList.find(s => s.job_posting_id === stateJobId);
          }

          if (!scoreToSelect) {
             // Default to the highest score (first in list)
             scoreToSelect = scoresList[0];
          }
          
          setSelectedScore(scoreToSelect);
        }
      }
    } catch (error) {
      console.error("Errore caricamento dati:", error);
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile caricare i dettagli del candidato",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCandidate = async () => {
    if (!candidate) return;

    try {
      // Delete scores first
      const { error: scoresError } = await supabase
        .from("candidate_scores")
        .delete()
        .eq("candidate_id", candidate.id);

      if (scoresError) console.error("Error deleting scores:", scoresError);

      // Delete status history
      const { error: historyError } = await supabase
        .from("candidate_status_history")
        .delete()
        .eq("candidate_id", candidate.id);

      if (historyError) console.error("Error deleting history:", historyError);

      // Delete candidate
      const { error } = await supabase
        .from("candidates")
        .delete()
        .eq("id", candidate.id);

      if (error) throw error;

      toast({
        title: "Candidato eliminato",
        description: "Il candidato è stato rimosso con successo",
      });

      navigate("/candidates");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile eliminare il candidato",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      new: { label: "Nuovo", className: "bg-blue-100 text-blue-700" },
      to_contact: { label: "Da Contattare", className: "bg-yellow-100 text-yellow-700" },
      contacted: { label: "Contattato", className: "bg-purple-100 text-purple-700" },
      interviewed: { label: "Intervistato", className: "bg-green-100 text-green-700" },
      rejected: { label: "Rifiutato", className: "bg-red-100 text-red-700" },
      hired: { label: "Assunto", className: "bg-gray-900 text-white" },
    };

    return (
      <Badge className={`${config[status]?.className || ""} border-none shadow-none text-sm px-3 py-1`}>
        {config[status]?.label || status}
      </Badge>
    );
  };

  const analysis = selectedScore?.score_details || {};

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-100px)]">
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!candidate) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] gap-4">
          <h2 className="text-xl font-semibold">Candidato non trovato</h2>
          <Button onClick={() => navigate("/candidates")}>Torna alla lista</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        
        {/* Top Section: Profile, Contacts, Score Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1: Profile Info */}
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full mt-3 shrink-0 -ml-14">
              <ArrowLeft className="h-6 w-6" />
            </Button>
            
            <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] h-full flex-1">
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">{candidate.full_name}</h1>
                    <div className="flex items-center gap-2 text-gray-500 text-base">
                      <Briefcase className="h-4 w-4" />
                      <span className="font-medium">
                        {selectedScore ? selectedScore.job_posting?.title : "Nessuna valutazione"}
                      </span>
                    </div>
                    <div className="mt-3">
                      {getStatusBadge(candidate.current_status)}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-600 hover:bg-red-50 -mr-2 -mt-2">
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Questa azione non può essere annullata. Il candidato verrà rimosso permanentemente dal database e da tutte le comparazioni.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={handleDeleteCandidate}
                        >
                          Elimina
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {signedCvUrl && (
                  <Button variant="outline" className="rounded-xl gap-2 w-full sm:w-auto" asChild>
                    <a href={signedCvUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4" />
                      Scarica CV
                    </a>
                  </Button>
                )}
              </div>
            </Card>
          </div>

          {/* Column 2: Contacts */}
          <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Contatti & Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 text-gray-600">
                <Mail className="h-4 w-4" />
                <a href={`mailto:${candidate.email}`} className="hover:text-primary transition-colors truncate">
                  {candidate.email}
                </a>
              </div>
              {candidate.phone && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Phone className="h-4 w-4" />
                  <a href={`tel:${candidate.phone}`} className="hover:text-primary transition-colors">
                    {candidate.phone}
                  </a>
                </div>
              )}
              {candidate.location && (
                <div className="flex items-center gap-3 text-gray-600">
                  <MapPin className="h-4 w-4" />
                  <span>{candidate.location}</span>
                </div>
              )}
              <div className="border-t pt-4 mt-2 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Esperienza</span>
                  <span className="font-medium">{candidate.years_of_experience || 0} anni</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Istruzione</span>
                  <span className="font-medium truncate max-w-[150px] text-right">{candidate.education_level || "N/A"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Column 3: Score Details */}
          {selectedScore ? (
            <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold">Dettaglio Punteggi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                   <div className={`
                      relative flex items-center justify-center w-16 h-16 rounded-full border-4 shrink-0
                      ${selectedScore.overall_score >= 80 ? "border-green-100 bg-green-50" : 
                        selectedScore.overall_score >= 60 ? "border-yellow-100 bg-yellow-50" : "border-red-100 bg-red-50"}
                    `}>
                      <span className={`text-xl font-bold ${
                        selectedScore.overall_score >= 80 ? "text-green-700" : 
                        selectedScore.overall_score >= 60 ? "text-yellow-700" : "text-red-700"
                      }`}>
                        {selectedScore.overall_score.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Exp</span>
                          <span>{selectedScore.experience_score}%</span>
                        </div>
                        <Progress value={selectedScore.experience_score} className="h-1.5 bg-gray-100" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Skills</span>
                          <span>{selectedScore.skills_score}%</span>
                        </div>
                        <Progress value={selectedScore.skills_score} className="h-1.5 bg-gray-100" />
                      </div>
                    </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-full border-2 border-dashed border-gray-200 rounded-[20px] text-gray-400">
              Seleziona una posizione
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Job Selection & Skills */}
          <div className="space-y-6">
            {/* Job Match Selection */}
            {scores.length > 0 && (
              <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px]">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Valutazioni per Posizione</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {scores.map((score) => (
                    <div
                      key={score.id}
                      onClick={() => setSelectedScore(score)}
                      className={`p-3 rounded-xl cursor-pointer transition-colors flex justify-between items-center ${
                        selectedScore?.id === score.id ? "bg-gray-900 text-white" : "bg-gray-50 hover:bg-gray-100 text-gray-900"
                      }`}
                    >
                      <span className="font-medium text-sm truncate max-w-[180px]">{score.job_posting?.title}</span>
                      <span className={`font-bold ${selectedScore?.id === score.id ? "text-white" : "text-gray-900"}`}>
                        {score.overall_score}%
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px]">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Competenze</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {candidate.skills.map((skill, idx) => (
                      <Badge key={idx} variant="secondary" className="rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: Analysis & CV */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Professional Summary */}
            <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] bg-gradient-to-br from-white to-gray-50">
              <CardHeader>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-700" />
                  Riepilogo Professionale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  {analysis.summary || "Seleziona una posizione per vedere l'analisi."}
                </p>
              </CardContent>
            </Card>

            {/* Flags Section */}
            {selectedScore && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] bg-green-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-md font-semibold text-green-800 flex items-center gap-2">
                      <ThumbsUp className="h-5 w-5 text-green-600" />
                      Green Flags
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.green_flags?.map((flag: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-green-700">
                          <Check className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>{flag}</span>
                        </li>
                      )) || <p className="text-sm text-gray-500">Nessun green flag rilevato.</p>}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] bg-red-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-md font-semibold text-red-800 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      Red Flags
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.red_flags?.map((flag: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-red-700">
                          <ThumbsDown className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>{flag}</span>
                        </li>
                      )) || <p className="text-sm text-gray-500">Nessun red flag rilevato.</p>}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Detailed Analysis Grid */}
            {selectedScore && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px]">
                  <CardHeader>
                    <CardTitle className="text-md font-semibold text-gray-900 flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-blue-500" />
                      Analisi Esperienza
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {analysis.experience_analysis || "Analisi non disponibile."}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px]">
                  <CardHeader>
                    <CardTitle className="text-md font-semibold text-gray-900 flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-purple-500" />
                      Analisi Istruzione
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {analysis.education_analysis || "Analisi non disponibile."}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px]">
                  <CardHeader>
                    <CardTitle className="text-md font-semibold text-gray-900 flex items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-green-500" />
                      Analisi Competenze
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {analysis.skills_analysis || "Analisi non disponibile."}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] bg-blue-50/50">
                  <CardHeader>
                    <CardTitle className="text-md font-semibold text-blue-900 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                      Match con la Posizione
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-blue-800 leading-relaxed">
                      {analysis.match_reasoning || "Analisi non disponibile."}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* CV Preview */}
            <Card className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] overflow-hidden h-[600px]">
              <CardHeader className="border-b bg-gray-50/50">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg font-semibold">Curriculum Vitae</CardTitle>
                  {signedCvUrl && (
                    <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700" asChild>
                      <a href={signedCvUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Apri in nuova scheda
                      </a>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 h-full bg-gray-100">
                {signedCvUrl ? (
                  <iframe 
                    src={signedCvUrl} 
                    className="w-full h-full" 
                    title="CV Preview"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <FileText className="h-16 w-16 mb-4 opacity-20" />
                    <p>Nessun CV disponibile per l'anteprima</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CandidateDetail;
