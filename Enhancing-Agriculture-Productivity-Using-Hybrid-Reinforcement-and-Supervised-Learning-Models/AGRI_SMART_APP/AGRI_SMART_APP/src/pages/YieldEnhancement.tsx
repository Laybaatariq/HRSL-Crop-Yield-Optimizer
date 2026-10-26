import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { client } from "@gradio/client";
import { RegionalMap } from "@/components/RegionalMap";
import { markFeatureComplete } from "@/lib/progress-tracker";

interface CropData {
  Crop: string;
  District: string;
  Province: string;
}

// Crop-district mapping from RL recommendations backend
const CROP_DISTRICTS: Record<string, string[]> = {
  'Cotton': ['Bahawalpur', 'D.G. Khan', 'Ghotki', 'Hyderabad', 'Khairpur',
            'Khanewal', 'Mirpurkhas', 'Multan', 'Rahimyar Khan', 'Sukkur', 'Thatta'],
  'Wheat': ['Charsadda', 'Chiniot', 'Dir Upper', 'Gujranwala', 'Gujrat',
           'Hafizabad', 'Jhang', 'Lahore', 'Mirpurkhas', 'Nankana Sahib',
           'Narowal', 'Peshawar', 'Rahimyar Khan', 'Sargodha', 'Shangla',
           'Sheikhupura', 'Sialkot', 'Turbat', 'Wazirabad'],
  'Rice': ['Rahimyar Khan', 'Sargodha', 'Turbat', 'kasur', 'Larkana',
          'Gujranwala', 'Sheikhupura', 'Hafizabad', 'Sialkot'],
  'Potato': ['Bahawalpur', 'Chitral', 'Khanewal', 'Mardan', 'Multan',
            'Pishin', 'Quetta', 'Rahimyar Khan'],
  'Tomato': ['Bahawalpur', 'Chitral', 'D.G. Khan', 'Hyderabad', 'Khanewal',
            'Mardan', 'Mirpurkhas', 'Multan', 'Pishin', 'Quetta',
            'Rahimyar Khan', 'Thatta'],
  'Sugarcane': ['D.G. Khan', 'Ghotki', 'Hyderabad', 'Khairpur', 'Khanewal',
               'Mirpurkhas', 'Multan', 'Sargodha', 'Sukkur', 'Thatta']
};

// Crop season and typical growing months
const CROP_SEASON_INFO: Record<string, { 
  season: 'Rabi' | 'Kharif', 
  sowingMonths: number[], 
  harvestingMonths: number[] 
}> = {
  'Wheat': { season: 'Rabi', sowingMonths: [10, 11, 12], harvestingMonths: [3, 4, 5] },
  'Potato': { season: 'Rabi', sowingMonths: [10, 11, 12], harvestingMonths: [3, 4, 5] },
  'Tomato': { season: 'Rabi', sowingMonths: [10, 11, 12], harvestingMonths: [3, 4, 5] },
  'Rice': { season: 'Kharif', sowingMonths: [4, 5, 6], harvestingMonths: [9, 10] },
  'Sugarcane': { season: 'Kharif', sowingMonths: [4, 5, 6], harvestingMonths: [9, 10] },
  'Cotton': { season: 'Kharif', sowingMonths: [4, 5, 6], harvestingMonths: [9, 10] }
};

