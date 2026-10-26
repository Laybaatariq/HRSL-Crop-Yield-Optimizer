import pandas as pd
import numpy as np
import joblib
from typing import Optional, Dict, Tuple

_loaded_model = None
_loaded_scaler = None
_loaded_encoders = None

# Training data statistics for confidence calculation
TRAINING_STATS = {
    'yield_per_ha': {
        'min': 1.5,
        'max': 4.2,
        'mean': 2.85,
        'std': 0.65
    },
    'area': {
        'min': 50,
        'max': 300,
        'mean': 150
    },
    'model_r2': 0.9440  # Your model's R² score
}

# Default values dictionary from your training data
# This will be used to auto-fill values when user doesn't enter them
DEFAULTS_DICT = {
    ('Lahore', 'Wheat'): {'Temperature(C)': 23.0, 'Avg Rainfall (mm)': 600.0, 'NDVI': 0.85, 'P (kg/ha)': 80.0, 'K (kg/ha)': 70.0, 'Soil pH': 7.25, 'Sowing Time': 'November', 'Harvest time': 'March, April'},
    ('Faisalabad', 'Wheat'): {'Temperature(C)': 24.0, 'Avg Rainfall (mm)': 350.0, 'NDVI': 0.75, 'P (kg/ha)': 70.0, 'K (kg/ha)': 60.0, 'Soil pH': 7.5, 'Sowing Time': 'November', 'Harvest time': 'April'},
    ('Multan', 'Wheat'): {'Temperature(C)': 25.0, 'Avg Rainfall (mm)': 250.0, 'NDVI': 0.72, 'P (kg/ha)': 65.0, 'K (kg/ha)': 55.0, 'Soil pH': 7.8, 'Sowing Time': 'November', 'Harvest time': 'April'},
    ('Hyderabad', 'Rice'): {'Temperature(C)': 35.0, 'Avg Rainfall (mm)': 800.0, 'NDVI': 0.72, 'P (kg/ha)': 70.0, 'K (kg/ha)': 100.0, 'Soil pH': 7.8, 'Sowing Time': 'June', 'Harvest time': 'October'},
    ('Karachi', 'Rice'): {'Temperature(C)': 34.0, 'Avg Rainfall (mm)': 700.0, 'NDVI': 0.68, 'P (kg/ha)': 65.0, 'K (kg/ha)': 90.0, 'Soil pH': 8.0, 'Sowing Time': 'June', 'Harvest time': 'October'},
    ('Peshawar', 'Maize'): {'Temperature(C)': 32.0, 'Avg Rainfall (mm)': 600.0, 'NDVI': 0.70, 'P (kg/ha)': 55.0, 'K (kg/ha)': 150.0, 'Soil pH': 7.3, 'Sowing Time': 'July', 'Harvest time': 'October'},
    ('Lahore', 'Cotton'): {'Temperature(C)': 36.0, 'Avg Rainfall (mm)': 450.0, 'NDVI': 0.68, 'P (kg/ha)': 48.0, 'K (kg/ha)': 45.0, 'Soil pH': 7.6, 'Sowing Time': 'May', 'Harvest time': 'November'},
    ('Multan', 'Cotton'): {'Temperature(C)': 38.0, 'Avg Rainfall (mm)': 220.0, 'NDVI': 0.75, 'P (kg/ha)': 50.0, 'K (kg/ha)': 52.0, 'Soil pH': 7.9, 'Sowing Time': 'May', 'Harvest time': 'November'},
    # Add more combinations as needed - this is a sample subset
}

def load_model_artifacts():
    """Load the model, scaler, and label encoders with caching"""
    global _loaded_model, _loaded_scaler, _loaded_encoders
    
    if _loaded_model is not None:
        return _loaded_model, _loaded_scaler, _loaded_encoders
        
    try:
        # Load model
        _loaded_model = joblib.load('LightGBM_tuned_model.joblib')
        print(" LightGBM model loaded successfully!")
        
        # Load scaler
        _loaded_scaler = joblib.load('scaler.pkl')
        print(" Scaler loaded successfully!")
        
        # Load label encoders
        _loaded_encoders = joblib.load('label_encoders.pkl')
        print(" Label encoders loaded successfully!")
        
        return _loaded_model, _loaded_scaler, _loaded_encoders
    except Exception as e:
        print(f" Loading failed: {e}")
        return None, None, None

