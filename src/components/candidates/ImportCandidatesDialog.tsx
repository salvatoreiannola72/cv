import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, FolderOpen, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface ImportCandidatesDialogProps {
  jobId?: string;
  onImportComplete: () => void;
}

export function ImportCandidatesDialog({ jobId, onImportComplete }: ImportCandidatesDialogProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        (file) => file.type === "application/pdf"
      );
      setFiles(selectedFiles);
      
      if (selectedFiles.length === 0) {
        toast({
          variant: "destructive",
          title: "Nessun PDF trovato",
          description: "La cartella selezionata non contiene file PDF.",
        });
      } else {
        toast({
          title: "File trovati",
          description: `Trovati ${selectedFiles.length} file PDF pronti per l'importazione.`,
        });
      }
    }
  };

  const handleImport = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setProgress(0);
    setCurrentFileIndex(0);

    let successCount = 0;
    let errorCount = 0;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utente non autenticato");

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileIndex(i);
        
        try {
          // 1. Upload file to Storage
          const fileExt = file.name.split(".").pop();
          const fileName = `${user.id}/${Date.now()}_${i}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from("cv-files")
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from("cv-files")
            .getPublicUrl(fileName);

          // 2. Create Candidate record
          // Extract name from filename (remove extension and underscores)
          const candidateName = file.name
            .replace(/\.[^/.]+$/, "")
            .replace(/[_-]/g, " ");

          const { error: dbError } = await supabase.from("candidates").insert([
            {
              job_posting_id: jobId || null, // Allow null for general import
              full_name: candidateName, // Temporary name from filename
              email: "da_verificare@example.com", // Placeholder
              cv_file_url: publicUrl,
              added_by: user.id,
              current_status: "new",
            },
          ]);

          if (dbError) throw dbError;
          successCount++;

        } catch (error) {
          console.error(`Errore importazione ${file.name}:`, error);
          errorCount++;
        }

        setProgress(((i + 1) / files.length) * 100);
      }

      toast({
        title: "Importazione completata",
        description: `${successCount} candidati importati con successo. ${errorCount > 0 ? `${errorCount} errori.` : ""}`,
        variant: errorCount > 0 ? "destructive" : "default",
      });

      setFiles([]);
      setOpen(false);
      onImportComplete();

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore critico",
        description: error.message || "Si è verificato un errore durante l'importazione.",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-xl gap-2">
          <FolderOpen className="h-4 w-4" />
          Importa Cartella
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Importa Candidati</DialogTitle>
          <DialogDescription>
            Carica massivamente i CV da una cartella locale o da Google Drive.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="local" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="local" className="rounded-lg">Computer</TabsTrigger>
            <TabsTrigger value="drive" className="rounded-lg">Google Drive</TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="space-y-6 py-4">
            <div 
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                // @ts-ignore - webkitdirectory is not standard but supported
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderSelect}
              />
              <div className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-2">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-lg">Seleziona una cartella</h3>
                <p className="text-sm text-muted-foreground">
                  Clicca per sfogliare le cartelle del tuo computer.
                  <br />
                  Verranno importati solo i file PDF.
                </p>
              </div>
            </div>

            {files.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm text-gray-700">
                    File trovati ({files.length})
                  </h4>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setFiles([])}
                    disabled={uploading}
                  >
                    Rimuovi tutti
                  </Button>
                </div>

                <div className="max-h-48 overflow-y-auto border rounded-xl p-2 space-y-2 bg-gray-50">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-100 text-sm">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      {uploading && idx < currentFileIndex && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {uploading && idx === currentFileIndex && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    </div>
                  ))}
                </div>

                {uploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Importazione in corso...</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}

                <Button 
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl py-6"
                  onClick={handleImport}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importazione in corso...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Avvia Importazione
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="drive" className="py-8 text-center space-y-4">
            <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
              <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                <svg className="w-8 h-8" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.9 2.5 3.2 3.3l12.3-21.3-6.5-11.3-12.85 22.65c-.7 1.25-1.1 2.65-1.1 4.1s.4 2.85 1.1 4.1z" fill="#0066da"/>
                  <path d="m43.65 25-12.3-21.3c-1.3.8-2.4 1.9-3.2 3.3l-12.85 22.3c-.7 1.25-1.1 2.65-1.1 4.1s.4 2.85 1.1 4.1l6.5 11.3 21.85-37.9z" fill="#00ac47"/>
                  <path d="m73.55 76.8c1.4-.8 2.5-1.9 3.2-3.3l12.85-22.3c.7-1.25 1.1-2.65 1.1-4.1s-.4-2.85-1.1-4.1l-6.5-11.3-21.4 37.1 11.85 7.9z" fill="#ea4335"/>
                  <path d="m43.65 25 21.85 37.9 6.5 11.3-11.85-7.9-10-6.65-6.5-11.3-6.5-11.3z" fill="#00832d"/>
                  <path d="m43.65 25-21.85-37.9-12.3 21.3 12.85 22.3 10 6.65 11.3-12.35z" fill="#2684fc"/>
                  <path d="m6.6 66.85 21.4-37.1 10 6.65-11.3 12.35-10 18.1z" fill="#ffba00"/>
                </svg>
              </div>
              <h3 className="font-semibold text-lg">Connetti Google Drive</h3>
              <p className="text-sm text-muted-foreground">
                Per importare file da Google Drive, è necessario configurare l'integrazione.
              </p>
              
              <div className="w-full bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-left">
                <div className="flex gap-2 text-yellow-800 font-medium mb-1">
                  <AlertCircle className="h-5 w-5" />
                  Configurazione Richiesta
                </div>
                <p className="text-xs text-yellow-700">
                  Questa funzionalità richiede una API Key e un Client ID di Google Cloud Platform.
                </p>
              </div>

              <Button className="w-full rounded-xl" disabled>
                Connetti Account Google (Presto disponibile)
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
