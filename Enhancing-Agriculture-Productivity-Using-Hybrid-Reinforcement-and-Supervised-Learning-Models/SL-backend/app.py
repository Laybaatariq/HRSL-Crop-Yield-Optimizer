import gradio as gr
import pandas as pd
import numpy as np
import joblib
import os
from inference_lightgbm import (
    predict_yield, 
    load_model_artifacts,
    PROVINCE_MAP, 
    DISTRICT_MAP, 
    CROP_MAP,
    DEFAULTS_DICT  # Import the defaults dictionary
)

print(" Starting Crop Yield Prediction System...")

# Pre-load the model when the app starts
print(" Loading AI model artifacts...")
model, scaler, encoders = load_model_artifacts()

if model is None or scaler is None or encoders is None:
    print(" Failed to load model artifacts. Please check if these files exist:")
    print("   - LightGBM_tuned_model.joblib")
    print("   - scaler.pkl")
    print("   - label_encoders.pkl")
else:
    print(" All model artifacts loaded successfully!")

def extract_year_from_date(date_string):
    """Extract year from date string or return current year if month name"""
    try:
        # Try to parse as date
        date_obj = pd.to_datetime(date_string, errors='coerce')
        if not pd.isna(date_obj):
            return int(date_obj.year)
        
        # If it's just a month name, return None (will use manual input)
        month_names = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']
        if str(date_string).strip() in month_names:
            return None
        
        return None
    except:
        return None

def auto_update_year(sowing_time):
    """Auto-update year field based on sowing time"""
    year = extract_year_from_date(sowing_time)
    if year is not None:
        return year
    else:
        # Return current value unchanged if only month name provided
        return gr.update()

def get_defaults(district, crop_type):
    """Get default values from dictionary for district-crop combination"""
    key = (district, crop_type)
    
    if key in DEFAULTS_DICT:
        defaults = DEFAULTS_DICT[key]
        return {
            'temperature': defaults.get('Temperature(C)', 25.0),
            'rainfall': defaults.get('Avg Rainfall (mm)', 500),
            'phosphorus': defaults.get('P (kg/ha)', 50),
            'potassium': defaults.get('K (kg/ha)', 50),
            'soil_ph': defaults.get('Soil pH', 7.0),
            'ndvi': defaults.get('NDVI', 0.7),
            'sowing_time': defaults.get('Sowing Time', 'November'),
            'harvest_time': defaults.get('Harvest time', 'April')
        }
    
    # Return generic defaults if not found
    return {
        'temperature': 25.0,
        'rainfall': 500,
        'phosphorus': 50,
        'potassium': 50,
        'soil_ph': 7.0,
        'ndvi': 0.7,
        'sowing_time': 'November',
        'harvest_time': 'April'
    }

def auto_fill_defaults(district, crop_type):
    """Auto-fill default values when district or crop changes"""
    defaults = get_defaults(district, crop_type)
    
    return (
        defaults['temperature'],
        defaults['rainfall'],
        defaults['phosphorus'],
        defaults['potassium'],
        defaults['soil_ph'],
        defaults['ndvi'],
        defaults['sowing_time'],
        defaults['harvest_time']
    )

