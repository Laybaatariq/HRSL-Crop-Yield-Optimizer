import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis } from "recharts";
import Papa from "papaparse";
import { markFeatureComplete } from "@/lib/progress-tracker";

interface CropData {
  province: string;
  district: string;
  crop_type: string;
  year: string;
  area_in_hectares: string;
  production_in_tons: string;
  temperaturec: string;
  avg_rainfall_mm: string;
  soil_type: string;
  n_kgha: string;
  p_kgha: string;
  k_kgha: string;
  ndvi: string;
  sowing_time: string;
  harvest_time: string;
  soil_ph: string;
  yield_tons_per_hectare: string;
  season: string;
}

const YieldTrends = () => {
  const [selectedCrop, setSelectedCrop] = useState<string>("Wheat");
  const [selectedYear, setSelectedYear] = useState<string>("2021");
  const [selectedProvince, setSelectedProvince] = useState<string>("all");
  const [data, setData] = useState<CropData[]>([]);

  useEffect(() => {
    // Mark feature as complete when page is accessed
    markFeatureComplete("yieldTrends");
  }, []);

  useEffect(() => {
    fetch('/cleaned_agricultural_data_1.csv')
      .then(response => response.text())
      .then(csvText => {
        Papa.parse<CropData>(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            setData(result.data);
          },
        });
      });
  }, []);

  const crops = useMemo(() => {
    const uniqueCrops = [...new Set(data.map(d => d.crop_type))].filter(Boolean).sort();
    return uniqueCrops;
  }, [data]);

  const provinces = useMemo(() => {
    const uniqueProvinces = [...new Set(data.map(d => d.province))].filter(Boolean).sort();
    return uniqueProvinces;
  }, [data]);

  const years = useMemo(() => {
    const uniqueYears = [...new Set(data.map(d => d.year))].filter(Boolean).sort();
    return uniqueYears;
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(d => 
      (selectedCrop === "all" || d.crop_type === selectedCrop) && 
      (selectedYear === "all" || d.year === selectedYear) &&
      (selectedProvince === "all" || d.province === selectedProvince)
    );
  }, [data, selectedCrop, selectedYear, selectedProvince]);

  const provinceYieldData = useMemo(() => {
    const dataToAggregate = data.filter(d => 
      (selectedCrop === "all" || d.crop_type === selectedCrop) && 
      (selectedYear === "all" || d.year === selectedYear)
    );

    if (selectedCrop === "all") {
      // Group by province AND crop when all crops selected
      const provinceCropMap = new Map<string, Map<string, { total: number; count: number }>>();
      
      dataToAggregate.forEach(d => {
        const yieldValue = parseFloat(d.yield_tons_per_hectare);
        if (!isNaN(yieldValue) && yieldValue > 0) {
          if (!provinceCropMap.has(d.province)) {
            provinceCropMap.set(d.province, new Map());
          }
          const cropMap = provinceCropMap.get(d.province)!;
          const existing = cropMap.get(d.crop_type) || { total: 0, count: 0 };
          cropMap.set(d.crop_type, {
            total: existing.total + yieldValue,
            count: existing.count + 1
          });
        }
      });

      const result: any[] = [];
      provinceCropMap.forEach((cropMap, province) => {
        const provinceData: any = { province };
        cropMap.forEach((value, crop) => {
          provinceData[crop] = parseFloat((value.total / value.count).toFixed(2));
        });
        result.push(provinceData);
      });
      
      return result.sort((a, b) => {
        const aTotal = Object.keys(a).filter(k => k !== 'province').reduce((sum, k) => sum + (a[k] || 0), 0);
        const bTotal = Object.keys(b).filter(k => k !== 'province').reduce((sum, k) => sum + (b[k] || 0), 0);
        return bTotal - aTotal;
      });
    } else {
      // Original single crop logic
      const provinceMap = new Map<string, { total: number; count: number }>();
      
      dataToAggregate.forEach(d => {
        const yieldValue = parseFloat(d.yield_tons_per_hectare);
        if (!isNaN(yieldValue) && yieldValue > 0) {
          const existing = provinceMap.get(d.province) || { total: 0, count: 0 };
          provinceMap.set(d.province, {
            total: existing.total + yieldValue,
            count: existing.count + 1
          });
        }
      });

      return Array.from(provinceMap.entries())
        .map(([province, { total, count }]) => ({
          province,
          yield: parseFloat((total / count).toFixed(2))
        }))
        .sort((a, b) => b.yield - a.yield);
    }
  }, [data, selectedCrop, selectedYear]);

  const monthlyYieldData = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthMap = new Map<string, { total: number; count: number }>();

    filteredData.forEach(d => {
      const yieldValue = parseFloat(d.yield_tons_per_hectare);
      if (!isNaN(yieldValue) && yieldValue > 0) {
        const sowingMonth = d.sowing_time?.split(' ')[0] || 'Unknown';
        if (sowingMonth !== 'Unknown') {
          const existing = monthMap.get(sowingMonth) || { total: 0, count: 0 };
          monthMap.set(sowingMonth, {
            total: existing.total + yieldValue,
            count: existing.count + 1
          });
        }
      }
    });

    return monthNames
      .filter(month => monthMap.has(month))
      .map(month => {
        const { total, count } = monthMap.get(month)!;
        return {
          month,
          yield: parseFloat((total / count).toFixed(2))
        };
      });
  }, [filteredData]);

  // KPI calculations
  const kpiData = useMemo(() => {
    if (filteredData.length === 0) return null;
    
    const totalArea = filteredData.reduce((sum, d) => sum + parseFloat(d.area_in_hectares || '0'), 0);
    const totalProduction = filteredData.reduce((sum, d) => sum + parseFloat(d.production_in_tons || '0'), 0);
    const avgYield = filteredData.reduce((sum, d) => sum + parseFloat(d.yield_tons_per_hectare || '0'), 0) / filteredData.length;
    const avgNPK = filteredData.reduce((sum, d) => {
      const n = parseFloat(d.n_kgha || '0');
      const p = parseFloat(d.p_kgha || '0');
      const k = parseFloat(d.k_kgha || '0');
      return sum + n + p + k;
    }, 0) / filteredData.length;
    
    return {
      totalArea: (totalArea / 1000).toFixed(2) + 'K',
      totalProduction: (totalProduction / 1000000).toFixed(2) + 'M',
      avgYield: avgYield.toFixed(2),
      resourceEfficiency: ((avgYield / avgNPK) * 1000).toFixed(2) + 'K',
      totalYieldThisYear: (totalProduction / 1000000).toFixed(2) + 'M'
    };
  }, [filteredData]);

  // Soil composition data
  const soilCompositionData = useMemo(() => {
    const soilMap = new Map<string, number>();
    filteredData.forEach(d => {
      const count = soilMap.get(d.soil_type) || 0;
      soilMap.set(d.soil_type, count + 1);
    });
    
    const total = Array.from(soilMap.values()).reduce((sum, val) => sum + val, 0);
    return Array.from(soilMap.entries())
      .map(([name, value]) => ({ 
        name, 
        value,
        percentage: ((value / total) * 100).toFixed(1)
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  // Yield category breakdown
  const yieldCategoryData = useMemo(() => {
    const categories = {
      'Very Low': 0,
      'Low': 0,
      'Medium': 0,
      'High': 0,
      'Very High': 0
    };
    
    filteredData.forEach(d => {
      const yieldValue = parseFloat(d.yield_tons_per_hectare || '0');
      if (yieldValue > 0) {
        if (yieldValue < 2) categories['Very Low']++;
        else if (yieldValue < 3.5) categories['Low']++;
        else if (yieldValue < 5) categories['Medium']++;
        else if (yieldValue < 6.5) categories['High']++;
        else categories['Very High']++;
      }
    });
    
    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
    return Object.entries(categories)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        percentage: ((value / total) * 100).toFixed(1)
      }));
  }, [filteredData]);

  // NPK nutrient trends by year
  const npkTrendsData = useMemo(() => {
    const yearMap = new Map<string, { n: number; p: number; k: number; count: number }>();
    
    data.filter(d => selectedCrop === "all" || d.crop_type === selectedCrop).forEach(d => {
      const existing = yearMap.get(d.year) || { n: 0, p: 0, k: 0, count: 0 };
      yearMap.set(d.year, {
        n: existing.n + parseFloat(d.n_kgha || '0'),
        p: existing.p + parseFloat(d.p_kgha || '0'),
        k: existing.k + parseFloat(d.k_kgha || '0'),
        count: existing.count + 1
      });
    });
    
    return Array.from(yearMap.entries())
      .map(([year, { n, p, k, count }]) => ({
        year,
        Nitrogen: parseFloat((n / count).toFixed(2)),
        Phosphorus: parseFloat((p / count).toFixed(2)),
        Potassium: parseFloat((k / count).toFixed(2))
      }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [data, selectedCrop]);

  // Production trends over time - YEARLY production per hectare
  const productionTrendsData = useMemo(() => {
    if (selectedCrop === "all") {
      // Group by year AND crop when all crops selected
      const yearCropMap = new Map<string, Map<string, { totalYield: number; count: number }>>();
      
      data.filter(d => 
        (selectedProvince === "all" || d.province === selectedProvince) &&
        (selectedYear === "all" || d.year === selectedYear)
      ).forEach(d => {
        const yieldValue = parseFloat(d.yield_tons_per_hectare || '0');
        if (yieldValue > 0) {
          if (!yearCropMap.has(d.year)) {
            yearCropMap.set(d.year, new Map());
          }
          const cropMap = yearCropMap.get(d.year)!;
          const existing = cropMap.get(d.crop_type) || { totalYield: 0, count: 0 };
          cropMap.set(d.crop_type, {
            totalYield: existing.totalYield + yieldValue,
            count: existing.count + 1
          });
        }
      });
      
      return Array.from(yearCropMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([year, cropMap]) => {
          const yearData: any = { year };
          cropMap.forEach((value, crop) => {
            yearData[crop] = parseFloat((value.totalYield / value.count).toFixed(2));
          });
          return yearData;
        });
    } else {
      // Single crop logic - group by year
      const yearMap = new Map<string, { totalYield: number; count: number }>();
      
      data.filter(d => 
        d.crop_type === selectedCrop &&
        (selectedProvince === "all" || d.province === selectedProvince) &&
        (selectedYear === "all" || d.year === selectedYear)
      ).forEach(d => {
        const yieldValue = parseFloat(d.yield_tons_per_hectare || '0');
        if (yieldValue > 0) {
          const existing = yearMap.get(d.year) || { totalYield: 0, count: 0 };
          yearMap.set(d.year, {
            totalYield: existing.totalYield + yieldValue,
            count: existing.count + 1
          });
        }
      });
      
      return Array.from(yearMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([year, { totalYield, count }]) => ({
          year,
          yieldPerHectare: parseFloat((totalYield / count).toFixed(2))
        }));
    }
  }, [data, selectedCrop, selectedProvince, selectedYear]);

  // Temperature vs Productivity by crop (for stacked bar chart)
  const temperatureProductivityData = useMemo(() => {
    const dataToUse = data.filter(d => 
      (selectedCrop === "all" || d.crop_type === selectedCrop) &&
      (selectedYear === "all" || d.year === selectedYear) &&
      (selectedProvince === "all" || d.province === selectedProvince)
    );

    if (selectedCrop === "all") {
      // Group by temperature category AND crop
      const tempCropMap = new Map<string, Map<string, { total: number; count: number }>>();
      const allCropsInData = new Set<string>();
      
      dataToUse.forEach(d => {
        const temp = parseFloat(d.temperaturec || '0');
        const productivity = parseFloat(d.yield_tons_per_hectare || '0') * parseFloat(d.area_in_hectares || '0');
        let category = 'Warm (15-30°C)';
        if (temp < 15) category = 'Cool (<15°C)';
        else if (temp > 30) category = 'Hot (>30°C)';
        
        if (productivity > 0) {
          allCropsInData.add(d.crop_type);
          if (!tempCropMap.has(category)) {
            tempCropMap.set(category, new Map());
          }
          const cropMap = tempCropMap.get(category)!;
          const existing = cropMap.get(d.crop_type) || { total: 0, count: 0 };
          cropMap.set(d.crop_type, {
            total: existing.total + productivity,
            count: existing.count + 1
          });
        }
      });
      
      // Ensure all crops have a value (0 if missing) for each category
      return Array.from(tempCropMap.entries()).map(([category, cropMap]) => {
        const categoryData: any = { category };
        allCropsInData.forEach((crop) => {
          const value = cropMap.get(crop);
          categoryData[crop] = value ? parseFloat((value.total / value.count).toFixed(2)) : 0;
        });
        return categoryData;
      });
    } else {
      const tempCategories = new Map<string, { total: number; count: number }>();
      
      dataToUse.forEach(d => {
        const temp = parseFloat(d.temperaturec || '0');
        const productivity = parseFloat(d.yield_tons_per_hectare || '0') * parseFloat(d.area_in_hectares || '0');
        let category = 'Warm (15-30°C)';
        if (temp < 15) category = 'Cool (<15°C)';
        else if (temp > 30) category = 'Hot (>30°C)';
        
        if (productivity > 0) {
          const existing = tempCategories.get(category) || { total: 0, count: 0 };
          tempCategories.set(category, {
            total: existing.total + productivity,
            count: existing.count + 1
          });
        }
      });
      
      return Array.from(tempCategories.entries()).map(([category, { total, count }]) => ({
        category,
        productivity: parseFloat((total / count).toFixed(2))
      }));
    }
  }, [data, selectedCrop, selectedYear, selectedProvince]);

  // Rainfall vs Production - aggregated by crop if "all" selected
  const rainfallProductionData = useMemo(() => {
    const dataToUse = data.filter(d => 
      (selectedCrop === "all" || d.crop_type === selectedCrop) &&
      (selectedYear === "all" || d.year === selectedYear) &&
      (selectedProvince === "all" || d.province === selectedProvince)
    );

    if (selectedCrop === "all") {
      // Aggregate by crop
      const cropMap = new Map<string, { totalRainfall: number; totalProduction: number; count: number }>();
      
      dataToUse.forEach(d => {
        const rainfall = parseFloat(d.avg_rainfall_mm || '0');
        const production = parseFloat(d.production_in_tons || '0');
        
        if (rainfall > 0 && production > 0) {
          const existing = cropMap.get(d.crop_type) || { totalRainfall: 0, totalProduction: 0, count: 0 };
          cropMap.set(d.crop_type, {
            totalRainfall: existing.totalRainfall + rainfall,
            totalProduction: existing.totalProduction + production,
            count: existing.count + 1
          });
        }
      });
      
      return Array.from(cropMap.entries()).map(([crop, values]) => ({
        rainfall: parseFloat((values.totalRainfall / values.count).toFixed(2)),
        production: parseFloat(values.totalProduction.toFixed(2)),
        crop
      }));
    } else {
      // Single crop - aggregate total
      let totalRainfall = 0;
      let totalProduction = 0;
      let count = 0;
      
      dataToUse.forEach(d => {
        const rainfall = parseFloat(d.avg_rainfall_mm || '0');
        const production = parseFloat(d.production_in_tons || '0');
        
        if (rainfall > 0 && production > 0) {
          totalRainfall += rainfall;
          totalProduction += production;
          count++;
        }
      });
      
      if (count > 0) {
        return [{
          rainfall: parseFloat((totalRainfall / count).toFixed(2)),
          production: parseFloat(totalProduction.toFixed(2))
        }];
      }
      return [];
    }
  }, [data, selectedCrop, selectedYear, selectedProvince]);

  // Crop Performance by Environmental Factors - ALL factors
  const cropPerformanceData = useMemo(() => {
    const dataToUse = data.filter(d => 
      (selectedCrop === "all" || d.crop_type === selectedCrop) &&
      (selectedYear === "all" || d.year === selectedYear) &&
      (selectedProvince === "all" || d.province === selectedProvince)
    );

    if (selectedCrop === "all") {
      return dataToUse
        .map(d => ({
          temperature: parseFloat(d.temperaturec || '0'),
          rainfall: parseFloat(d.avg_rainfall_mm || '0'),
          pH: parseFloat(d.soil_ph || '0'),
          ndvi: parseFloat(d.ndvi || '0'),
          nitrogen: parseFloat(d.n_kgha || '0'),
          productivity: parseFloat(d.yield_tons_per_hectare || '0'),
          crop: d.crop_type
        }))
        .filter(d => d.productivity > 0)
        .slice(0, 150);
    } else {
      return dataToUse
        .map(d => ({
          temperature: parseFloat(d.temperaturec || '0'),
          rainfall: parseFloat(d.avg_rainfall_mm || '0'),
          pH: parseFloat(d.soil_ph || '0'),
          ndvi: parseFloat(d.ndvi || '0'),
          nitrogen: parseFloat(d.n_kgha || '0'),
          productivity: parseFloat(d.yield_tons_per_hectare || '0'),
          crop: d.crop_type
        }))
        .filter(d => d.productivity > 0)
        .slice(0, 100);
    }
  }, [data, selectedCrop, selectedYear, selectedProvince]);

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--secondary))', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f97316', '#a855f7'];
  
  const cropColors = useMemo(() => {
    const colors: Record<string, string> = {};
    crops.forEach((crop, index) => {
      colors[crop] = COLORS[index % COLORS.length];
    });
    return colors;
  }, [crops]);

  const insights = useMemo(() => {
    if (provinceYieldData.length === 0) return null;
    
    const bestProvince = provinceYieldData[0];
    const avgYield = provinceYieldData.reduce((sum, d) => sum + d.yield, 0) / provinceYieldData.length;
    const peakMonth = monthlyYieldData.length > 0 
      ? monthlyYieldData.reduce((max, d) => d.yield > max.yield ? d : max, monthlyYieldData[0])
      : null;

    return { bestProvince, avgYield, peakMonth };
  }, [provinceYieldData, monthlyYieldData]);

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">
            AgriSmart Crop Analysis Report
          </h1>
          <p className="text-muted-foreground">
            Comprehensive analysis of agricultural yield data and trends
          </p>
        </div>

        <div className="flex gap-4 flex-wrap">
          <Select value={selectedCrop} onValueChange={setSelectedCrop}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Crop Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {crops.map(crop => (
                <SelectItem key={crop} value={crop}>{crop}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedProvince} onValueChange={setSelectedProvince}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Province" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {provinces.map(province => (
                <SelectItem key={province} value={province}>{province}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {years.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* KPI Cards */}
        {kpiData && (
          <div className="grid gap-4 md:grid-cols-5">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-2">Total Cultivated Area</p>
                <p className="text-4xl font-bold text-foreground">{kpiData.totalArea}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-accent/10 to-accent/5">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-2">Total Production</p>
                <p className="text-4xl font-bold text-foreground">{kpiData.totalProduction}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-2">Avg Yield per Hectare</p>
                <p className="text-4xl font-bold text-foreground">{kpiData.avgYield}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-2">Resource Usage Efficiency (%)</p>
                <p className="text-4xl font-bold text-foreground">{kpiData.resourceEfficiency}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-accent/10 to-accent/5">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-2">Total Yield This Year</p>
                <p className="text-4xl font-bold text-foreground">{kpiData.totalYieldThisYear}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* First row of charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Production Trends Over Time</CardTitle>
              <CardDescription>
                Yearly production per hectare {selectedCrop === "all" ? "for all crops" : `for ${selectedCrop}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {productionTrendsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={productionTrendsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="year" 
                      stroke="hsl(var(--muted-foreground))" 
                      label={{ value: 'Year', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      width={80}
                      label={{ value: 'Yield (tons/ha)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} 
                    />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Legend />
                    {selectedCrop === "all" ? (
                      crops.map((crop) => (
                        <Line 
                          key={crop}
                          type="monotone" 
                          dataKey={crop} 
                          stroke={cropColors[crop]} 
                          strokeWidth={2} 
                          dot={{ fill: cropColors[crop], r: 4 }}
                          name={crop}
                        />
                      ))
                    ) : (
                      <Line 
                        type="monotone" 
                        dataKey="yieldPerHectare" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3} 
                        dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                        name="Yield (tons/ha)"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Crop Yield by Province</CardTitle>
              <CardDescription>
                Average yield comparison across provinces {selectedCrop === "all" ? "(all crops)" : `(${selectedCrop})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {provinceYieldData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={provinceYieldData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="province" stroke="hsl(var(--muted-foreground))" width={100} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Legend />
                    {selectedCrop === "all" ? (
                      crops.map((crop) => (
                        <Bar 
                          key={crop}
                          dataKey={crop} 
                          fill={cropColors[crop]}
                          name={crop}
                        />
                      ))
                    ) : (
                      <Bar dataKey="yield" fill="hsl(var(--accent))" name="Yield (tons/ha)" />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Second row of charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Soil Composition Analysis</CardTitle>
              <CardDescription>Distribution of soil types in selected filters</CardDescription>
            </CardHeader>
            <CardContent>
              {soilCompositionData.length > 0 ? (
                <div className="flex gap-6 items-center">
                  <ResponsiveContainer width="50%" height={300}>
                    <PieChart>
                      <Pie
                        data={soilCompositionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ percentage }) => `${percentage}%`}
                        outerRadius={100}
                        fill="hsl(var(--primary))"
                        dataKey="value"
                      >
                        {soilCompositionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    <p className="font-semibold text-sm text-muted-foreground mb-3">Soil Type</p>
                    {soilCompositionData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-2 text-sm">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="flex-1">{entry.name}</span>
                        <span className="text-muted-foreground">{entry.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Yield Category Breakdown</CardTitle>
              <CardDescription>Distribution of yield performance categories</CardDescription>
            </CardHeader>
            <CardContent>
              {yieldCategoryData.length > 0 ? (
                <div className="flex gap-6 items-center">
                  <ResponsiveContainer width="50%" height={300}>
                    <PieChart>
                      <Pie
                        data={yieldCategoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ percentage }) => `${percentage}%`}
                        innerRadius={60}
                        outerRadius={100}
                        fill="hsl(var(--primary))"
                        dataKey="value"
                      >
                        {yieldCategoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    <p className="font-semibold text-sm text-muted-foreground mb-3">Yield Category</p>
                    {yieldCategoryData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-2 text-sm">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="flex-1">{entry.name}</span>
                        <span className="text-muted-foreground">{entry.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Third row of charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>NPK Nutrient Usage Trends</CardTitle>
              <CardDescription>Nitrogen, Phosphorus, and Potassium application over time</CardDescription>
            </CardHeader>
            <CardContent>
              {npkTrendsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={npkTrendsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Legend />
                    <Bar dataKey="Nitrogen" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="Phosphorus" stackId="a" fill="#ef4444" />
                    <Bar dataKey="Potassium" stackId="a" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rainfall vs Production</CardTitle>
              <CardDescription>Sum of production vs average rainfall {selectedCrop === "all" ? "(all crops)" : `(${selectedCrop})`}</CardDescription>
            </CardHeader>
            <CardContent>
              {rainfallProductionData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="rainfall" 
                      name="Sum of Average Rainfall (mm)" 
                      stroke="hsl(var(--muted-foreground))"
                      label={{ value: 'Sum of Average Rainfall (mm)', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      dataKey="production" 
                      name="Production (tons)" 
                      stroke="hsl(var(--muted-foreground))"
                      width={80}
                      label={{ value: 'Production (tons)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      cursor={{ strokeDasharray: '3 3' }}
                    />
                    <Legend />
                    {selectedCrop === "all" ? (
                      crops.map((crop) => (
                        <Scatter 
                          key={crop}
                          name={crop}
                          data={rainfallProductionData.filter((d: any) => d.crop === crop)}
                          fill={cropColors[crop]}
                        />
                      ))
                    ) : (
                      <Scatter name="Production" data={rainfallProductionData} fill="hsl(var(--primary))" />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Fourth row - NEW CHARTS */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Crop Performance by Environmental Factors</CardTitle>
              <CardDescription>Multi-factor environmental analysis {selectedCrop === "all" ? "(all crops)" : `(${selectedCrop})`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {cropPerformanceData.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Temperature vs Productivity */}
                    <div>
                      <p className="text-sm font-medium mb-2">Temperature vs Productivity</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="temperature" 
                            name="Temperature (°C)" 
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis 
                            dataKey="productivity" 
                            name="Productivity" 
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} 
                            cursor={{ strokeDasharray: '3 3' }}
                          />
                          {selectedCrop === "all" ? (
                            crops.map((crop) => (
                              <Scatter 
                                key={crop}
                                name={crop}
                                data={cropPerformanceData.filter(d => d.crop === crop)}
                                fill={cropColors[crop]}
                              />
                            ))
                          ) : (
                            <Scatter name="Temperature" data={cropPerformanceData} fill="hsl(var(--primary))" />
                          )}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Rainfall vs Productivity */}
                    <div>
                      <p className="text-sm font-medium mb-2">Rainfall vs Productivity</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="rainfall" 
                            name="Rainfall (mm)" 
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis 
                            dataKey="productivity" 
                            name="Productivity" 
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} 
                            cursor={{ strokeDasharray: '3 3' }}
                          />
                          {selectedCrop === "all" ? (
                            crops.map((crop) => (
                              <Scatter 
                                key={crop}
                                name={crop}
                                data={cropPerformanceData.filter(d => d.crop === crop)}
                                fill={cropColors[crop]}
                              />
                            ))
                          ) : (
                            <Scatter name="Rainfall" data={cropPerformanceData} fill="hsl(var(--accent))" />
                          )}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>

                    {/* pH vs Productivity */}
                    <div>
                      <p className="text-sm font-medium mb-2">Soil pH vs Productivity</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="pH" 
                            name="Soil pH" 
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis 
                            dataKey="productivity" 
                            name="Productivity" 
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} 
                            cursor={{ strokeDasharray: '3 3' }}
                          />
                          {selectedCrop === "all" ? (
                            crops.map((crop) => (
                              <Scatter 
                                key={crop}
                                name={crop}
                                data={cropPerformanceData.filter(d => d.crop === crop)}
                                fill={cropColors[crop]}
                              />
                            ))
                          ) : (
                            <Scatter name="pH" data={cropPerformanceData} fill="hsl(var(--secondary))" />
                          )}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>

                    {/* NDVI vs Productivity */}
                    <div>
                      <p className="text-sm font-medium mb-2">NDVI vs Productivity</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="ndvi" 
                            name="NDVI" 
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis 
                            dataKey="productivity" 
                            name="Productivity" 
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} 
                            cursor={{ strokeDasharray: '3 3' }}
                          />
                          {selectedCrop === "all" ? (
                            crops.map((crop) => (
                              <Scatter 
                                key={crop}
                                name={crop}
                                data={cropPerformanceData.filter(d => d.crop === crop)}
                                fill={cropColors[crop]}
                              />
                            ))
                          ) : (
                            <Scatter name="NDVI" data={cropPerformanceData} fill="#10b981" />
                          )}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {selectedCrop === "all" && (
                    <div className="flex flex-wrap gap-3 justify-center pt-2 border-t">
                      {crops.map((crop) => (
                        <div key={crop} className="flex items-center gap-2 text-xs">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: cropColors[crop] }}
                          />
                          <span>{crop}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Temperature Category vs Productivity</CardTitle>
              <CardDescription>Productivity by temperature ranges {selectedCrop === "all" ? "(all crops)" : `(${selectedCrop})`}</CardDescription>
            </CardHeader>
            <CardContent>
              {temperatureProductivityData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={temperatureProductivityData} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      type="number" 
                      stroke="hsl(var(--muted-foreground))"
                      label={{ value: 'Sum of Productivity_per_Hectare', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="category" 
                      stroke="hsl(var(--muted-foreground))"
                      width={120}
                    />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Legend />
                    {selectedCrop === "all" ? (
                      crops.map((crop) => (
                        <Bar 
                          key={crop}
                          dataKey={crop} 
                          stackId="a"
                          fill={cropColors[crop]}
                          name={crop}
                        />
                      ))
                    ) : (
                      <Bar dataKey="productivity" fill="hsl(var(--primary))" name="Productivity" />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Insights */}
        {insights && (
          <Card>
            <CardHeader>
              <CardTitle>Key Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 bg-primary/10 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Best Performing Province</p>
                  <p className="text-2xl font-bold text-primary">{insights.bestProvince.province}</p>
                  <p className="text-sm text-muted-foreground">{insights.bestProvince.yield} tons/hectare</p>
                </div>
                <div className="p-4 bg-accent/10 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Average Yield</p>
                  <p className="text-2xl font-bold text-accent">{insights.avgYield.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">tons/hectare</p>
                </div>
                <div className="p-4 bg-secondary/10 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Peak Sowing Period</p>
                  <p className="text-2xl font-bold text-secondary">{insights.peakMonth?.month || "N/A"}</p>
                  <p className="text-sm text-muted-foreground">{insights.peakMonth ? `${insights.peakMonth.yield} tons/hectare` : "No data"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default YieldTrends;
