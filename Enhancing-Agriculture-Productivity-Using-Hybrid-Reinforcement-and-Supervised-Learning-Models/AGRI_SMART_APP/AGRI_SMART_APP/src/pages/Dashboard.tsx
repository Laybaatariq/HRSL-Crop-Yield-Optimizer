import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Sprout, Calendar, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { getProgress, type FeatureProgress } from "@/lib/progress-tracker";

const PROGRESS_KEY = "agrismart_feature_progress";

const Dashboard = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    totalPredictions: 0,
    avgYield: 0,
  });

  const [progress, setProgress] = useState<FeatureProgress>({
    yieldTrends: false,
    makePrediction: false,
    chatWithAI: false,
    aiRecommendations: false,
  });

  useEffect(() => {
    // Load progress from localStorage
    setProgress(getProgress());

    // Listen for progress updates
    const handleProgressUpdate = (e: CustomEvent<FeatureProgress>) => {
      setProgress(e.detail);
    };

    window.addEventListener("progressUpdate", handleProgressUpdate as EventListener);
    return () => window.removeEventListener("progressUpdate", handleProgressUpdate as EventListener);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      const { data: predictions } = await supabase
        .from("yield_predictions")
        .select("predicted_yield");

      if (predictions) {
        const total = predictions.length;
        const avg = predictions.reduce((sum, p) => sum + (p.predicted_yield || 0), 0) / total || 0;
        setStats({
          totalPredictions: total,
          avgYield: Number(avg.toFixed(2)),
        });
      }
    };

    fetchStats();
  }, []);

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">
            {t('dashboard.welcome')}
          </h1>
          <p className="text-muted-foreground">
            {t('app.tagline')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-3">
              <CardDescription>{t('dashboard.totalPredictions')}</CardDescription>
              <CardTitle className="text-3xl">{stats.totalPredictions}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BarChart3 className="h-4 w-4" />
                <span>{t('dashboard.allTime')}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-accent">
            <CardHeader className="pb-3">
              <CardDescription>{t('dashboard.avgYield')}</CardDescription>
              <CardTitle className="text-3xl">{stats.avgYield}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span>{t('dashboard.tonsPerHectare')}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-secondary">
            <CardHeader className="pb-3">
              <CardDescription>{t('dashboard.activeCrops')}</CardDescription>
              <CardTitle className="text-3xl">7</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sprout className="h-4 w-4" />
                <span>{t('dashboard.currentlyMonitored')}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-agricultural-sky">
            <CardHeader className="pb-3">
              <CardDescription>{t('dashboard.seasonStatus')}</CardDescription>
              <CardTitle className="text-3xl">{t('dashboard.active')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{t('dashboard.plantingSeason')}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {t('dashboard.quickInsights')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                <div className="h-2 w-2 rounded-full bg-primary mt-2" />
                <div>
                  <p className="font-medium">{t('dashboard.yieldTrendsAnalysis')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('dashboard.yieldTrendsDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                <div className="h-2 w-2 rounded-full bg-accent mt-2" />
                <div>
                  <p className="font-medium">{t('dashboard.aiPoweredPredictions')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('dashboard.aiPredictionsDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                <div className="h-2 w-2 rounded-full bg-secondary mt-2" />
                <div>
                  <p className="font-medium">{t('dashboard.aiChatbot')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('dashboard.aiChatbotDesc')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sprout className="h-5 w-5 text-primary" />
                {t('dashboard.gettingStarted')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('dashboard.exploreYieldTrends')}</span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.viewData')}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full bg-primary transition-all duration-500 ${progress.yieldTrends ? 'w-full' : 'w-0'}`} />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('dashboard.makePrediction')}</span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.getInsights')}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full bg-primary transition-all duration-500 ${progress.makePrediction ? 'w-full' : 'w-0'}`} />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('dashboard.getRecommendations')}</span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.tryFeature')}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full bg-primary transition-all duration-500 ${progress.aiRecommendations ? 'w-full' : 'w-0'}`} />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('dashboard.chatWithAI')}</span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.askQuestions')}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full bg-primary transition-all duration-500 ${progress.chatWithAI ? 'w-full' : 'w-0'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