def calculate_confidence_score(
    yield_per_ha: float,
    area: float,
    temperature: float,
    rainfall: float,
    soil_ph: float,
    ndvi: float
) -> Dict[str, any]:
    """
    Calculate confidence score for the prediction
    Returns: dict with confidence_score (0-100), confidence_level, and factors
    """
    confidence_factors = []
    penalty = 0
    
    # Factor 1: Base confidence from model R²
    base_confidence = TRAINING_STATS['model_r2'] * 100  # 94.4%
    
    # Factor 2: Yield within expected range (-10% if outside)
    if TRAINING_STATS['yield_per_ha']['min'] <= yield_per_ha <= TRAINING_STATS['yield_per_ha']['max']:
        confidence_factors.append(" Yield within typical range")
    else:
        penalty += 10
        if yield_per_ha < TRAINING_STATS['yield_per_ha']['min']:
            confidence_factors.append(" Yield below typical range (unusual conditions)")
        else:
            confidence_factors.append(" Yield above typical range (exceptional conditions)")
    
    # Factor 3: Area within training range (-15% if outside)
    if TRAINING_STATS['area']['min'] <= area <= TRAINING_STATS['area']['max']:
        confidence_factors.append(" Area within model training range")
    else:
        penalty += 15
        if area < TRAINING_STATS['area']['min']:
            confidence_factors.append(" Area smaller than training data (50-300 ha)")
        else:
            confidence_factors.append(" Area larger than training data (50-300 ha)")
    
    # Factor 4: Environmental parameters validity (-5% each if extreme)
    if not (15 <= temperature <= 45):
        penalty += 5
        confidence_factors.append(" Temperature outside typical range (15-45°C)")
    else:
        confidence_factors.append(" Temperature within normal range")
    
    if not (200 <= rainfall <= 2000):
        penalty += 5
        confidence_factors.append(" Rainfall outside typical range (200-2000mm)")
    else:
        confidence_factors.append(" Rainfall within normal range")
    
    if not (5.5 <= soil_ph <= 8.5):
        penalty += 5
        confidence_factors.append(" Soil pH outside optimal range (5.5-8.5)")
    else:
        confidence_factors.append(" Soil pH within optimal range")
    
    if not (0.3 <= ndvi <= 0.9):
        penalty += 5
        confidence_factors.append(" NDVI outside typical range (0.3-0.9)")
    else:
        confidence_factors.append(" NDVI indicates healthy vegetation")
    
    # Calculate final confidence score
    confidence_score = max(base_confidence - penalty, 50)  # Minimum 50%
    
    # Determine confidence level
    if confidence_score >= 90:
        confidence_level = "Very High"
        level_emoji = "🟢"
    elif confidence_score >= 80:
        confidence_level = "High"
        level_emoji = "🟢"
    elif confidence_score >= 70:
        confidence_level = "Good"
        level_emoji = "🟡"
    elif confidence_score >= 60:
        confidence_level = "Moderate"
        level_emoji = "🟡"
    else:
        confidence_level = "Low"
        level_emoji = "🔴"
    
    return {
        'score': confidence_score,
        'level': confidence_level,
        'emoji': level_emoji,
        'factors': confidence_factors
    }

def convert_to_month(date_string):
    """
    Convert any date format to month name
    Handles: '11/15/2021', '2021-11-15', 'November', etc.
    EXACT COPY from your notebook
    """
    try:
        # Try to parse as date
        date_obj = pd.to_datetime(date_string, errors='coerce')
        if not pd.isna(date_obj):
            return date_obj.strftime('%B')  # Returns 'November', etc.
        
        # If already a month name, return as is
        month_names = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']
        if str(date_string) in month_names:
            return str(date_string)
        
        # Default fallback
        return 'November'
    except:
        return 'November'