const YieldEnhancement = () => {
  const [formData, setFormData] = useState({
    province: "",
    district: "",
    crop: "",
    season: "",
    sowingDate: undefined as Date | undefined,
    harvestingDate: undefined as Date | undefined,
    year: new Date().getFullYear(),
    area: "",
    temperature: "",
    rainfall: "",
    phosphorus: "",
    potassium: "",
    soilPH: "",
    ndvi: "",
  });
  const [csvDataset, setCsvDataset] = useState<CropData[]>([]);
  const [prediction, setPrediction] = useState<{
    totalProduction: number;
    yieldPerHectare: number;
    confidenceLevel: number;
    predictionRange: { min: number; max: number };
    analysisText: string;
    modelAccuracy: number;
  } | null>(null);
  const [recommendations, setRecommendations] = useState<{
    yieldProjection?: {
      totalYield: number;
      yieldPerHectare: number;
      marketPrice?: string;
    };
    phases?: Array<{
      name: string;
      recommendations: Array<{ label: string; value: string }>;
    }>;
    financialAnalysis?: Array<{ label: string; value: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch('/CROP-DISTRICT-PROVINCE.xlsx')
      .then(response => response.arrayBuffer())
      .then(buffer => {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet) as CropData[];
        setCsvDataset(data);
      });
  }, []);

  // Reset crop if Wheat is selected when switching to Balochistan
  useEffect(() => {
    if (formData.province === "Balochistan" && formData.crop === "Wheat") {
      setFormData(prev => ({ ...prev, crop: "", district: "" }));
    }
  }, [formData.province]);

  const provinces = useMemo(() => {
    if (csvDataset.length === 0) return [];
    const uniqueProvinces = csvDataset.map((row) => row.Province);
    return [...new Set(uniqueProvinces)].sort();
  }, [csvDataset]);

  const crops = useMemo(() => {
    if (csvDataset.length === 0) return [];
    const uniqueCrops = csvDataset.map((row) => row.Crop);
    let cropList = [...new Set(uniqueCrops)].sort();
    
    // Remove Wheat when Balochistan is selected
    if (formData.province === "Balochistan") {
      cropList = cropList.filter(crop => crop !== "Wheat");
    }
    
    return cropList;
  }, [csvDataset, formData.province]);

  const districts = useMemo(() => {
    if (!formData.province || !formData.crop || csvDataset.length === 0) return [];
    
    // Get valid districts for the selected crop from RL backend mapping
    const validRLDistricts = CROP_DISTRICTS[formData.crop] || [];
    
    // Filter districts that exist in both CSV data and RL backend
    const filteredDistricts = csvDataset
      .filter((row) => row.Province === formData.province && row.Crop === formData.crop)
      .map((row) => row.District)
      .filter((district) => validRLDistricts.includes(district));
    
    return [...new Set(filteredDistricts)].sort();
  }, [formData.province, formData.crop, csvDataset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Prepare prediction parameters in exact order
      const dataArray = [
        formData.province,                                                    // string
        formData.district,                                                    // string
        formData.crop,                                                        // string
        parseInt(formData.year.toString()) || new Date().getFullYear(),      // number
        parseFloat(formData.area) || 0,                                       // number
        parseFloat(formData.temperature) || 0,                                // number
        parseFloat(formData.rainfall) || 0,                                   // number
        parseFloat(formData.phosphorus) || 0,                                 // number
        parseFloat(formData.potassium) || 0,                                  // number
        parseFloat(formData.soilPH) || 0,                                     // number
        parseFloat(formData.ndvi) || 0,                                       // number
        formData.sowingDate ? format(formData.sowingDate, 'MM/dd/yyyy') : '', // string
        formData.harvestingDate ? format(formData.harvestingDate, 'MM/dd/yyyy') : '', // string
      ];

      console.log('Sending prediction request with data:', dataArray);

      // Make both API calls in parallel
      const [app, rlApp] = await Promise.all([
        client("https://syedalaibarehman-prediction-integrate.hf.space"),
        client("https://syedalaibarehman-rl-backend.hf.space")
      ]);
      
      // Call yield prediction API first
      const result = await app.predict("/predict_yield", {
        province: dataArray[0],
        district: dataArray[1],
        crop_type: dataArray[2],
        year: dataArray[3],
        area: dataArray[4],
        temperature: dataArray[5],
        rainfall: dataArray[6],
        phosphorus: dataArray[7],
        potassium: dataArray[8],
        soil_ph: dataArray[9],
        ndvi: dataArray[10],
        sowing_time: dataArray[11],
        harvest_time: dataArray[12]
      });

      console.log('Received prediction result:', result);

      // Call RL recommendations API only if crop-district combination is valid
      let rlResult = null;
      const validRLDistricts = CROP_DISTRICTS[formData.crop] || [];
      const isValidForRL = validRLDistricts.includes(formData.district);
      
      if (isValidForRL) {
        try {
          // First, update the district list for the selected crop
          await rlApp.predict("/update_districts", {
            crop: formData.crop
          });
          console.log('Updated district list for crop:', formData.crop);
          
          // Then call the prediction endpoint
          rlResult = await rlApp.predict("/predict", {
            crop: formData.crop,
            district: formData.district,
            area_hectares: parseFloat(formData.area) || 0,
            season: formData.season
          });
          console.log('Received RL recommendations:', rlResult);
        } catch (rlError) {
          console.error('RL recommendations error:', rlError);
          toast({
            title: "Note",
            description: "Yield prediction generated successfully. AI-powered recommendations are not available for this crop-district combination.",
            variant: "default",
          });
        }
      } else {
        console.log('District not supported for RL recommendations:', formData.district);
        toast({
          title: "Note",
          description: "Yield prediction generated successfully. AI-powered recommendations are not available for this district.",
          variant: "default",
        });
      }

      // Parse the markdown response
      const responseText = result.data[0];
      
      // Extract Total Production (format: "**Total Production:** 307.53 tons")
      const totalProdMatch = responseText.match(/\*\*Total Production:\*\*\s*([\d,]+\.?\d*)\s*tons/i);
      const totalProduction = totalProdMatch ? parseFloat(totalProdMatch[1].replace(/,/g, '')) : 0;
      
      // Extract Yield per Hectare (format: "**Yield per Hectare:** 1.68 tons/ha")
      const yieldHaMatch = responseText.match(/\*\*Yield per Hectare:\*\*\s*([\d.]+)\s*tons\/ha/i);
      const yieldPerHectare = yieldHaMatch ? parseFloat(yieldHaMatch[1]) : 0;
      
      // Extract Confidence Level (format: "**Confidence Level:** Very High (94.4%)")
      const confidenceMatch = responseText.match(/\*\*Confidence Level:\*\*\s*.*?\(?([\d.]+)%\)?/i);
      const confidenceLevel = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0;
      
      // Extract Prediction Range (format: "**Prediction Range:** 302.37 - 312.70 tons")
      const rangeMatch = responseText.match(/\*\*Prediction Range:\*\*\s*([\d,]+\.?\d*)\s*-\s*([\d,]+\.?\d*)\s*tons/i);
      const predictionRange = rangeMatch 
        ? { 
            min: parseFloat(rangeMatch[1].replace(/,/g, '')), 
            max: parseFloat(rangeMatch[2].replace(/,/g, ''))
          }
        : { min: 0, max: 0 };
      
      // Extract Model Accuracy (format: "*Model Accuracy: R² = 0.9440 | Confidence: Very High*")
      const accuracyMatch = responseText.match(/Model Accuracy:\s*R²\s*=\s*([\d.]+)/i);
      const modelAccuracy = accuracyMatch ? parseFloat(accuracyMatch[1]) * 100 : 0;
      
      // Extract only the Context section (format: "📊 **Context:**\n- Pakistan average...")
      const contextMatch = responseText.match(/📊\s*\*\*Context:\*\*\s*([\s\S]*?)(?=\n---|$)/i);
      const analysisText = contextMatch ? contextMatch[1].trim() : '';

      setPrediction({
        totalProduction,
        yieldPerHectare,
        confidenceLevel,
        predictionRange,
        analysisText,
        modelAccuracy
      });

      // Mark prediction feature as complete
      markFeatureComplete("makePrediction");

      // Parse RL recommendations only if available
      if (rlResult) {
        const rlRecommendationsText = typeof rlResult.data === 'string' 
          ? rlResult.data 
          : rlResult.data[0];
      
      // Parse structured recommendations
      const lines = rlRecommendationsText.split('\n').map((line: string) => line.trim()).filter(Boolean);
      const parsedRecommendations: any = {};
      
      // Extract yield projections
      const totalYieldLine = lines.find((line: string) => line.toLowerCase().includes('total yield'));
      const yieldPerHaLine = lines.find((line: string) => line.toLowerCase().includes('yield per hectare'));
      const marketPriceLine = lines.find((line: string) => line.toLowerCase().includes('market price'));
      
      const totalYieldMatch = totalYieldLine?.match(/([\d.]+)\s*tons/i);
      const yieldPerHaMatch = yieldPerHaLine?.match(/([\d.]+)\s*tons/i);
      const marketPriceMatch = marketPriceLine?.match(/PKR\s*([\d,]+)/i);
      
      if (totalYieldMatch && yieldPerHaMatch) {
        parsedRecommendations.yieldProjection = {
          totalYield: parseFloat(totalYieldMatch[1]),
          yieldPerHectare: parseFloat(yieldPerHaMatch[1]),
          marketPrice: marketPriceMatch ? `PKR ${marketPriceMatch[1]}` : undefined
        };
      }
      
      // Extract phase-wise recommendations
      parsedRecommendations.phases = [];
      let currentPhase: any = null;
      
      for (const line of lines) {
        // Check for phase headers (look for ### markdown or specific phase names)
        if (line.startsWith('###') || 
            line.toLowerCase().includes('sowing') || 
            line.toLowerCase().includes('vegetative') || 
            line.toLowerCase().includes('harvesting')) {
          if (currentPhase) parsedRecommendations.phases.push(currentPhase);
          // Clean the phase name from markdown and emojis
          const phaseName = line.replace(/^###\s*/, '').replace(/[📅🌱🔬💰]/g, '').trim();
          currentPhase = { name: phaseName, recommendations: [] };
        } else if (currentPhase && line.includes(':') && line.startsWith('-')) {
          // Parse phase recommendations (format: "- Label: value")
          const cleanLine = line.replace(/^-\s*/, '').replace(/\*\*/g, '');
          const [label, ...valueParts] = cleanLine.split(':');
          const cleanLabel = label.replace(/[📝💧🌡️☀️💊🧪⚖️]/g, '').trim();
          const cleanValue = valueParts.join(':').replace(/[📝💧🌡️☀️💊🧪⚖️]/g, '').trim();
          if (cleanLabel && cleanValue) {
            currentPhase.recommendations.push({ label: cleanLabel, value: cleanValue });
          }
        }
      }
      if (currentPhase) parsedRecommendations.phases.push(currentPhase);
      
      // Extract financial analysis
      parsedRecommendations.financialAnalysis = [];
      const financialSection = lines.findIndex((line: string) => line.includes('Financial Analysis'));
      if (financialSection !== -1) {
        for (let i = financialSection + 1; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes(':')) {
            const [label, value] = line.split(':');
            // Remove markdown formatting (-, **, emojis) and trim
            const cleanLabel = label.replace(/^-\s*/, '').replace(/\*\*/g, '').replace(/[💰📊💸]/g, '').trim();
            const cleanValue = value.replace(/\*\*/g, '').replace(/[💰📊💸]/g, '').trim();
            if (cleanLabel && cleanValue) {
              parsedRecommendations.financialAnalysis.push({ label: cleanLabel, value: cleanValue });
            }
          }
        }
      }
      
        setRecommendations(parsedRecommendations);
        
        // Mark AI recommendations feature as complete
        markFeatureComplete("aiRecommendations");
      } else {
        setRecommendations(null);
      }

      // Save to database
      const { data: { user } } = await supabase.auth.getUser();
      if (user && formData.sowingDate && formData.harvestingDate) {
        await supabase.from("yield_predictions").insert({
          user_id: user.id,
          province: formData.province,
          district: formData.district,
          crop: formData.crop,
          sowing_date: format(formData.sowingDate, "yyyy-MM-dd"),
          harvesting_date: format(formData.harvestingDate, "yyyy-MM-dd"),
          current_stage: "Prediction",
          predicted_yield: totalProduction,
          confidence_interval: `${confidenceLevel}% (${predictionRange.min.toFixed(0)}-${predictionRange.max.toFixed(0)} tons)`,
        });

        toast({
          title: "Prediction Saved",
          description: "Your yield prediction has been saved successfully.",
        });
      }
    } catch (error) {
      console.error("Prediction error:", error);
      toast({
        title: "Error",
        description: "Failed to generate prediction. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">
            Yield Enhancement Prediction
          </h1>
          <p className="text-muted-foreground">
            Get AI-powered predictions for your crop yield
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Prediction Form</CardTitle>
              <CardDescription>Enter your crop details for yield prediction</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="province">Province *</Label>
                    <Select
                      value={formData.province}
                      onValueChange={(value) => setFormData({ ...formData, province: value, district: "" })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select province" />
                      </SelectTrigger>
                      <SelectContent>
                        {provinces.map((province) => (
                          <SelectItem key={province} value={province}>
                            {province}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="district">District *</Label>
                    <Select
                      value={formData.district}
                      onValueChange={(value) => setFormData({ ...formData, district: value })}
                      required
                      disabled={!formData.province || !formData.crop}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select district" />
                      </SelectTrigger>
                      <SelectContent>
                        {districts.map((district) => (
                          <SelectItem key={district} value={district}>
                            {district}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="crop">Crop Type *</Label>
                    <Select
                      value={formData.crop}
                      onValueChange={(value) => {
                        const cropInfo = CROP_SEASON_INFO[value];
                        const currentYear = new Date().getFullYear();
                        
                        // Set default dates based on crop season
                        let defaultSowingDate: Date | undefined = undefined;
                        let defaultHarvestingDate: Date | undefined = undefined;
                        
                        if (cropInfo) {
                          // Set default sowing date to first month of sowing season
                          defaultSowingDate = new Date(currentYear, cropInfo.sowingMonths[0] - 1, 15);
                          
                          // Set default harvesting date
                          const harvestMonth = cropInfo.harvestingMonths[0] - 1;
                          const harvestYear = harvestMonth < cropInfo.sowingMonths[0] - 1 ? currentYear + 1 : currentYear;
                          defaultHarvestingDate = new Date(harvestYear, harvestMonth, 15);
                        }
                        
                        setFormData({ 
                          ...formData, 
                          crop: value, 
                          district: "",
                          season: cropInfo?.season || "",
                          sowingDate: defaultSowingDate,
                          harvestingDate: defaultHarvestingDate
                        });
                      }}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select crop" />
                      </SelectTrigger>
                      <SelectContent>
                        {crops.map((crop) => (
                          <SelectItem key={crop} value={crop}>
                            {crop}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="season">Season *</Label>
                    <Select
                      value={formData.season}
                      onValueChange={(value) => setFormData({ ...formData, season: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select season" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Rabi">Rabi (Winter)</SelectItem>
                        <SelectItem value="Kharif">Kharif (Summer)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="year">Year *</Label>
                    <Input
                      id="year"
                      type="number"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                      placeholder="2024"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="area">Area (hectares) *</Label>
                    <Input
                      id="area"
                      type="number"
                      step="0.01"
                      value={formData.area}
                      onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                      placeholder="Enter area"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sowing-date">Sowing Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.sowingDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.sowingDate ? format(formData.sowingDate, "MM/dd/yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.sowingDate}
                          onSelect={(date) => setFormData({ ...formData, sowingDate: date, year: date ? date.getFullYear() : formData.year })}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="harvesting-date">Harvest Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.harvestingDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.harvestingDate ? format(formData.harvestingDate, "MM/dd/yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.harvestingDate}
                          onSelect={(date) => setFormData({ ...formData, harvestingDate: date })}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Environmental Factors</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="temperature">Temperature (°C) *</Label>
                      <Input
                        id="temperature"
                        type="number"
                        step="0.1"
                        value={formData.temperature}
                        onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                        placeholder="Enter temperature"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rainfall">Rainfall (mm) *</Label>
                      <Input
                        id="rainfall"
                        type="number"
                        step="0.1"
                        value={formData.rainfall}
                        onChange={(e) => setFormData({ ...formData, rainfall: e.target.value })}
                        placeholder="Enter rainfall"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phosphorus">Phosphorus (kg/ha) *</Label>
                      <Input
                        id="phosphorus"
                        type="number"
                        step="0.1"
                        value={formData.phosphorus}
                        onChange={(e) => setFormData({ ...formData, phosphorus: e.target.value })}
                        placeholder="Enter phosphorus"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="potassium">Potassium (kg/ha) *</Label>
                      <Input
                        id="potassium"
                        type="number"
                        step="0.1"
                        value={formData.potassium}
                        onChange={(e) => setFormData({ ...formData, potassium: e.target.value })}
                        placeholder="Enter potassium"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="soilPH">Soil pH *</Label>
                      <Input
                        id="soilPH"
                        type="number"
                        step="0.1"
                        value={formData.soilPH}
                        onChange={(e) => setFormData({ ...formData, soilPH: e.target.value })}
                        placeholder="Enter soil pH"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ndvi">NDVI *</Label>
                      <Input
                        id="ndvi"
                        type="number"
                        step="0.01"
                        value={formData.ndvi}
                        onChange={(e) => setFormData({ ...formData, ndvi: e.target.value })}
                        placeholder="Enter NDVI"
                        required
                      />
                    </div>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Predict Yield & AI Recommendations
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Regional Map */}
          <Card>
            <CardHeader>
              <CardTitle>Regional View</CardTitle>
              <CardDescription>
                Interactive map showing selected location
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegionalMap 
                province={formData.province} 
                district={formData.district}
              />
            </CardContent>
          </Card>
        </div>

        {/* Results Section - Side by Side */}
        {(prediction || recommendations) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {prediction && (
              <Card className="border-l-4 border-l-primary">
                <CardHeader>
                  <CardTitle>Prediction Results</CardTitle>
                  <CardDescription>AI-generated yield forecast</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Primary Stats Section */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="text-center py-8 bg-primary/10 rounded-2xl border border-primary/20 h-[180px] flex flex-col justify-center">
                      <p className="text-sm text-muted-foreground mb-3 font-medium">
                        Total Production
                      </p>
                      <p className="text-5xl font-bold text-primary">{prediction.totalProduction.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground mt-2">tons</p>
                    </div>
                    
                    <div className="text-center py-8 bg-secondary/10 rounded-2xl border border-secondary/20 h-[180px] flex flex-col justify-center">
                      <p className="text-sm text-muted-foreground mb-3 font-medium">
                        Yield per Hectare
                      </p>
                      <p className="text-5xl font-bold text-secondary">{prediction.yieldPerHectare.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground mt-2">tons/ha</p>
                    </div>
                  </div>

                  {/* Confidence Level Section */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Confidence Level</h4>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "px-4 py-2 rounded-full font-semibold text-white",
                        prediction.confidenceLevel >= 90 ? "bg-green-500" :
                        prediction.confidenceLevel >= 70 ? "bg-yellow-500" : "bg-red-500"
                      )}>
                        {prediction.confidenceLevel}%
                      </div>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all",
                            prediction.confidenceLevel >= 90 ? "bg-green-500" :
                            prediction.confidenceLevel >= 70 ? "bg-yellow-500" : "bg-red-500"
                          )}
                          style={{ width: `${prediction.confidenceLevel}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Prediction Range Section */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Prediction Range</h4>
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-muted-foreground">Min: {prediction.predictionRange.min.toLocaleString()} tons</span>
                        <span className="text-sm text-muted-foreground">Max: {prediction.predictionRange.max.toLocaleString()} tons</span>
                      </div>
                      <div className="relative h-2 bg-background rounded-full overflow-hidden">
                        <div 
                          className="absolute h-full bg-primary/30"
                          style={{ 
                            left: '0%', 
                            width: '100%' 
                          }}
                        />
                        <div 
                          className="absolute h-full w-1 bg-primary"
                          style={{ 
                            left: `${((prediction.totalProduction - prediction.predictionRange.min) / 
                                    (prediction.predictionRange.max - prediction.predictionRange.min)) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Model Accuracy */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Model Accuracy</h4>
                    <div className="flex items-center justify-center">
                      <div className="relative w-32 h-32">
                        <svg className="transform -rotate-90 w-32 h-32">
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="12"
                            fill="none"
                            className="text-muted"
                          />
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="12"
                            fill="none"
                            strokeDasharray={2 * Math.PI * 56}
                            strokeDashoffset={2 * Math.PI * 56 * (1 - prediction.modelAccuracy / 100)}
                            className="text-primary transition-all duration-1000 ease-out"
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-3xl font-bold text-primary">{Math.round(prediction.modelAccuracy)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Context Section */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Context</h4>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {prediction.analysisText.split('\n').filter(line => line.trim()).map((line, index) => {
                        // Remove markdown formatting and bullets
                        const cleanLine = line.replace(/#{1,6}\s*/g, '').replace(/\*\*/g, '').replace(/^-\s*/, '').replace(/^•\s*/, '').trim();
                        if (!cleanLine) return null;
                        
                        // Skip "Progressive farmers" line
                        if (cleanLine.toLowerCase().includes('progressive farmers')) return null;
                        
                        return (
                          <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                            <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                            <p className="text-sm">{cleanLine}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Form Details Section */}
                  <div className="space-y-2 pt-4 border-t">
                    <div className="flex justify-between p-3 bg-muted rounded-lg">
                      <span className="text-sm font-medium">Crop Type</span>
                      <span className="text-sm text-muted-foreground">{formData.crop}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-muted rounded-lg">
                      <span className="text-sm font-medium">Location</span>
                      <span className="text-sm text-muted-foreground">
                        {formData.district}, {formData.province}
                      </span>
                    </div>
                    <div className="flex justify-between p-3 bg-muted rounded-lg">
                      <span className="text-sm font-medium">Area</span>
                      <span className="text-sm text-muted-foreground">{formData.area} hectares</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {recommendations && (
              <Card className="overflow-hidden border-l-4 border-l-primary">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    AI-Powered Recommendations
                    <span className="text-xs font-normal px-2 py-1 rounded-full bg-primary/10 text-primary">Optimized</span>
                  </CardTitle>
                  <CardDescription>Smart farming strategy for maximum yield</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8 pt-6">
                  {/* Yield Display Section */}
                  {recommendations.yieldProjection && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl bg-green-50 dark:bg-green-950/20 text-center border border-green-100 dark:border-green-900/30 h-[180px] flex flex-col justify-center py-8">
                          <div className="text-sm text-muted-foreground mb-3 font-medium">Total Production</div>
                          <div className="text-5xl font-bold text-green-600 dark:text-green-400">
                            {recommendations.yieldProjection.totalYield.toFixed(2)}
                          </div>
                          <div className="text-sm text-muted-foreground mt-2">tons</div>
                        </div>
                        <div className="rounded-2xl bg-orange-50 dark:bg-orange-950/20 text-center border border-orange-100 dark:border-orange-900/30 h-[180px] flex flex-col justify-center py-8">
                          <div className="text-sm text-muted-foreground mb-3 font-medium">Yield per Hectare</div>
                          <div className="text-5xl font-bold text-orange-600 dark:text-orange-400">
                            {recommendations.yieldProjection.yieldPerHectare.toFixed(2)}
                          </div>
                          <div className="text-sm text-muted-foreground mt-2">tons/ha</div>
                        </div>
                      </div>
                      {recommendations.yieldProjection.marketPrice && (
                        <div className="text-center py-2">
                          <span className="text-xs text-muted-foreground">Market Price: </span>
                          <span className="text-sm font-medium text-foreground">{recommendations.yieldProjection.marketPrice}</span>
                        </div>
                      )}
                      {prediction && (
                        <div className="text-center py-3 mt-2">
                          <div className="text-xs text-muted-foreground mb-1">Growth Rate</div>
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {(() => {
                              const growthRate = ((recommendations.yieldProjection.totalYield - prediction.totalProduction) / prediction.totalProduction) * 100;
                              return `${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(1)}%`;
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Phase wise Recommendations Section */}
                  {recommendations.phases && recommendations.phases.length > 0 && (
                    <div className="space-y-5 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                      <h3 className="text-lg font-semibold text-foreground">Phase wise Recommendations for progressive yield</h3>
                      <div className="space-y-4">
                        {recommendations.phases.map((phase, phaseIndex) => {
                          const phaseColors = [
                            { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200/50 dark:border-green-900/30', text: 'text-green-700 dark:text-green-300', badge: 'bg-green-100/80 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
                            { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200/50 dark:border-blue-900/30', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
                            { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200/50 dark:border-amber-900/30', text: 'text-amber-700 dark:text-amber-300', badge: 'bg-amber-100/80 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' }
                          ];
                          const colors = phaseColors[phaseIndex % phaseColors.length];
                          
                          return (
                            <div 
                              key={phaseIndex} 
                              className={`rounded-xl ${colors.bg} border ${colors.border} p-6 transition-all duration-300`}
                            >
                              <div className="flex items-center gap-3 mb-4">
                                <div className={`px-3 py-1 rounded-full text-sm font-semibold ${colors.badge}`}>
                                  {String(phaseIndex + 1).padStart(2, '0')}
                                </div>
                                <h4 className={`font-semibold text-base ${colors.text}`}>
                                  {phase.name}
                                </h4>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                {phase.recommendations.map((rec, recIndex) => (
                                  <div key={recIndex} className="p-3 rounded-lg bg-background border border-border">
                                    <div className="text-xs font-medium text-muted-foreground mb-1">{rec.label}</div>
                                    <div className="text-sm font-semibold text-foreground">{rec.value}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Financial Analysis Section */}
                  {recommendations.financialAnalysis && recommendations.financialAnalysis.length > 0 && (
                    <div className="space-y-3 animate-fade-in" style={{ animationDelay: '0.3s' }}>
                      <h4 className="font-semibold text-sm">Financial Analysis</h4>
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {recommendations.financialAnalysis
                          .filter(item => 
                            ['Total Investment', 'Expected Revenue', 'Net Profit', 'Profit Per Hectare', 'ROI'].includes(item.label)
                          )
                          .map((item, index) => (
                            <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                              <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                              <div className="flex-1">
                                <span className="text-sm font-medium text-foreground">{item.label}: </span>
                                <span className="text-sm text-muted-foreground">{item.value}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default YieldEnhancement;
