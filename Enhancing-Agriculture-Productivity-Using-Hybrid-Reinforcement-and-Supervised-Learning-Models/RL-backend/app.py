import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.distributions import Normal
import gradio as gr
from sklearn.preprocessing import LabelEncoder

# ---------------------- Neural Network Definitions ----------------------
class PPOActor(nn.Module):
    def __init__(self, state_dim, action_dim, hidden_dim=128):
        super(PPOActor, self).__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
        )
        self.mu = nn.Linear(hidden_dim // 2, action_dim)
        self.sigma = nn.Linear(hidden_dim // 2, action_dim)

    def forward(self, x):
        features = self.net(x)
        mu = torch.tanh(self.mu(features))
        sigma = torch.nn.functional.softplus(self.sigma(features)) + 1e-4
        return mu, sigma

    def get_action(self, state):
        # default behavior: sample (kept as-is). If you want deterministic, replace with mu return.
        if isinstance(state, np.ndarray):
            state = torch.from_numpy(state).float()
        mu, sigma = self.forward(state)
        dist = Normal(mu, sigma)
        action = dist.rsample()
        log_prob = dist.log_prob(action).sum(dim=-1)
        return action, log_prob


# ---------------------- CROP RECOMMENDATION SYSTEM ----------------------
class ImprovedCropRecommendationSystem:
    def __init__(self, model_path: str = "crop_ppo_model.pt",
                 csv_path: str = "crop_features_custom_format.csv"):
        # force CPU to reduce differences across environments by default
        self.device = torch.device('cpu')
        self.model_path = model_path
        self.csv_path = csv_path

        # load CSV
        self.df = pd.read_csv(csv_path)
        self._clean_dataframe_strings()
        self._setup_encoders()
        self._load_model()
        self._setup_crop_data()

    def _clean_dataframe_strings(self):
        # strip whitespace from string columns to avoid encoder mismatches
        for c in self.df.columns:
            if self.df[c].dtype == object:
                self.df[c] = self.df[c].astype(str).str.strip()

    def _setup_encoders(self):
        self.district_encoder = LabelEncoder()
        self.crop_encoder = LabelEncoder()
        # Expect columns 'district_name' & 'crop_name' in CSV
        if 'district_name' not in self.df.columns:
            # attempt fallback
            possible = [c for c in self.df.columns if 'district' in c.lower()]
            if possible:
                self.df['district_name'] = self.df[possible[0]]
            else:
                self.df['district_name'] = 'Unknown'
        if 'crop_name' not in self.df.columns:
            possible = [c for c in self.df.columns if 'crop' in c.lower()]
            if possible:
                self.df['crop_name'] = self.df[possible[0]]
            else:
                self.df['crop_name'] = 'Unknown'

        self.df['district_name'] = self.df['district_name'].astype(str).str.strip()
        self.df['crop_name'] = self.df['crop_name'].astype(str).str.strip()

        self.district_encoder.fit(self.df['district_name'])
        self.crop_encoder.fit(self.df['crop_name'])
        self.df['district_encoded'] = self.district_encoder.transform(self.df['district_name'])
        self.df['crop_encoded'] = self.crop_encoder.transform(self.df['crop_name'])

    def _load_model(self):
        state_dim = 55
        action_dim = 10
        self.actor = PPOActor(state_dim, action_dim, hidden_dim=128).to(self.device)

        if os.path.exists(self.model_path):
            try:
                checkpoint = torch.load(self.model_path, map_location=self.device)
                if isinstance(checkpoint, dict) and 'actor_state_dict' in checkpoint:
                    self.actor.load_state_dict(checkpoint['actor_state_dict'])
                else:
                    # try direct state dict
                    self.actor.load_state_dict(checkpoint)
                self.actor.eval()
                print(f" Model loaded from {self.model_path}")
            except Exception as e:
                print(f" Failed to load model: {e}")
        else:
            print(f" Model not found at {self.model_path} - running without pretrained weights.")

    def _setup_crop_data(self):
        self.CROP_DISTRICTS = {
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
        }

        self.CROP_PHASE_REQUIREMENTS = {
            # keep for adjustments but not for area-scaling
            'Cotton': {
                'Sowing': {'fertilizer': 1.0, 'irrigation': 0.6, 'pesticide': 0.2, 'herbicide': 0.5, 'micronutrients': 0.4},
                'Vegetative': {'fertilizer': 1.0, 'irrigation': 1.0, 'pesticide': 1.0, 'herbicide': 0.8, 'micronutrients': 0.7},
                'Harvesting': {'fertilizer': 0.0, 'irrigation': 0.0, 'pesticide': 0.0, 'herbicide': 0.0, 'micronutrients': 0.0}
            },
            'Wheat': {
                'Sowing': {'fertilizer': 1.0, 'irrigation': 0.4, 'pesticide': 0.1, 'herbicide': 0.6, 'micronutrients': 0.5},
                'Vegetative': {'fertilizer': 0.8, 'irrigation': 1.0, 'pesticide': 0.6, 'herbicide': 0.7, 'micronutrients': 0.6},
                'Harvesting': {'fertilizer': 0.0, 'irrigation': 0.0, 'pesticide': 0.0, 'herbicide': 0.0, 'micronutrients': 0.0}
            },
            'Rice': {
                'Sowing': {'fertilizer': 1.0, 'irrigation': 0.8, 'pesticide': 0.2, 'herbicide': 0.7, 'micronutrients': 0.6},
                'Vegetative': {'fertilizer': 1.0, 'irrigation': 1.0, 'pesticide': 1.0, 'herbicide': 0.9, 'micronutrients': 0.8},
                'Harvesting': {'fertilizer': 0.0, 'irrigation': 0.0, 'pesticide': 0.0, 'herbicide': 0.0, 'micronutrients': 0.0}
            },
            'Potato': {
                'Sowing': {'fertilizer': 1.0, 'irrigation': 0.5, 'pesticide': 0.3, 'herbicide': 0.5, 'micronutrients': 0.7},
                'Vegetative': {'fertilizer': 0.9, 'irrigation': 1.0, 'pesticide': 1.0, 'herbicide': 0.8, 'micronutrients': 1.0},
                'Harvesting': {'fertilizer': 0.0, 'irrigation': 0.0, 'pesticide': 0.0, 'herbicide': 0.0, 'micronutrients': 0.0}
            },
            'Tomato': {
                'Sowing': {'fertilizer': 1.0, 'irrigation': 0.6, 'pesticide': 0.3, 'herbicide': 0.6, 'micronutrients': 0.8},
                'Vegetative': {'fertilizer': 1.0, 'irrigation': 1.0, 'pesticide': 1.0, 'herbicide': 0.9, 'micronutrients': 1.0},
                'Harvesting': {'fertilizer': 0.0, 'irrigation': 0.0, 'pesticide': 0.0, 'herbicide': 0.0, 'micronutrients': 0.0}
            },
            'Sugarcane': {
                'Sowing': {'fertilizer': 1.0, 'irrigation': 0.7, 'pesticide': 0.2, 'herbicide': 0.8, 'micronutrients': 0.5},
                'Vegetative': {'fertilizer': 1.0, 'irrigation': 1.0, 'pesticide': 0.8, 'herbicide': 1.0, 'micronutrients': 0.7},
                'Harvesting': {'fertilizer': 0.0, 'irrigation': 0.0, 'pesticide': 0.0, 'herbicide': 0.0, 'micronutrients': 0.0}
            }
        }

        self.CROP_YIELDS = {
            'Cotton': {'min': 2.96, 'max': 4.8, 'market_price': 12000},
            'Wheat': {'min': 3.71, 'max': 5.8, 'market_price': 4500},
            'Rice': {'min': 4.45, 'max': 6.4, 'market_price': 6500},
            'Potato': {'min': 19.77, 'max': 38.0, 'market_price': 50},
            'Tomato': {'min': 24.71, 'max': 55.0, 'market_price': 60},
            'Sugarcane': {'min': 74.13, 'max': 95.0, 'market_price': 350}
        }

        self.PRICES_PKR = {
            'fertilizer_per_kg': 150,
            'irrigation_per_hectare_season': 24700,
            'pesticide_per_liter': 1500,
            'seed_per_kg': 200,
            'soil_amendment_per_kg': 50,
            'herbicide_per_liter': 1200,
            'micronutrient_per_kg': 400,
            'labor_per_hectare_season': 37050,
            'machinery_per_hectare_season': 44460,
            'land_preparation': 14820
        }

        self.HECTARE_TO_ACRE = 2.47105

    def predict_yield(self, actions, crop):
        """
        Comprehensive yield prediction using multiple agricultural inputs.
        Based on Pakistani agricultural data and progressive farming techniques.
        
        Args:
            actions: numpy array with [fertilizer, irrigation, pesticide, soil_ph, 
                     seed, soil_amendment, herbicide, micronutrients, row_spacing, mulching]
            crop: crop name
        
        Returns:
            predicted yield in tons per hectare
        """
        fertilizer = actions[0]      # kg/ha
        irrigation = actions[1]      # mm
        pesticide = actions[2]       # L/ha
        soil_ph = actions[3]         # pH value
        seed_density = actions[4]    # kg/ha
        soil_amendment = actions[5]  # kg/ha
        herbicide = actions[6]       # L/ha
        micronutrients = actions[7]  # kg/ha
        row_spacing = actions[8]     # cm
        mulching = actions[9]        # cm

        crop_data = self.CROP_YIELDS[crop]
        base_yield = crop_data['min']
        
        # 1. FERTILIZER EFFECT (30% contribution)
        # Diminishing returns after optimal application
        optimal_fert = {'Cotton': 120, 'Wheat': 120, 'Rice': 100, 
                       'Potato': 150, 'Tomato': 180, 'Sugarcane': 200}
        fert_ratio = fertilizer / optimal_fert.get(crop, 120)
        fert_effect = 1 + 0.30 * (1 - np.exp(-2.5 * fert_ratio))
        
        # 2. IRRIGATION EFFECT (25% contribution)
        # Water stress significantly impacts yield
        optimal_irrig = {'Cotton': 600, 'Wheat': 400, 'Rice': 1200, 
                        'Potato': 500, 'Tomato': 600, 'Sugarcane': 1500}
        irrig_ratio = irrigation / optimal_irrig.get(crop, 600)
        irrig_effect = 1 + 0.25 * (1 - np.exp(-2.0 * irrig_ratio))
        
        # 3. PESTICIDE EFFECT (10% contribution)
        # Protects against yield losses from pests
        pest_protection = min(pesticide / 5.0, 1.0)  # normalize to max 5 L/ha
        pest_effect = 1 + 0.10 * pest_protection
        
        # 4. SOIL pH EFFECT (8% contribution)
        # Optimal pH ranges by crop
        optimal_ph = {'Cotton': 6.5, 'Wheat': 6.5, 'Rice': 6.0, 
                     'Potato': 5.5, 'Tomato': 6.5, 'Sugarcane': 6.5}
        target_ph = optimal_ph.get(crop, 6.5)
        ph_deviation = abs(soil_ph - target_ph)
        ph_effect = 1 + 0.08 * np.exp(-ph_deviation)  # penalty for deviation
        
        # 5. SEED DENSITY EFFECT (7% contribution)
        # Proper plant population
        optimal_seed = {'Cotton': 80, 'Wheat': 100, 'Rice': 80, 
                       'Potato': 2000, 'Tomato': 0.3, 'Sugarcane': 8000}
        if crop == 'Sugarcane':
            seed_effect = 1.05  # Fixed for sugarcane (uses setts)
        else:
            seed_ratio = seed_density / optimal_seed.get(crop, 100)
            seed_effect = 1 + 0.07 * (1 - abs(1 - seed_ratio))  # penalty if too low/high
        
        # 6. MICRONUTRIENTS EFFECT (6% contribution)
        # Essential for plant health and yield
        micro_ratio = min(micronutrients / 10.0, 1.0)
        micro_effect = 1 + 0.06 * micro_ratio
        
        # 7. HERBICIDE EFFECT (5% contribution)
        # Reduces weed competition
        herb_protection = min(herbicide / 3.0, 1.0)
        herb_effect = 1 + 0.05 * herb_protection
        
        # 8. SOIL AMENDMENT EFFECT (4% contribution)
        # Improves soil structure and nutrient availability
        amendment_ratio = min(soil_amendment / 100.0, 1.0)
        amendment_effect = 1 + 0.04 * amendment_ratio
        
        # 9. ROW SPACING EFFECT (3% contribution)
        # Optimal spacing varies by crop
        optimal_spacing = {'Cotton': 75, 'Wheat': 20, 'Rice': 20, 
                          'Potato': 60, 'Tomato': 60, 'Sugarcane': 90}
        target_spacing = optimal_spacing.get(crop, 30)
        spacing_deviation = abs(row_spacing - target_spacing) / target_spacing
        spacing_effect = 1 + 0.03 * (1 - spacing_deviation)
        
        # 10. MULCHING EFFECT (2% contribution)
        # Conserves moisture and suppresses weeds
        mulch_ratio = min(mulching / 5.0, 1.0)
        mulch_effect = 1 + 0.02 * mulch_ratio
        
        # COMBINE ALL EFFECTS
        total_multiplier = (fert_effect * irrig_effect * pest_effect * 
                          ph_effect * seed_effect * micro_effect * 
                          herb_effect * amendment_effect * spacing_effect * 
                          mulch_effect)
        
        # Calculate predicted yield
        predicted_yield = base_yield * total_multiplier
        
        # Cap at realistic maximum for progressive farming in Pakistan
        return min(predicted_yield, crop_data['max'])

    def calculate_detailed_financials(self, actions_by_phase, crop, area_hectares, season='Kharif'):
        total_costs = {
            'fertilizer': 0, 'irrigation': 0, 'pesticide': 0, 'seed': 0,
            'soil_amendment': 0, 'herbicide': 0, 'micronutrient': 0,
            'labor': 0, 'machinery': 0,
            'land_prep': self.PRICES_PKR['land_preparation'] * area_hectares
        }

        total_fertilizer = sum(actions[0] for actions in actions_by_phase.values())
        total_pesticide = sum(actions[2] for actions in actions_by_phase.values())
        total_seed = sum(actions[4] for actions in actions_by_phase.values())
        total_herbicide = sum(actions[6] for actions in actions_by_phase.values())
        total_micronutrient = sum(actions[7] for actions in actions_by_phase.values())

        total_costs['fertilizer'] = total_fertilizer * self.PRICES_PKR['fertilizer_per_kg'] * area_hectares
        total_costs['irrigation'] = self.PRICES_PKR['irrigation_per_hectare_season'] * area_hectares
        total_costs['pesticide'] = min(total_pesticide, 3) * self.PRICES_PKR['pesticide_per_liter'] * area_hectares
        total_costs['seed'] = (total_seed / 3) * self.PRICES_PKR['seed_per_kg'] * area_hectares
        total_costs['herbicide'] = min(total_herbicide, 2) * self.PRICES_PKR['herbicide_per_liter'] * area_hectares
        total_costs['micronutrient'] = (total_micronutrient / 3) * self.PRICES_PKR['micronutrient_per_kg'] * area_hectares
        total_costs['labor'] = self.PRICES_PKR['labor_per_hectare_season'] * area_hectares
        total_costs['machinery'] = self.PRICES_PKR['machinery_per_hectare_season'] * area_hectares

        total_cost = sum(total_costs.values())

        avg_actions = np.mean([actions for actions in actions_by_phase.values()], axis=0)
        predicted_yield_per_hectare = self.predict_yield(avg_actions, crop)
        total_yield = predicted_yield_per_hectare * area_hectares

        market_price = self.CROP_YIELDS[crop]['market_price']

        if crop == 'Cotton':
            total_revenue = (total_yield * 1000 / 40) * market_price
        elif crop in ['Potato', 'Tomato']:
            total_revenue = total_yield * 1000 * market_price
        else:
            total_revenue = (total_yield * 1000 / 40) * market_price

        season_factor = 1.05 if season == 'Kharif' else 1.0
        total_revenue *= season_factor

        net_profit = total_revenue - total_cost

        return {
            'cost_breakdown': total_costs,
            'total_cost': total_cost,
            'cost_per_hectare': total_cost / area_hectares,
            'predicted_yield_tons': total_yield,
            'yield_per_hectare': predicted_yield_per_hectare,
            'market_price': market_price,
            'total_revenue': total_revenue,
            'revenue_per_hectare': total_revenue / area_hectares,
            'net_profit': net_profit,
            'profit_per_hectare': net_profit / area_hectares,
            'roi_percentage': (net_profit / total_cost * 100) if total_cost > 0 else 0
        }

    def generate_recommendation(self, district: str, crop: str, area_hectares: float = 1.0,
                               season: str = 'Kharif'):
        if crop not in self.CROP_DISTRICTS:
            return {'error': f'Invalid crop. Choose from: {list(self.CROP_DISTRICTS.keys())}'}

        if district not in self.CROP_DISTRICTS[crop]:
            return {'error': f'District {district} not suitable for {crop}. Valid districts: {self.CROP_DISTRICTS[crop]}'}

        state = self._create_state_vector(district, crop, season)

        phases = ['Sowing', 'Vegetative', 'Harvesting']
        actions_by_phase = {}

        for phase_idx, phase_name in enumerate(phases):
            state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)

            with torch.no_grad():
                action, _ = self.actor.get_action(state_tensor)

            action_np = self._scale_actions(action.cpu().numpy()[0])
            actions_by_phase[phase_name] = action_np

        financials = self.calculate_detailed_financials(actions_by_phase, crop, area_hectares, season)

        recommendation = {
            'farm_info': {
                'crop': crop,
                'district': district,
                'area_hectares': area_hectares,
                'area_acres': round(area_hectares * self.HECTARE_TO_ACRE, 2),
                'season': season
            },
            'phase_recommendations': {},
            'financial_analysis': financials,
        }

        for phase_name, actions in actions_by_phase.items():
            adjusted_actions = actions.copy()
            
            # Get crop-specific phase requirements
            phase_reqs = self.CROP_PHASE_REQUIREMENTS.get(crop, {}).get(phase_name, {})

            # SOWING PHASE RULES
            if phase_name == 'Sowing':
                adjusted_actions[1] = adjusted_actions[1] * phase_reqs.get('irrigation', 0.5)
                adjusted_actions[2] = adjusted_actions[2] * phase_reqs.get('pesticide', 0.1)
                adjusted_actions[6] = adjusted_actions[6] * phase_reqs.get('herbicide', 0.6)
                adjusted_actions[7] = adjusted_actions[7] * phase_reqs.get('micronutrients', 0.6)
            
            # VEGETATIVE PHASE RULES
            elif phase_name == 'Vegetative':
                adjusted_actions[0] = adjusted_actions[0] * phase_reqs.get('fertilizer', 1.0)
                adjusted_actions[1] = adjusted_actions[1] * phase_reqs.get('irrigation', 1.0)
                adjusted_actions[2] = adjusted_actions[2] * phase_reqs.get('pesticide', 1.0)
                adjusted_actions[6] = adjusted_actions[6] * phase_reqs.get('herbicide', 1.0)
                adjusted_actions[7] = adjusted_actions[7] * phase_reqs.get('micronutrients', 1.0)
                adjusted_actions[4] = 0
                adjusted_actions[5] = adjusted_actions[5] * 0.4
            
            # HARVESTING PHASE RULES
            elif phase_name == 'Harvesting':
                adjusted_actions[0] = 0  # No fertilizer
                adjusted_actions[1] = 0  # No irrigation
                adjusted_actions[2] = 0  # No pesticide
                adjusted_actions[4] = 0  # No seeds
                adjusted_actions[5] = 0  # No soil amendment
                adjusted_actions[6] = 0  # No herbicide
                adjusted_actions[7] = 0  # No micronutrients

            # ensure no negative values after adjustments
            adjusted_actions = np.maximum(adjusted_actions, 0.0)

            # Cap fertilizer at 80 kg/ha per phase
            adjusted_actions[0] = min(adjusted_actions[0], 80)

            # apply realistic caps to other inputs
            adjusted_actions[1] = float(np.clip(adjusted_actions[1], 0.0, 500.0))   # irrigation mm
            adjusted_actions[2] = float(np.clip(adjusted_actions[2], 0.0, 10.0))    # pesticide L/ha
            adjusted_actions[4] = float(np.clip(adjusted_actions[4], 0.0, 300.0))   # seed kg/ha
            adjusted_actions[5] = float(np.clip(adjusted_actions[5], 0.0, 200.0))   # soil amend kg/ha
            adjusted_actions[6] = float(np.clip(adjusted_actions[6], 0.0, 10.0))    # herbicide L/ha
            adjusted_actions[7] = float(np.clip(adjusted_actions[7], 0.0, 20.0))    # micro kg/ha
            adjusted_actions[8] = float(np.clip(adjusted_actions[8], 10.0, 40.0))   # row spacing cm
            adjusted_actions[9] = float(np.clip(adjusted_actions[9], 0.0, 10.0))    # mulching cm

            # Prepare seed display (special-case sugarcane)
            seed_value = None
            if crop == 'Sugarcane':
                # Use None to indicate planting material (setts) - not seed kg/ha
                seed_value = None
            else:
                seed_value = round(adjusted_actions[4], 1)

            recommendation['phase_recommendations'][phase_name] = {
                'fertilizer_kg_hectare': round(adjusted_actions[0], 1),
                'irrigation_mm': round(adjusted_actions[1], 1),
                'pesticide_l_hectare': round(adjusted_actions[2], 2),
                'soil_ph': round(adjusted_actions[3], 1),
                'seed_density_kg_hectare': seed_value,
                'soil_amendment_kg_hectare': round(adjusted_actions[5], 1),
                'herbicide_l_hectare': round(adjusted_actions[6], 2),
                'micronutrients_kg_hectare': round(adjusted_actions[7], 2),
                'row_spacing_cm': round(adjusted_actions[8], 1),
                'mulching_cm': round(adjusted_actions[9], 1),
            }

        return recommendation

    def _create_state_vector(self, district, crop, season):
        # sanitize and encode
        district = str(district).strip()
        crop = str(crop).strip()
        season_code = 1.0 if str(season).strip() == 'Kharif' else 0.0

        district_code = 0
        crop_code = 0
        try:
            district_code = int(self.district_encoder.transform([district])[0]) if district in self.district_encoder.classes_ else 0
        except Exception:
            district_code = 0
        try:
            crop_code = int(self.crop_encoder.transform([crop])[0]) if crop in self.crop_encoder.classes_ else 0
        except Exception:
            crop_code = 0

        state = np.zeros(55, dtype=np.float32)
        state[0] = float(district_code)
        state[1] = float(crop_code)
        state[2] = 0.0
        state[-2] = float(season_code)
        state[-1] = 0.5
        return state

    def _scale_actions(self, normalized_actions):
        # normalized_actions may be tensor or numpy array
        arr = np.array(normalized_actions, dtype=float).flatten()
        # clip normalized [-1,1]
        arr = np.clip(arr, -1.0, 1.0)

        ranges = {
            0: (49, 148), 1: (49, 124), 2: (1.2, 6.2), 3: (6.0, 7.5),
            4: (62, 124), 5: (12, 49), 6: (0.5, 3.7), 7: (1.2, 7.4),
            8: (20, 30), 9: (2, 5)
        }

        scaled = np.zeros(10, dtype=float)
        for i in range(10):
            min_val, max_val = ranges[i]
            scaled[i] = min_val + (arr[i] + 1.0) * (max_val - min_val) / 2.0

        return scaled


# ---------------------- GRADIO INTERFACE ----------------------
def format_output(rec):
    if 'error' in rec:
        return f" ERROR: {rec['error']}"

    info = rec['farm_info']
    fin = rec['financial_analysis']

    output = f"""
#  AI-Powered Crop Management Recommendations
##  Farm Details
- **Crop:** {info['crop']}
- **District:** {info['district']}
- **Area:** {info['area_hectares']:.2f} hectares ({info['area_acres']:.2f} acres)
- **Season:** {info['season']}
##  Financial Analysis
- **Total Investment:** PKR {fin['total_cost']:,.0f}
- **Expected Revenue:** PKR {fin['total_revenue']:,.0f}
- **Net Profit:** PKR {fin['net_profit']:,.0f}
- **Profit per Hectare:** PKR {fin['profit_per_hectare']:,.0f}
- **ROI:** {fin['roi_percentage']:.1f}%
##  Yield Projection
- **Total Yield:** {fin['predicted_yield_tons']:.2f} tons
- **Yield per Hectare:** {fin['yield_per_hectare']:.2f} tons/hectare
- **Market Price:** PKR {fin['market_price']:,.0f}
##  Phase-wise Inputs (per hectare)
"""

    for phase, inputs in rec['phase_recommendations'].items():
        output += f"\n###  {phase}\n"
        output += f"- Fertilizer: {inputs['fertilizer_kg_hectare']} kg/hectare\n"
        output += f"- Irrigation: {inputs['irrigation_mm']} mm\n"
        output += f"- Pesticide: {inputs['pesticide_l_hectare']} L/hectare\n"
        output += f"- Soil pH: {inputs['soil_ph']}\n"
        seed_val = inputs['seed_density_kg_hectare']
        if seed_val is None:
            output += "- Planting material: Use sugarcane setts (50,000 - 60,000 / ha) \n"
        elif seed_val > 0:
            output += f"- Seed Density: {seed_val} kg/hectare\n"
        output += f"- Herbicide: {inputs['herbicide_l_hectare']} L/hectare\n"
        output += f"- Micronutrients: {inputs['micronutrients_kg_hectare']} kg/hectare\n"

    recommendation = " Highly Profitable" if fin['roi_percentage'] > 30 else "⚠️ Moderate Returns" if fin['roi_percentage'] > 15 else "⚠️ Review Input Costs"
    output += f"\n##  Recommendation\n{recommendation}"

    return output


def update_districts(crop):
    if crop in system.CROP_DISTRICTS:
        return gr.Dropdown(choices=system.CROP_DISTRICTS[crop], value=system.CROP_DISTRICTS[crop][0])
    return gr.Dropdown(choices=[], value=None)


def predict(crop, district, area_hectares, season):
    try:
        rec = system.generate_recommendation(district, crop, area_hectares, season)
        return format_output(rec)
    except Exception as e:
        return f" Error: {str(e)}"


# Initialize system
system = ImprovedCropRecommendationSystem(
    model_path="crop_ppo_model.pt",
    csv_path="crop_features_custom_format.csv"
)

# Create Gradio interface
with gr.Blocks() as demo:
    gr.Markdown("#  AI-Powered Crop Recommendation System")
    gr.Markdown("Get optimized farming recommendations based on your crop, location, and farm size.")

    with gr.Row():
        with gr.Column():
            crop_input = gr.Dropdown(
                choices=list(system.CROP_DISTRICTS.keys()),
                label="Select Crop",
                value="Wheat"
            )
            district_input = gr.Dropdown(
                choices=system.CROP_DISTRICTS["Wheat"],
                label="Select District",
                value=system.CROP_DISTRICTS["Wheat"][0]
            )
            area_input = gr.Number(
                label="Farm Area (Hectares)",
                value=2.0,
                minimum=0.1
            )
            season_input = gr.Radio(
                choices=["Kharif", "Rabi"],
                label="Season",
                value="Kharif"
            )
            submit_btn = gr.Button("Generate Recommendation", variant="primary")

        with gr.Column():
            output = gr.Markdown(label="Recommendations")

    crop_input.change(fn=update_districts, inputs=crop_input, outputs=district_input)
    submit_btn.click(fn=predict, inputs=[crop_input, district_input, area_input, season_input], outputs=output)

    gr.Markdown("---")
    gr.Markdown("**Note:** All calculations are based on Pakistani agricultural data and market prices.")

if __name__ == "__main__":
    demo.launch()