import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Users, FileText, TrendingUp, ArrowRight } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

const Dashboard = () => {
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    openPositions: 0,
    totalCandidates: 0,
  });
  const [openJobs, setOpenJobs] = useState<any[]>([]);
  const [topCandidates, setTopCandidates] = useState<any[]>([]);

  useEffect(() => {
    checkAuth();
    loadDashboardData();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const loadDashboardData = async () => {
    try {
      // Fetch stats and lists in parallel
      const [jobsResponse, candidatesResponse, topCandidatesResponse] = await Promise.all([
        supabase
          .from("job_postings")
          .select("*")
          .eq("status", "open")
          .order("created_at", { ascending: false }),
        supabase
          .from("candidates")
          .select("*", { count: "exact", head: true }),
        supabase
          .from("candidate_scores")
          .select(`
            overall_score,
            candidate:candidates(id, full_name),
            job:job_postings(title)
          `)
          .order("overall_score", { ascending: false })
          .limit(10)
      ]);

      setStats({
        openPositions: jobsResponse.data?.length || 0,
        totalCandidates: candidatesResponse.count || 0,
      });

      setOpenJobs(jobsResponse.data || []);
      setTopCandidates(topCandidatesResponse.data || []);

    } catch (error) {
      console.error("Errore caricamento dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "POSIZIONI APERTE",
      value: stats.openPositions,
      icon: Briefcase,
    },
    {
      title: "CANDIDATI TOTALI",
      value: stats.totalCandidates,
      icon: Users,
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Overview</h2>
          <p className="text-gray-500 mt-2">Benvenuto nel tuo pannello di recruiting.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {statCards.map((stat) => (
            <Card key={stat.title} className="border-none shadow-sm bg-white rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-gray-500 tracking-wider">
                  {stat.title}
                </CardTitle>
                <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                  <stat.icon className="h-4 w-4 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-gray-900 mt-2">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Open Positions Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Posizioni Aperte</h3>
              <Button variant="ghost" className="text-sm text-gray-500 hover:text-gray-900" onClick={() => navigate("/job-postings")}>
                Vedi tutte <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4">
              {openJobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => navigate(`/candidates?job=${job.id}`)}
                  className="group cursor-pointer bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {job.title}
                      </h4>
                      <p className="text-sm text-gray-500 mt-1">{job.location} • {job.employment_type}</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Active
                    </span>
                  </div>
                </div>
              ))}
              {openJobs.length === 0 && (
                <div className="text-center py-8 text-gray-500 bg-white rounded-xl border border-dashed border-gray-200">
                  Nessuna posizione aperta
                </div>
              )}
            </div>
          </div>

          {/* Top Candidates Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Top Candidates</h3>
              <Button variant="ghost" className="text-sm text-gray-500 hover:text-gray-900" onClick={() => navigate("/candidates")}>
                Vedi tutti <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-100">
                {topCandidates.map((item: any, index: number) => (
                  <div
                    key={index}
                    onClick={() => navigate(`/candidate/${item.candidate.id}`)}
                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold">
                        {item.candidate.full_name?.charAt(0) || "?"}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{item.candidate.full_name}</h4>
                        <p className="text-xs text-gray-500">
                          {item.job?.title || "Posizione sconosciuta"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {item.overall_score !== null && (
                        <div className="flex items-center gap-1">
                          <span className={`text-sm font-bold ${
                            item.overall_score >= 80 ? "text-green-600" :
                            item.overall_score >= 60 ? "text-yellow-600" : "text-gray-600"
                          }`}>
                            {item.overall_score}%
                          </span>
                        </div>
                      )}
                      <ArrowRight className="h-4 w-4 text-gray-300" />
                    </div>
                  </div>
                ))}
                {topCandidates.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    Nessun candidato trovato
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
