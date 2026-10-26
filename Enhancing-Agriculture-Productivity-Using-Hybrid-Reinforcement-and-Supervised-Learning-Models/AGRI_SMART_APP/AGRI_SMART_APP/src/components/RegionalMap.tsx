import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface RegionalMapProps {
  province?: string;
  district?: string;
  center?: [number, number];
  zoom?: number;
}

export const RegionalMap = ({ province, district, center = [30.3753, 69.3451], zoom = 6 }: RegionalMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map only once
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView(center, zoom);

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);

      // Add initial marker
      markerRef.current = L.marker(center).addTo(mapRef.current);
      markerRef.current.bindPopup('<b>Pakistan</b><br>Agricultural Region').openPopup();
    }

    return () => {
      // Cleanup on unmount
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !province) return;

    // Get coordinates for the selected province/district
    const coordinates = getCoordinates(province, district);
    
    if (coordinates) {
      // Zoom to location
      mapRef.current.setView(coordinates, district ? 10 : 8, {
        animate: true,
        duration: 1,
      });

      // Update marker
      if (markerRef.current) {
        markerRef.current.setLatLng(coordinates);
        markerRef.current.bindPopup(
          `<b>${district || province}</b><br>${province}${district ? `, ${district}` : ''}`
        ).openPopup();
      }
    }
  }, [province, district]);

  return (
    <div 
      ref={mapContainerRef} 
      className="w-full h-[500px] rounded-lg border border-border shadow-sm"
      style={{ zIndex: 0 }}
    />
  );
};