def preprocess_input(input_dict, label_encoders, feature_columns):
    """
    Preprocess user input for prediction
    Handles date conversion and encoding automatically
    EXACT COPY from your notebook
    """
    # Create DataFrame
    input_df = pd.DataFrame([input_dict])
    
    # Map categorical features to encoded versions
    feature_mapping = {
        'Province': 'Province_encoded',
        'District': 'District_encoded',
        'Crop Type': 'Crop Type_encoded',
        'Sowing Time': 'Sowing Time_encoded',
        'Harvest time': 'Harvest time_encoded'
    }
    
    # Handle Sowing Time (convert date → month → encode)
    if 'Sowing Time' in input_df.columns:
        sowing_month = convert_to_month(input_dict['Sowing Time'])
        if sowing_month in label_encoders['Sowing Time'].classes_:
            input_df['Sowing Time_encoded'] = label_encoders['Sowing Time'].transform([sowing_month])[0]
            print(f" Sowing: '{input_dict['Sowing Time']}' → '{sowing_month}'")
        else:
            # Use most common month if not found
            fallback = label_encoders['Sowing Time'].classes_[0]
            input_df['Sowing Time_encoded'] = label_encoders['Sowing Time'].transform([fallback])[0]
            print(f" Sowing: '{input_dict['Sowing Time']}' → '{fallback}' (fallback)")
    
    # Handle Harvest Time (convert date → month → encode)
    if 'Harvest time' in input_df.columns:
        harvest_month = convert_to_month(input_dict['Harvest time'])
        if harvest_month in label_encoders['Harvest time'].classes_:
            input_df['Harvest time_encoded'] = label_encoders['Harvest time'].transform([harvest_month])[0]
            print(f" Harvest: '{input_dict['Harvest time']}' → '{harvest_month}'")
        else:
            fallback = label_encoders['Harvest time'].classes_[0]
            input_df['Harvest time_encoded'] = label_encoders['Harvest time'].transform([fallback])[0]
            print(f" Harvest: '{input_dict['Harvest time']}' → '{fallback}' (fallback)")
    
    # Handle other categorical features
    for user_col, encoded_col in feature_mapping.items():
        if user_col in ['Province', 'District', 'Crop Type'] and user_col in input_df.columns:
            if input_dict[user_col] in label_encoders[user_col].classes_:
                input_df[encoded_col] = label_encoders[user_col].transform([input_dict[user_col]])[0]
            else:
                # Use most common if not found
                fallback = label_encoders[user_col].classes_[0]
                input_df[encoded_col] = label_encoders[user_col].transform([fallback])[0]
                print(f" {user_col}: '{input_dict[user_col]}' → '{fallback}' (not found)")
    
    # Create feature array in correct order
    processed_features = []
    for feature in feature_columns:
        if feature in input_df.columns:
            processed_features.append(input_df[feature].values[0])
        else:
            processed_features.append(0)
    
    return np.array(processed_features).reshape(1, -1)