# Create Gradio interface
with gr.Blocks(title=" Crop Yield Prediction System") as demo:
    gr.Markdown("""
    #  AI-Powered Crop Yield Prediction System
    ### Get accurate yield predictions based on your farming conditions
    """)
    
    gr.Markdown("###  Location & Crop Details")
    
    with gr.Row():
        with gr.Column():
            province = gr.Dropdown(
                choices=list(PROVINCE_MAP.keys()),
                label=" Province *",
                value="Punjab",
                info="Select your province"
            )
            district = gr.Dropdown(
                choices=list(DISTRICT_MAP.keys()),
                label=" District *",
                value="Lahore",
                info="Select your district - will auto-fill defaults"
            )
            crop_type = gr.Dropdown(
                choices=list(CROP_MAP.keys()),
                label=" Crop Type *",
                value="Wheat",
                info="Select crop - will auto-fill defaults"
            )
        
        with gr.Column():
            year = gr.Number(
                label=" Year *",
                value=2024,
                minimum=2000,
                maximum=2035,
                info="Year will auto-update from sowing date (or enter manually)"
            )
            area = gr.Number(
                label=" Area (Hectares) *",
                value=180.0,
                minimum=0.1,
                info="Recommended: 50-300 ha (model training range)"
            )
    
    gr.Markdown("###  Growing Conditions")
    gr.Markdown(" **Auto-Fill Feature:** Select district and crop to automatically fill typical values. You can still override any field!")
    
    with gr.Row():
        temperature = gr.Number(
            label=" Temperature (°C)",
            value=23.0,
            minimum=-10,
            maximum=50,
            info="Average temperature during season (auto-filled)"
        )
        rainfall = gr.Number(
            label=" Rainfall (mm)",
            value=500,
            minimum=0,
            maximum=3000,
            info="Average rainfall during season (auto-filled)"
        )
        phosphorus = gr.Number(
            label=" Phosphorus (kg/ha)",
            value=60,
            minimum=0,
            maximum=200,
            info="P content in soil (auto-filled)"
        )
    
    with gr.Row():
        potassium = gr.Number(
            label=" Potassium (kg/ha)",
            value=50,
            minimum=0,
            maximum=200,
            info="K content in soil (auto-filled)"
        )
        soil_ph = gr.Number(
            label=" Soil pH",
            value=7.0,
            minimum=4.0,
            maximum=9.0,
            info="Soil pH level (auto-filled)"
        )
        ndvi = gr.Number(
            label=" NDVI",
            value=0.7,
            minimum=0.0,
            maximum=1.0,
            info="Vegetation index (auto-filled)"
        )
    
    gr.Markdown("###  Planting Schedule")
    gr.Markdown(" **Tips:** Enter date with year (e.g., '11/15/2024') to auto-set Year | Or use auto-filled month names")
    
    with gr.Row():
        sowing_time = gr.Textbox(
            label=" Sowing Time",
            value="November",
            placeholder="e.g., 'November' or '11/15/2024'",
            info="Month name or date (auto-filled for district/crop)"
        )
        harvest_time = gr.Textbox(
            label=" Harvest Time",
            value="April",
            placeholder="e.g., 'April' or '4/30/2025'",
            info="Month name or date (auto-filled for district/crop)"
        )
    
    # Auto-update year when sowing time changes
    sowing_time.change(
        fn=auto_update_year,
        inputs=[sowing_time],
        outputs=[year]
    )
    
    # Auto-fill defaults when district or crop changes
    district.change(
        fn=auto_fill_defaults,
        inputs=[district, crop_type],
        outputs=[temperature, rainfall, phosphorus, potassium, soil_ph, ndvi, sowing_time, harvest_time]
    )
    
    crop_type.change(
        fn=auto_fill_defaults,
        inputs=[district, crop_type],
        outputs=[temperature, rainfall, phosphorus, potassium, soil_ph, ndvi, sowing_time, harvest_time]
    )
    
    predict_btn = gr.Button(" Predict Yield", variant="primary", size="lg")
    output = gr.Markdown(label="Prediction Result")
    
    predict_btn.click(
        predict_yield,
        inputs=[
            province, district, crop_type, year, area,
            temperature, rainfall, phosphorus, potassium,
            soil_ph, ndvi, sowing_time, harvest_time
        ],
        outputs=output
    )
    
    # ============================================
    # EXAMPLES & HELP
    # ============================================
    with gr.Accordion(" Examples & Guidelines", open=False):
        gr.Markdown("""
        ###  How the Auto-Fill Feature Works
        
        **Smart Defaults Based on Your Location:**
        1. Select your **District** and **Crop Type**
        2. All fields automatically fill with typical values for that area
        3. Values are based on historical data from Pakistan's agricultural regions
        4. You can override any auto-filled value manually
        
        **Example:** Select "Faisalabad" + "Wheat" and watch all fields update with optimal Faisalabad wheat conditions!
        
        ---
        
        ###  Crop-Specific Guidelines
        
        #### **Wheat (Rabi Crop)**
        - **Sowing:** November - December
        - **Harvest:** April - May
        - **Temp:** 15-25°C
        - **Rainfall:** 400-600mm
        
        #### **Rice (Kharif Crop)**
        - **Sowing:** June - July
        - **Harvest:** October - November
        - **Temp:** 30-38°C
        - **Rainfall:** 1000-2000mm
        
        #### **Maize (Kharif Crop)**
        - **Sowing:** June - July
        - **Harvest:** September - October
        - **Temp:** 25-35°C
        - **Rainfall:** 500-800mm
        
        #### **Cotton (Kharif Crop)**
        - **Sowing:** May - June
        - **Harvest:** October - December
        - **Temp:** 30-40°C
        - **Rainfall:** 500-1000mm
        
        ---
        
        ###  How to Use
        
        1. **Select Location:** Choose your province and district
        2. **Choose Crop:** Select the crop you want to predict
        3. **Auto-Fill Magic:** Watch as typical values fill automatically! ✨
        4. **Customize:** Adjust any auto-filled values if your conditions differ
        5. **Enter Sowing Date:** Type date (e.g., "11/15/2024") - Year will auto-update!
        6. **Predict:** Click the button to get results
        
        ###  Tips for Best Results
        
        - **Auto-Fill First:** Always select district and crop first to get accurate defaults
        - **Auto Year Feature:** Enter sowing date as "11/15/2024" format to automatically set the year
        - **Override When Needed:** Auto-filled values are typical - adjust if your farm differs
        - **NDVI values:** 0.6-0.9 for healthy crops (auto-filled appropriately)
        - **Leave Defaults:** If unsure, the auto-filled values work great!
        
        ###  Quick Test Examples
        
        **Try These Combinations:**
        1. **Faisalabad + Wheat** → See typical wheat conditions
        2. **Hyderabad + Rice** → See Sindh rice parameters
        3. **Multan + Cotton** → See cotton belt settings
        4. **Peshawar + Maize** → See KPK maize conditions
        
        Each combination will auto-fill with real regional data!
        """)
    
    # Footer
    gr.Markdown("---")
    gr.Markdown("""
    <div style='text-align: center; padding: 20px;'>
        <h3> Smart Agriculture AI System</h3>
        <p><b>Powered by LightGBM Machine Learning</b></p>
        <p><i>Model Accuracy: R² = 0.9440 (94.4% variance explained)</i></p>
        <p> <b>New!</b> Auto-fill feature uses real agricultural data from Pakistan</p>
        <p>All predictions are based on historical data patterns and trained models.</p>
    </div>
    """)

if __name__ == "__main__":
    print("=" * 60)
    print(" Starting Gradio interface...")
    print("=" * 60)
    
    # Verify all artifacts loaded
    if model is None or scaler is None or encoders is None:
        print(" WARNING: Model artifacts not loaded!")
        print(" Required files in current directory:")
        print("   - LightGBM_tuned_model.joblib")
        print("   - scaler.pkl")
        print("   - label_encoders.pkl")
        print(f"\n Current directory: {os.getcwd()}")
        print(f" Files found: {[f for f in os.listdir('.') if f.endswith(('.pkl', '.joblib'))]}")
    else:
        print(" All model artifacts loaded successfully!")
        print(" System ready for predictions!")
    
    print("\n Starting server...")
    print("=" * 60)
    
    try:
        demo.launch(
            server_name="0.0.0.0",
            share=True,
            show_error=True
        )
    except Exception as e:
        print(f" Launch failed: {e}")
        print(" Trying local launch...")
        demo.launch(share=False)