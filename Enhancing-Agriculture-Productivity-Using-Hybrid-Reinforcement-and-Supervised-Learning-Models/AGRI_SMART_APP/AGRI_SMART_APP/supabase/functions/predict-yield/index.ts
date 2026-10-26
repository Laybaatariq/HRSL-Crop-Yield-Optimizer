import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      province,
      district,
      crop,
      soilType,
      year,
      area,
      temperature,
      rainfall,
      nitrogen,
      phosphorus,
      potassium,
      soilPH,
      ndvi,
      sowingDate,
      harvestingDate,
    } = await req.json();

    console.log('Prediction request:', {
      province,
      district,
      crop,
      soilType,
      year,
      area,
    });

    // AI Gateway API Key for authentication
    const API_KEY = Deno.env.get("API_KEY");
    if (!API_KEY) {
      throw new Error("AI Gateway API Key is not configured");
    }

    // Create detailed prompt for yield prediction
    const prompt = `You are an expert agricultural scientist specializing in crop yield prediction for Pakistan. 

Predict the crop yield based on the following parameters:
- Province: ${province}
- District: ${district}
- Crop: ${crop}
- Soil Type: ${soilType}
- Year: ${year}
- Area (hectares): ${area}
- Sowing Date: ${sowingDate || 'Not provided'}
- Harvest Date: ${harvestingDate || 'Not provided'}
${temperature ? `- Temperature (°C): ${temperature}` : ''}
${rainfall ? `- Rainfall (mm): ${rainfall}` : ''}
${nitrogen ? `- Nitrogen (kg/ha): ${nitrogen}` : ''}
${phosphorus ? `- Phosphorus (kg/ha): ${phosphorus}` : ''}
${potassium ? `- Potassium (kg/ha): ${potassium}` : ''}
${soilPH ? `- Soil pH: ${soilPH}` : ''}
${ndvi ? `- NDVI: ${ndvi}` : ''}

Based on typical yield patterns in Pakistan for this region and crop type, provide:
1. A predicted yield in tons per hectare (realistic value between 1-10 for most crops)
2. A formatted yield value with proper units
3. Three specific, actionable recommendations to improve yield

Consider factors like:
- Regional climate patterns for ${province}, ${district}
- Optimal growing conditions for ${crop}
- ${soilType} soil characteristics
- Nutrient levels and soil pH
- Seasonal timing`;

    // Call AI Gateway completions endpoint with prediction tools
    const response = await fetch("https://ai.gateway/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are an agricultural expert providing accurate crop yield predictions for Pakistani farmers."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "predict_crop_yield",
              description: "Predict crop yield based on agricultural parameters",
              parameters: {
                type: "object",
                properties: {
                  predicted_yield: {
                    type: "number",
                    description: "Predicted yield in tons per hectare"
                  },
                  formatted_yield: {
                    type: "string",
                    description: "Formatted yield with units (e.g., '4.5 tons/hectare')"
                  },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of 3 specific actionable recommendations"
                  }
                },
                required: ["predicted_yield", "formatted_yield", "recommendations"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "predict_crop_yield" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), 
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }), 
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${errorText}`);
    }

    const result = await response.json();
    console.log("AI response:", JSON.stringify(result, null, 2));

    // Extract tool call result
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const predictionData = JSON.parse(toolCall.function.arguments);
    console.log("Prediction data:", predictionData);

    return new Response(
      JSON.stringify({
        predicted_yield: predictionData.predicted_yield,
        formatted_yield: predictionData.formatted_yield,
        recommendations: predictionData.recommendations,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in predict-yield function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