def predict_yield(
    province: str,
    district: str,
    crop_type: str,
    year: int,
    area: float,
    temperature: float,
    rainfall: float,
    phosphorus: float,
    potassium: float,
    soil_ph: float,
    ndvi: float,
    sowing_time: str,
    harvest_time: str
) -> str:
    """
    Predict crop yield using the trained model
    Uses EXACT preprocessing from your working notebook
    NOW WITH CONFIDENCE SCORING!
    """
    try:
        # Load model artifacts
        model, scaler, label_encoders = load_model_artifacts()
        
        if model is None or scaler is None or label_encoders is None:
            return "##  Model Error\n\nFailed to load model artifacts. Please check if all files exist:\n- LightGBM_tuned_model.joblib\n- scaler.pkl\n- label_encoders.pkl"
        
        # Validate inputs
        if not sowing_time or not sowing_time.strip():
            return "##  Input Error\n\nSowing Time is required for accurate prediction"
        if not harvest_time or not harvest_time.strip():
            return "##  Input Error\n\nHarvest Time is required for accurate prediction"
        
        # Warning for small areas
        area_warning = ""
        if area < 50:
            area_warning = "\n **Note:** Model trained on farms 50-300 hectares. Predictions for smaller areas may be less accurate.\n"
        
        # Define feature columns in EXACT order from your training
        feature_columns = [
            'Province_encoded',
            'Crop Type_encoded',
            'Harvest time_encoded',
            'District_encoded',
            'Year ',  # Note: space after Year
            'NDVI',
            'Avg Rainfall (mm)',
            'Area in Hectares',
            'Temperature(C)',
            'Soil pH',
            'P (kg/ha)',
            'Sowing Time_encoded',
            'K (kg/ha)'
        ]
        
        # Prepare input dictionary
        input_data = {
            'Year ': float(year),
            'Area in Hectares': float(area),
            'Temperature(C)': float(temperature),
            'Avg Rainfall (mm)': float(rainfall),
            'P (kg/ha)': float(phosphorus),
            'K (kg/ha)': float(potassium),
            'Soil pH': float(soil_ph),
            'NDVI': float(ndvi),
            'Province': province,
            'District': district,
            'Crop Type': crop_type,
            'Sowing Time': sowing_time,
            'Harvest time': harvest_time
        }
        
        # Preprocess input
        processed_input = preprocess_input(input_data, label_encoders, feature_columns)
        
        # Scale features
        processed_input_scaled = scaler.transform(processed_input)
        
        # Make prediction
        prediction = model.predict(processed_input_scaled)[0]
        prediction = max(prediction, 0)  # Ensure non-negative
        
        # Calculate yield per hectare
        yield_per_ha = prediction / area
        
        # ===== NEW: Calculate Confidence Score =====
        confidence = calculate_confidence_score(
            yield_per_ha=yield_per_ha,
            area=area,
            temperature=temperature,
            rainfall=rainfall,
            soil_ph=soil_ph,
            ndvi=ndvi
        )
        
        # Generate output
        output_text = f"##  Crop Yield Prediction\n\n"
        output_text += area_warning
        output_text += f"**Crop:** {crop_type}\n"
        output_text += f"**Location:** {district}, {province}\n"
        output_text += f"**Year:** {year}\n"
        output_text += f"**Area:** {area} hectares\n\n"
        
        # ===== NEW: Confidence Section =====
        output_text += f"### {confidence['emoji']} Prediction Confidence\n"
        output_text += f"**Confidence Level:** {confidence['level']} ({confidence['score']:.1f}%)\n\n"
        output_text += "**Confidence Factors:**\n"
        for factor in confidence['factors']:
            output_text += f"- {factor}\n"
        output_text += "\n"
        
        output_text += f"###  Production Forecast:\n"
        output_text += f"- **Total Production:** {prediction:.2f} tons\n"
        output_text += f"- **Yield per Hectare:** {yield_per_ha:.2f} tons/ha\n\n"
        
        # Add prediction range based on confidence
        margin = (100 - confidence['score']) / 100 * 0.3  # Up to 30% margin for low confidence
        lower_bound = prediction * (1 - margin)
        upper_bound = prediction * (1 + margin)
        output_text += f"- **Prediction Range:** {lower_bound:.2f} - {upper_bound:.2f} tons\n\n"
        
        # Interpretation
        output_text += "###  Analysis:\n"
        
        if yield_per_ha == 0:
            output_text += "**Very Low** - No yield predicted\n"
            output_text += "- Check: Soil nutrients, water availability, pest control\n"
        elif yield_per_ha < 2:
            output_text += "**Below Average** - Lower than typical yield\n"
            output_text += "- Consider: Better fertilization, irrigation, soil management\n"
            output_text += "- Target: 2.5-3.5 tons/ha for wheat\n"
        elif yield_per_ha < 4:
            output_text += "**Good** - Solid production level\n"
            output_text += "- Within typical range for the region\n"
            output_text += "- Expected: 2.5-3.5 tons/ha for wheat\n"
        else:
            output_text += "**Excellent** - Outstanding yield!\n"
            output_text += "- Well above average performance\n"
            output_text += "- Optimal growing conditions achieved\n"
        
        # Add context
        output_text += f"\n**Context:**\n"
        output_text += f"- Pakistan average (wheat): 2.8-2.9 tons/ha\n"
        output_text += f"- Training data range: 1.5-4.2 tons/ha\n"
        output_text += f"- Progressive farmers: 3.5-4.0 tons/ha\n"
        
        output_text += f"\n---\n*Model Accuracy: R² = 0.9440 | Confidence: {confidence['level']}*"
        
        return output_text
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return f"##Prediction Error\n\n{str(e)}\n\n**Debug Info:**\n```\n{error_details}\n```"

