import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowLeft, Briefcase, MapPin, Pencil, Trash2 } from "lucide-react";
import { z } from "zod";

const jobPostingSchema = z.object({
  title: z.string().min(3, "Titolo troppo corto").max(100),
  description: z.string().min(10, "Descrizione troppo corta"),
  requirements: z.string().min(10, "Requisiti richiesti"),
  location: z.string().min(2, "Località richiesta"),
  employment_type: z.enum(["full-time", "part-time", "contract", "internship"]),
  required_experience_years: z.number().min(0).max(50),
  required_skills: z.array(z.string()),
});

interface JobPosting {
  id: string;
  title: string;
  description: string;
  requirements: string;
  location: string;
  employment_type: string;
  status: string;
  required_experience_years: number;
  required_skills: string[];
  salary_range: string | null;
  created_at: string;
}

import DashboardLayout from "@/components/layout/DashboardLayout";

const JobPostings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    requirements: "",
    location: "",
    employment_type: "full-time",
    salary_range: "",
    required_experience_years: "0",
    required_skills: "",
  });

  useEffect(() => {
    checkAuth();
    loadJobPostings();
  }, []);

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
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setJobPostings(data || []);
    } catch (error) {
      console.error("Errore caricamento posizioni:", error);
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile caricare le posizioni",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveJobPosting = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const skillsArray = formData.required_skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const validatedData = jobPostingSchema.parse({
        ...formData,
        required_experience_years: parseInt(formData.required_experience_years),
        required_skills: skillsArray,
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utente non autenticato");

      if (editingId) {
        // Update existing job
        const { error } = await supabase
          .from("job_postings")
          .update({
            title: validatedData.title,
            description: validatedData.description,
            requirements: validatedData.requirements,
            location: validatedData.location,
            employment_type: validatedData.employment_type,
            required_experience_years: validatedData.required_experience_years,
            required_skills: validatedData.required_skills,
            salary_range: formData.salary_range || null,
          })
          .eq("id", editingId);

        if (error) throw error;

        toast({
          title: "Posizione aggiornata",
          description: "La posizione è stata modificata con successo",
        });
      } else {
        // Create new job
        const { error } = await supabase.from("job_postings").insert([
          {
            title: validatedData.title,
            description: validatedData.description,
            requirements: validatedData.requirements,
            location: validatedData.location,
            employment_type: validatedData.employment_type,
            required_experience_years: validatedData.required_experience_years,
            required_skills: validatedData.required_skills,
            salary_range: formData.salary_range || null,
            created_by: user.id,
          },
        ]);

        if (error) throw error;

        toast({
          title: "Posizione creata",
          description: "La posizione è stata pubblicata con successo",
        });
      }

      setDialogOpen(false);
      setEditingId(null);
      loadJobPostings();
      resetForm();
      
      // Reset analysis flag so it runs again when viewing candidates
      sessionStorage.removeItem("initialAnalysisRun");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message || "Errore nel salvataggio della posizione",
      });
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Sei sicuro di voler eliminare questa posizione?")) return;

    try {
      const { error } = await supabase
        .from("job_postings")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Posizione eliminata",
        description: "La posizione è stata rimossa con successo",
      });
      loadJobPostings();
    } catch (error) {
      console.error("Errore eliminazione:", error);
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile eliminare la posizione",
      });
    }
  };

  const handleEdit = (job: JobPosting, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(job.id);
    setFormData({
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      location: job.location,
      employment_type: job.employment_type,
      salary_range: job.salary_range || "",
      required_experience_years: job.required_experience_years.toString(),
      required_skills: (job.required_skills || []).join(", "),
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      requirements: "",
      location: "",
      employment_type: "full-time",
      salary_range: "",
      required_experience_years: "0",
      required_skills: "",
    });
    setEditingId(null);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      open: "bg-green-100 text-green-700 hover:bg-green-100",
      draft: "bg-gray-100 text-gray-700 hover:bg-gray-100",
      closed: "bg-red-100 text-red-700 hover:bg-red-100",
      filled: "bg-blue-100 text-blue-700 hover:bg-blue-100",
    };

    return (
      <Badge className={`${variants[status] || ""} border-none shadow-none`}>
        {status === "open" ? "Aperta" : status === "draft" ? "Bozza" : status === "closed" ? "Chiusa" : "Coperta"}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Posizioni Aperte</h2>
            <p className="text-gray-500 mt-2">Gestisci le offerte di lavoro</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl px-6">
                <Plus className="mr-2 h-4 w-4" />
                Nuova Posizione
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-[20px]">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">
                  {editingId ? "Modifica Posizione" : "Crea Nuova Posizione"}
                </DialogTitle>
                <DialogDescription>
                  Inserisci i dettagli della posizione da pubblicare
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveJobPosting} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Titolo Posizione *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="es. Senior Frontend Developer"
                    required
                    className="rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location">Località *</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="es. Milano, Italia"
                      required
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employment_type">Tipo Contratto *</Label>
                    <Select
                      value={formData.employment_type}
                      onValueChange={(value) => setFormData({ ...formData, employment_type: value })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="full-time">Tempo Pieno</SelectItem>
                        <SelectItem value="part-time">Part-Time</SelectItem>
                        <SelectItem value="contract">Contratto</SelectItem>
                        <SelectItem value="internship">Stage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="experience">Anni Esperienza *</Label>
                    <Input
                      id="experience"
                      type="number"
                      min="0"
                      max="50"
                      value={formData.required_experience_years}
                      onChange={(e) => setFormData({ ...formData, required_experience_years: e.target.value })}
                      required
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salary">Range Salariale</Label>
                    <Input
                      id="salary"
                      value={formData.salary_range}
                      onChange={(e) => setFormData({ ...formData, salary_range: e.target.value })}
                      placeholder="es. 40-60k €"
                      className="rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrizione *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrivi la posizione, responsabilità, ambiente di lavoro..."
                    rows={4}
                    required
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requirements">Requisiti *</Label>
                  <Textarea
                    id="requirements"
                    value={formData.requirements}
                    onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                    placeholder="Elenca i requisiti tecnici e soft skills necessari..."
                    rows={4}
                    required
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skills">Competenze Chiave *</Label>
                  <Input
                    id="skills"
                    value={formData.required_skills}
                    onChange={(e) => setFormData({ ...formData, required_skills: e.target.value })}
                    placeholder="React, TypeScript, Node.js (separati da virgola)"
                    required
                    className="rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    Inserisci le competenze separate da virgola
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-xl">
                    Annulla
                  </Button>
                  <Button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl">
                    {editingId ? "Salva Modifiche" : "Pubblica Posizione"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Caricamento...</p>
          </div>
        ) : jobPostings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-[20px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)]">
            <Briefcase className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-gray-900">Nessuna posizione</h3>
            <p className="text-gray-500 mb-4">
              Inizia creando la tua prima posizione aperta
            </p>
            <Button onClick={() => setDialogOpen(true)} className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Crea Prima Posizione
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {jobPostings.map((job) => (
              <Card
                key={job.id}
                className="border-none shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-[20px] hover:shadow-lg transition-all duration-300 cursor-pointer group"
                onClick={() => navigate(`/candidates?job=${job.id}`)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <CardTitle className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors">{job.title}</CardTitle>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(job.status)}
                      <div className="flex gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-blue-600"
                          onClick={(e) => handleEdit(job, e)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-red-600"
                          onClick={(e) => handleDelete(job.id, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <CardDescription className="flex items-center gap-2 text-gray-500">
                    <MapPin className="h-4 w-4" />
                    {job.location}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <span className="text-gray-500">Tipo</span>
                      <span className="font-medium text-gray-900">
                        {job.employment_type === "full-time" ? "Tempo Pieno" : 
                         job.employment_type === "part-time" ? "Part-Time" :
                         job.employment_type === "contract" ? "Contratto" : "Stage"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <span className="text-gray-500">Esperienza</span>
                      <span className="font-medium text-gray-900">{job.required_experience_years} anni</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-400">Pubblicata il</span>
                      <span className="text-xs font-medium text-gray-500">
                        {new Date(job.created_at).toLocaleDateString("it-IT")}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default JobPostings;