// Coordinates mapping for Pakistan provinces and major districts
function getCoordinates(province: string, district?: string): [number, number] | null {
  // Map short form province names to full names
  const provinceNameMap: Record<string, string> = {
    'KPK': 'Khyber Pakhtunkhwa',
  };
  
  // Use full province name if mapping exists
  const fullProvinceName = provinceNameMap[province] || province;
  
  const coordinates: Record<string, Record<string, [number, number]>> = {
    'Punjab': {
      '_default': [31.1471, 72.7478],
      'Lahore': [31.5204, 74.3587],
      'Faisalabad': [31.4504, 73.1350],
      'Multan': [30.1575, 71.5249],
      'Rawalpindi': [33.5651, 73.0169],
      'Gujranwala': [32.1617, 74.1883],
      'Sialkot': [32.4972, 74.5361],
      'Bahawalpur': [29.3544, 71.6911],
      'Sargodha': [32.0836, 72.6711],
      'Sahiwal': [30.6704, 73.1089],
      'Sheikhupura': [31.7130, 73.9850],
      'Jhang': [31.2681, 72.3181],
      'Rahim Yar Khan': [28.4202, 70.2952],
      'Kasur': [31.1177, 74.4507],
      'Gujrat': [32.5742, 74.0789],
      'Okara': [30.8081, 73.4596],
      'Vehari': [30.0452, 72.3489],
      'Mianwali': [32.5853, 71.5436],
      'Attock': [33.7668, 72.3604],
      'Chakwal': [32.9328, 72.8630],
      'Dera Ghazi Khan': [30.0561, 70.6403],
      'Khanewal': [30.3017, 71.9321],
      'Khushab': [32.2967, 72.3517],
      'Layyah': [30.9616, 70.9428],
      'Lodhran': [29.5339, 71.6322],
      'Mandi Bahauddin': [32.5861, 73.4917],
      'Muzaffargarh': [30.0705, 71.1936],
      'Narowal': [32.1009, 74.8728],
      'Nankana Sahib': [31.4497, 73.6978],
      'Pakpattan': [30.3436, 73.3858],
      'Rajanpur': [29.1044, 70.3297],
      'Toba Tek Singh': [30.9726, 72.4828],
      'Bhakkar': [31.6333, 71.0667],
      'Chiniot': [31.7194, 72.9783],
      'Hafizabad': [32.0707, 73.6880],
      'Jhelum': [32.9333, 73.7333],
    },
    'Sindh': {
      '_default': [25.8943, 68.5247],
      'Karachi': [24.8607, 67.0011],
      'Hyderabad': [25.3960, 68.3578],
      'Sukkur': [27.7050, 68.8577],
      'Larkana': [27.5598, 68.2144],
      'Nawabshah': [26.2442, 68.4100],
      'Mirpurkhas': [25.5277, 69.0111],
      'Jacobabad': [28.2769, 68.4514],
      'Shikarpur': [27.9550, 68.6383],
      'Khairpur': [27.5295, 68.7590],
      'Thatta': [24.7471, 67.9245],
      'Dadu': [26.7307, 67.7760],
      'Badin': [24.6559, 68.8371],
      'Sanghar': [26.0469, 68.9480],
      'Tharparkar': [24.8744, 70.2486],
      'Umerkot': [25.3549, 69.7378],
      'Matiari': [25.5975, 68.4467],
      'Tando Allahyar': [25.4607, 68.7197],
      'Tando Muhammad Khan': [25.1236, 68.5364],
      'Jamshoro': [25.4353, 68.2803],
      'Ghotki': [28.0053, 69.3147],
      'Naushahro Feroze': [26.8408, 68.1228],
      'Kashmore': [28.4321, 69.5835],
      'Sujawal': [24.6364, 68.0703],
    },
    'Khyber Pakhtunkhwa': {
      '_default': [34.9526, 72.3311],
      'Peshawar': [34.0151, 71.5249],
      'Mardan': [34.1987, 72.0401],
      'Abbottabad': [34.1463, 73.2176],
      'Swat': [35.2227, 72.4258],
      'Kohat': [33.5869, 71.4414],
      'Dera Ismail Khan': [31.8311, 70.9019],
      'Mansehra': [34.3300, 73.1967],
      'Bannu': [32.9889, 70.6056],
      'Charsadda': [34.1483, 71.7406],
      'Nowshera': [34.0153, 71.9747],
      'Swabi': [34.1201, 72.4697],
      'Haripur': [33.9944, 72.9347],
      'Karak': [33.1167, 71.0933],
      'Lakki Marwat': [32.6074, 70.9111],
      'Tank': [32.2172, 70.3830],
      'Hangu': [33.5322, 71.0594],
      'Buner': [34.4244, 72.4861],
      'Chitral': [35.8517, 71.7864],
      'Dir Lower': [34.8169, 71.8781],
      'Dir Upper': [35.2072, 71.8764],
      'Battagram': [34.6775, 73.0236],
      'Kohistan': [35.2167, 73.0333],
      'Shangla': [34.7653, 72.7708],
      'Tor Ghar': [34.5608, 72.8358],
    },
    'Balochistan': {
      '_default': [28.4893, 65.0967],
      'Quetta': [30.1798, 66.9750],
      'Turbat': [26.0061, 63.0486],
      'Gwadar': [25.1264, 62.3250],
      'Khuzdar': [27.8117, 66.6142],
      'Sibi': [29.5430, 67.8775],
      'Loralai': [30.3704, 68.5978],
      'Zhob': [31.3417, 69.4489],
      'Nasirabad': [28.3253, 67.9111],
      'Jaffarabad': [28.0226, 68.0367],
      'Kech': [26.5750, 63.4197],
      'Pishin': [30.5817, 66.9942],
      'Chagai': [29.3033, 64.7450],
      'Kalat': [29.0269, 66.5936],
      'Mastung': [29.7997, 66.8450],
      'Lasbela': [25.8456, 66.3692],
      'Awaran': [26.4567, 65.2278],
      'Dera Bugti': [29.0372, 69.1586],
      'Kohlu': [29.8967, 69.2531],
      'Jhal Magsi': [28.4011, 67.6439],
      'Killa Abdullah': [30.5853, 66.5853],
      'Killa Saifullah': [30.7039, 68.3678],
      'Kharan': [28.5842, 65.4153],
      'Panjgur': [26.9706, 64.0936],
      'Washuk': [26.8003, 64.7717],
    },
    'Azad Kashmir': {
      '_default': [33.9259, 73.7810],
      'Muzaffarabad': [34.3700, 73.4711],
      'Mirpur': [33.1497, 73.7516],
      'Rawalakot': [33.8578, 73.7597],
      'Kotli': [33.5175, 73.9022],
      'Bagh': [33.9808, 73.7772],
      'Bhimber': [32.9744, 74.0783],
      'Hattian Bala': [34.1736, 73.6342],
      'Haveli': [33.8308, 73.7269],
      'Neelum': [34.5889, 73.9194],
      'Sudhanoti': [33.6519, 73.6653],
    },
    'Gilgit-Baltistan': {
      '_default': [35.8283, 74.4641],
      'Gilgit': [35.9208, 74.3144],
      'Skardu': [35.2978, 75.6336],
      'Hunza': [36.3167, 74.6500],
      'Ghanche': [35.4203, 76.0628],
      'Astore': [35.3369, 74.9000],
      'Diamer': [35.4500, 74.3833],
      'Ghizer': [36.1833, 73.6500],
      'Kharmang': [35.3283, 76.0236],
      'Nagar': [36.1667, 74.6667],
      'Shigar': [35.4272, 75.7347],
    },
    'Islamabad': {
      '_default': [33.6844, 73.0479],
      'Islamabad': [33.6844, 73.0479],
    },
  };

  const provinceData = coordinates[fullProvinceName];
  if (!provinceData) return null;

  if (district && provinceData[district]) {
    return provinceData[district];
  }

  return provinceData['_default'];
}