# Province, District, and Crop mappings for Gradio dropdowns
PROVINCE_MAP = {
    "Balochistan": 0,
    "KPK": 2,
    "Punjab": 3,
    "Sindh": 4
}

DISTRICT_MAP = {
    # Punjab districts
    "Lahore": 99, "Faisalabad": 37, "Rawalpindi": 156, "Multan": 124,
    "Gujranwala": 42, "Sialkot": 176, "Bahawalpur": 10, "Sargodha": 166,
    "Jhang": 62, "D.G. Khan": 26, "Rahim Yar Khan": 152, "Sheikhupura": 170,
    "Gujrat": 43, "Kasur": 79, "Sahiwal": 162, "Okara": 140,
    "M.B. Din": 112, "Toba Tek Singh": 192, "Jhelum": 64, "Chakwal": 21,
    "Khushab": 86, "Mianwali": 120, "Bhakkar": 16, "Layyah": 105,
    "Vehari": 196, "Khanewal": 82, "Pakpattan": 143, "Bahawalnagar": 8,
    "Rajanpur": 154, "Lodhran": 107, "Nankana Sahib": 133, "Chiniot": 24,
    "Hafizabad": 48, "M. Garh": 110, "Attock": 2, "Talagang": 185,
    "Islamabad": 56,
    
    # Sindh districts
    "Karachi": 75, "Hyderabad": 54, "Sukkur": 179, "Larkana": 101,
    "Mirpurkhas": 121, "Jacobabad": 57, "Khairpur": 80, "Thatta": 190,
    "Badin": 6, "Sanghar": 164, "N. Feroze": 130, "Ghotki": 40,
    "Shaheed Benazir Abad": 168, "Shikarpur": 174, "Dadu": 31, "Umarkot": 195,
    "Tharparkar": 188, "Kashmore": 78, "Jamshoro": 60, "Matiari": 119,
    "Tando Allahyar": 186,
    
    # KPK districts
    "Peshawar": 147, "Mardan": 116, "Abbottabad": 1, "Swat": 182,
    "Bannu": 13, "Kohat": 93, "Charsadda": 23, "Nowshera": 138,
    "Mansehra": 115, "Swabi": 181, "D.I. Khan": 28, "Haripur": 52,
    "Malakand": 114, "Karak": 77, "Lakki Marwat": 100, "Tank": 187,
    "Dir Lower": 35, "Dir Upper": 36, "Buner": 18, "Shangla": 169,
    "Kohistan": 94, "Khyber": 89, "Bajour": 12, "Mohmand": 122,
    "Kurram": 98, "Hangu": 50, "Orakzai": 141, "N. Waziristan": 132,
    "S. Waziristan": 157, "Chitral": 25, "Battagram": 15,
    
    # Balochistan districts
    "Quetta": 149, "Khuzdar": 87, "Gwadar": 46, "Sibi": 177,
    "Loralai": 108, "Zhob": 199, "Killa Abdullah": 90, "Killa Saifullah": 91,
    "Pishin": 148, "Chagai": 20, "Mastung": 117, "Kalat": 71,
    "Kachhi": 68, "Nushki": 139, "Jhal Magsi": 61, "Awaran": 4,
    "Lasbela": 103, "Barkhan": 14, "Musa Khail": 128, "Kohlu": 95,
    "Dera Bugti": 34, "Ziarat": 201, "Kharan": 84, "Panjgur": 146,
    "Washuk": 197, "Harnai": 53, "Sherani": 173
}

CROP_MAP = {
    "Cotton": 0,
    "Maize": 1,
    "Potato": 2,
    "Rice": 3,
    "Sugarcane": 4,
    "Tomato": 5,
    "Wheat": 6
}