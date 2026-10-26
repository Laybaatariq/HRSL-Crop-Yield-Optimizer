const PROGRESS_KEY = "agrismart_feature_progress";

export type FeatureProgress = {
  yieldTrends: boolean;
  makePrediction: boolean;
  chatWithAI: boolean;
  aiRecommendations: boolean;
};

export const getProgress = (): FeatureProgress => {
  const saved = localStorage.getItem(PROGRESS_KEY);
  if (saved) {
    return JSON.parse(saved);
  }
  return {
    yieldTrends: false,
    makePrediction: false,
    chatWithAI: false,
    aiRecommendations: false,
  };
};

export const markFeatureComplete = (feature: keyof FeatureProgress) => {
  const progress = getProgress();
  progress[feature] = true;
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  
  // Dispatch custom event to notify Dashboard
  window.dispatchEvent(new CustomEvent("progressUpdate", { detail: progress }));
};
