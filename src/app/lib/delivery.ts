// Delivery zones, Haversine calculation, and Jakarta areas + popular places

export interface DeliveryZone {
  id: string;
  name: string;
  minKm: number;
  maxKm: number;
  fee: number;
}

export interface DeliveryZonesConfig {
  restaurantLocation: { lat: number; lng: number };
  maxDistance: number; // km — beyond this, delivery not available
  zones: DeliveryZone[];
}

export interface JakartaArea {
  name: string;
  district: string;
  lat: number;
  lng: number;
  type?: string; // "Area" | "Apartment" | "Mall" | "Hotel" | etc.
}

// Default delivery zones config
export const DEFAULT_DELIVERY_CONFIG: DeliveryZonesConfig = {
  restaurantLocation: { lat: -6.2088, lng: 106.8456 }, // Default fallback — admin should configure via Delivery Zones in Restaurant Settings
  maxDistance: 15,
  zones: [
    { id: "1", name: "Nearby", minKm: 0, maxKm: 3, fee: 8000 },
    { id: "2", name: "Medium", minKm: 3, maxKm: 7, fee: 15000 },
    { id: "3", name: "Far", minKm: 7, maxKm: 12, fee: 25000 },
    { id: "4", name: "Very Far", minKm: 12, maxKm: 15, fee: 40000 },
  ],
};

// Haversine formula — calculates distance between two lat/lng points in km
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Find matching zone for a given distance
export function findZoneForDistance(
  distanceKm: number,
  config: DeliveryZonesConfig
): { zone: DeliveryZone; fee: number } | null {
  if (distanceKm > config.maxDistance) return null;

  // Sort zones by minKm to ensure correct matching
  const sortedZones = [...config.zones].sort((a, b) => a.minKm - b.minKm);

  for (const zone of sortedZones) {
    if (distanceKm >= zone.minKm && distanceKm < zone.maxKm) {
      return { zone, fee: zone.fee };
    }
  }

  // Edge case: exactly at maxKm of last zone
  const lastZone = sortedZones[sortedZones.length - 1];
  if (lastZone && distanceKm <= lastZone.maxKm) {
    return { zone: lastZone, fee: lastZone.fee };
  }

  return null;
}

// =====================================================================
// Comprehensive Jakarta areas + popular places (~300 entries)
// Organized by distance from restaurant (-6.2088, 106.8456 — Central Jakarta)
// =====================================================================

export const JAKARTA_AREAS: JakartaArea[] = [

  // ===================================================================
  // ZONE 1: CENTRAL JAKARTA (Jakarta Pusat) — 0–3 km from restaurant
  // ===================================================================

  // Kecamatan (Sub-districts)
  { name: "Menteng", district: "Jakarta Pusat", lat: -6.1944, lng: 106.8329, type: "Area" },
  { name: "Tanah Abang", district: "Jakarta Pusat", lat: -6.1862, lng: 106.8106, type: "Area" },
  { name: "Gambir", district: "Jakarta Pusat", lat: -6.1721, lng: 106.8228, type: "Area" },
  { name: "Kemayoran", district: "Jakarta Pusat", lat: -6.1580, lng: 106.8553, type: "Area" },
  { name: "Sawah Besar", district: "Jakarta Pusat", lat: -6.1571, lng: 106.8302, type: "Area" },
  { name: "Senen", district: "Jakarta Pusat", lat: -6.1745, lng: 106.8445, type: "Area" },
  { name: "Cempaka Putih", district: "Jakarta Pusat", lat: -6.1773, lng: 106.8685, type: "Area" },
  { name: "Johar Baru", district: "Jakarta Pusat", lat: -6.1812, lng: 106.8567, type: "Area" },

  // Apartments — Central Jakarta
  { name: "Thamrin Residences", district: "Jakarta Pusat", lat: -6.1920, lng: 106.8230, type: "Apartment" },
  { name: "Cosmo Terrace Thamrin City", district: "Jakarta Pusat", lat: -6.1915, lng: 106.8180, type: "Apartment" },
  { name: "Menteng Park Apartment", district: "Jakarta Pusat", lat: -6.1947, lng: 106.8412, type: "Apartment" },
  { name: "Salemba Residence", district: "Jakarta Pusat", lat: -6.1950, lng: 106.8520, type: "Apartment" },
  { name: "Menteng Square Apartment", district: "Jakarta Pusat", lat: -6.1955, lng: 106.8445, type: "Apartment" },
  { name: "1Park Residences Gandaria", district: "Jakarta Pusat", lat: -6.1898, lng: 106.8230, type: "Apartment" },
  { name: "The Wave Rasuna", district: "Jakarta Pusat", lat: -6.2190, lng: 106.8345, type: "Apartment" },
  { name: "Grand Menteng Residence", district: "Jakarta Pusat", lat: -6.1970, lng: 106.8400, type: "Apartment" },
  { name: "Gondangdia Residence", district: "Jakarta Pusat", lat: -6.1880, lng: 106.8310, type: "Apartment" },
  { name: "Cikini Gold Center", district: "Jakarta Pusat", lat: -6.1900, lng: 106.8380, type: "Apartment" },
  { name: "Galeri Ciumbuleuit Apartment", district: "Jakarta Pusat", lat: -6.1830, lng: 106.8250, type: "Apartment" },
  { name: "The Kensington Royal Suites", district: "Jakarta Pusat", lat: -6.1862, lng: 106.8195, type: "Apartment" },
  { name: "Thamrin Executive Residence", district: "Jakarta Pusat", lat: -6.1930, lng: 106.8220, type: "Apartment" },
  { name: "Springhill Terrace Kemayoran", district: "Jakarta Pusat", lat: -6.1548, lng: 106.8530, type: "Apartment" },
  { name: "RoyalE Springhill Kemayoran", district: "Jakarta Pusat", lat: -6.1535, lng: 106.8545, type: "Apartment" },
  { name: "The Mansion Kemayoran", district: "Jakarta Pusat", lat: -6.1502, lng: 106.8450, type: "Apartment" },
  { name: "Capitol Park Residence", district: "Jakarta Pusat", lat: -6.1990, lng: 106.8490, type: "Apartment" },
  { name: "M-Town Residence Serpong", district: "Jakarta Pusat", lat: -6.1858, lng: 106.8560, type: "Apartment" },
  { name: "Green Pramuka City", district: "Jakarta Pusat", lat: -6.1885, lng: 106.8620, type: "Apartment" },

  // Malls — Central Jakarta
  { name: "Grand Indonesia Mall", district: "Jakarta Pusat", lat: -6.1952, lng: 106.8199, type: "Mall" },
  { name: "Plaza Indonesia", district: "Jakarta Pusat", lat: -6.1935, lng: 106.8217, type: "Mall" },
  { name: "Sarinah", district: "Jakarta Pusat", lat: -6.1870, lng: 106.8243, type: "Mall" },
  { name: "Thamrin City", district: "Jakarta Pusat", lat: -6.1920, lng: 106.8170, type: "Mall" },
  { name: "Pasar Baru", district: "Jakarta Pusat", lat: -6.1670, lng: 106.8420, type: "Mall" },
  { name: "ITC Cempaka Mas", district: "Jakarta Pusat", lat: -6.1660, lng: 106.8700, type: "Mall" },
  { name: "Mega Glodok Kemayoran", district: "Jakarta Pusat", lat: -6.1540, lng: 106.8470, type: "Mall" },
  { name: "Atrium Senen", district: "Jakarta Pusat", lat: -6.1750, lng: 106.8440, type: "Mall" },

  // Hotels — Central Jakarta
  { name: "Hotel Indonesia Kempinski", district: "Jakarta Pusat", lat: -6.1950, lng: 106.8230, type: "Hotel" },
  { name: "Mandarin Oriental Jakarta", district: "Jakarta Pusat", lat: -6.1960, lng: 106.8310, type: "Hotel" },
  { name: "Pullman Jakarta Indonesia", district: "Jakarta Pusat", lat: -6.1940, lng: 106.8200, type: "Hotel" },
  { name: "Grand Hyatt Jakarta", district: "Jakarta Pusat", lat: -6.1955, lng: 106.8215, type: "Hotel" },
  { name: "Le Meridien Jakarta", district: "Jakarta Pusat", lat: -6.2105, lng: 106.8220, type: "Hotel" },
  { name: "The Hermitage Menteng", district: "Jakarta Pusat", lat: -6.1920, lng: 106.8345, type: "Hotel" },
  { name: "Hotel Borobudur Jakarta", district: "Jakarta Pusat", lat: -6.1750, lng: 106.8330, type: "Hotel" },
  { name: "Alila SCBD Jakarta", district: "Jakarta Pusat", lat: -6.2200, lng: 106.8100, type: "Hotel" },
  { name: "Ayana Midplaza Jakarta", district: "Jakarta Pusat", lat: -6.2150, lng: 106.8185, type: "Hotel" },
  { name: "Fraser Residence Menteng", district: "Jakarta Pusat", lat: -6.1955, lng: 106.8370, type: "Hotel" },

  // Hospitals — Central Jakarta
  { name: "RSUPN Dr. Cipto Mangunkusumo (RSCM)", district: "Jakarta Pusat", lat: -6.1960, lng: 106.8490, type: "Hospital" },
  { name: "RS Menteng Mitra Afia", district: "Jakarta Pusat", lat: -6.1940, lng: 106.8350, type: "Hospital" },
  { name: "RS St. Carolus", district: "Jakarta Pusat", lat: -6.1840, lng: 106.8490, type: "Hospital" },
  { name: "RS PGI Cikini", district: "Jakarta Pusat", lat: -6.1890, lng: 106.8370, type: "Hospital" },
  { name: "RS Abdi Waluyo", district: "Jakarta Pusat", lat: -6.1925, lng: 106.8355, type: "Hospital" },
  { name: "RS Bunda Menteng", district: "Jakarta Pusat", lat: -6.1890, lng: 106.8395, type: "Hospital" },
  { name: "RS Jakarta (Jakarta Hospital)", district: "Jakarta Pusat", lat: -6.1960, lng: 106.8280, type: "Hospital" },

  // Universities — Central Jakarta
  { name: "Universitas Indonesia Salemba", district: "Jakarta Pusat", lat: -6.1925, lng: 106.8512, type: "University" },
  { name: "Universitas Yarsi", district: "Jakarta Pusat", lat: -6.1790, lng: 106.8660, type: "University" },
  { name: "UNAS (Universitas Nasional)", district: "Jakarta Pusat", lat: -6.2060, lng: 106.8395, type: "University" },
  { name: "STM / Politeknik Negeri Jakarta", district: "Jakarta Pusat", lat: -6.1845, lng: 106.8490, type: "University" },

  // Landmarks & Stations — Central Jakarta
  { name: "Monas (National Monument)", district: "Jakarta Pusat", lat: -6.1754, lng: 106.8272, type: "Landmark" },
  { name: "Istiqlal Mosque", district: "Jakarta Pusat", lat: -6.1702, lng: 106.8317, type: "Landmark" },
  { name: "Jakarta Cathedral", district: "Jakarta Pusat", lat: -6.1695, lng: 106.8328, type: "Landmark" },
  { name: "Bundaran HI", district: "Jakarta Pusat", lat: -6.1950, lng: 106.8230, type: "Landmark" },
  { name: "Stasiun Gambir", district: "Jakarta Pusat", lat: -6.1767, lng: 106.8306, type: "Station" },
  { name: "Stasiun Juanda", district: "Jakarta Pusat", lat: -6.1667, lng: 106.8444, type: "Station" },
  { name: "Stasiun Cikini", district: "Jakarta Pusat", lat: -6.1895, lng: 106.8418, type: "Station" },
  { name: "Stasiun Gondangdia", district: "Jakarta Pusat", lat: -6.1860, lng: 106.8310, type: "Station" },
  { name: "Stasiun Kemayoran", district: "Jakarta Pusat", lat: -6.1590, lng: 106.8490, type: "Station" },
  { name: "Halte TransJakarta Bundaran HI", district: "Jakarta Pusat", lat: -6.1950, lng: 106.8230, type: "Station" },
  { name: "Halte TransJakarta Harmoni", district: "Jakarta Pusat", lat: -6.1666, lng: 106.8170, type: "Station" },

  // ===================================================================
  // ZONE 2: SOUTH JAKARTA (Jakarta Selatan) — 3–7 km from restaurant
  // ===================================================================

  // Kecamatan (Sub-districts)
  { name: "Kebayoran Baru", district: "Jakarta Selatan", lat: -6.2441, lng: 106.7833, type: "Area" },
  { name: "Kebayoran Lama", district: "Jakarta Selatan", lat: -6.2527, lng: 106.7737, type: "Area" },
  { name: "Cilandak", district: "Jakarta Selatan", lat: -6.2844, lng: 106.8007, type: "Area" },
  { name: "Mampang Prapatan", district: "Jakarta Selatan", lat: -6.2478, lng: 106.8264, type: "Area" },
  { name: "Pancoran", district: "Jakarta Selatan", lat: -6.2490, lng: 106.8468, type: "Area" },
  { name: "Tebet", district: "Jakarta Selatan", lat: -6.2273, lng: 106.8518, type: "Area" },
  { name: "Setiabudi", district: "Jakarta Selatan", lat: -6.2194, lng: 106.8321, type: "Area" },
  { name: "Pasar Minggu", district: "Jakarta Selatan", lat: -6.2833, lng: 106.8440, type: "Area" },
  { name: "Jagakarsa", district: "Jakarta Selatan", lat: -6.3333, lng: 106.8249, type: "Area" },
  { name: "Pesanggrahan", district: "Jakarta Selatan", lat: -6.2600, lng: 106.7463, type: "Area" },

  // Apartments — South Jakarta (Kuningan / Setiabudi / Sudirman)
  { name: "Taman Rasuna Apartment", district: "Jakarta Selatan", lat: -6.2225, lng: 106.8380, type: "Apartment" },
  { name: "Kuningan City Apartment", district: "Jakarta Selatan", lat: -6.2280, lng: 106.8280, type: "Apartment" },
  { name: "Sudirman Park Apartment", district: "Jakarta Selatan", lat: -6.2105, lng: 106.8120, type: "Apartment" },
  { name: "Casa Grande Residence", district: "Jakarta Selatan", lat: -6.2254, lng: 106.8381, type: "Apartment" },
  { name: "FX Residence Sudirman", district: "Jakarta Selatan", lat: -6.2240, lng: 106.8040, type: "Apartment" },
  { name: "The Capital Residence", district: "Jakarta Selatan", lat: -6.2210, lng: 106.8195, type: "Apartment" },
  { name: "Setiabudi Residence", district: "Jakarta Selatan", lat: -6.2195, lng: 106.8290, type: "Apartment" },
  { name: "Setiabudi Sky Garden", district: "Jakarta Selatan", lat: -6.2195, lng: 106.8310, type: "Apartment" },
  { name: "Denpasar Residence Kuningan", district: "Jakarta Selatan", lat: -6.2235, lng: 106.8330, type: "Apartment" },
  { name: "Bellagio Mansion", district: "Jakarta Selatan", lat: -6.2260, lng: 106.8360, type: "Apartment" },
  { name: "Bellagio Residence", district: "Jakarta Selatan", lat: -6.2255, lng: 106.8345, type: "Apartment" },
  { name: "Somerset Berlian Jakarta", district: "Jakarta Selatan", lat: -6.2180, lng: 106.8398, type: "Apartment" },

  // Apartments — South Jakarta (Kebayoran / Senayan / SCBD)
  { name: "Pakubuwono Residence", district: "Jakarta Selatan", lat: -6.2370, lng: 106.7930, type: "Apartment" },
  { name: "Pakubuwono View", district: "Jakarta Selatan", lat: -6.2380, lng: 106.7920, type: "Apartment" },
  { name: "Pakubuwono Terrace", district: "Jakarta Selatan", lat: -6.2362, lng: 106.7935, type: "Apartment" },
  { name: "Senayan Residence", district: "Jakarta Selatan", lat: -6.2280, lng: 106.7980, type: "Apartment" },
  { name: "Essence Darmawangsa", district: "Jakarta Selatan", lat: -6.2555, lng: 106.8000, type: "Apartment" },
  { name: "The Dharmawangsa Residences", district: "Jakarta Selatan", lat: -6.2560, lng: 106.7980, type: "Apartment" },
  { name: "Permata Hijau Suites", district: "Jakarta Selatan", lat: -6.2290, lng: 106.7810, type: "Apartment" },
  { name: "GP Plaza Gatot Subroto", district: "Jakarta Selatan", lat: -6.2345, lng: 106.8220, type: "Apartment" },
  { name: "Sudirman Suites Jakarta", district: "Jakarta Selatan", lat: -6.2100, lng: 106.8130, type: "Apartment" },
  { name: "Ciputra World 2 Jakarta", district: "Jakarta Selatan", lat: -6.2185, lng: 106.8120, type: "Apartment" },
  { name: "The Langham Residence SCBD", district: "Jakarta Selatan", lat: -6.2270, lng: 106.8060, type: "Apartment" },

  // Apartments — South Jakarta (Kemang / Tebet / Pancoran)
  { name: "Kemang Village Apartment", district: "Jakarta Selatan", lat: -6.2660, lng: 106.8160, type: "Apartment" },
  { name: "Kemang Jaya Apartment", district: "Jakarta Selatan", lat: -6.2620, lng: 106.8110, type: "Apartment" },
  { name: "Veranda Residence Puri", district: "Jakarta Selatan", lat: -6.2460, lng: 106.8470, type: "Apartment" },
  { name: "Pancoran Riverside Apartment", district: "Jakarta Selatan", lat: -6.2500, lng: 106.8500, type: "Apartment" },
  { name: "Kalibata City Apartment", district: "Jakarta Selatan", lat: -6.2570, lng: 106.8550, type: "Apartment" },
  { name: "Tebet Residence", district: "Jakarta Selatan", lat: -6.2260, lng: 106.8530, type: "Apartment" },
  { name: "South Hills Kuningan", district: "Jakarta Selatan", lat: -6.2290, lng: 106.8350, type: "Apartment" },
  { name: "The Grove Epicentrum", district: "Jakarta Selatan", lat: -6.2298, lng: 106.8370, type: "Apartment" },
  { name: "Kota Kasablanka Residence", district: "Jakarta Selatan", lat: -6.2230, lng: 106.8410, type: "Apartment" },

  // Apartments — South Jakarta (Cilandak / Pasar Minggu / Jagakarsa)
  { name: "Cilandak 88 Condominium", district: "Jakarta Selatan", lat: -6.2850, lng: 106.8025, type: "Apartment" },
  { name: "1Park Avenue Gandaria", district: "Jakarta Selatan", lat: -6.2420, lng: 106.7830, type: "Apartment" },
  { name: "Gandaria Heights Apartment", district: "Jakarta Selatan", lat: -6.2440, lng: 106.7860, type: "Apartment" },
  { name: "The Mansion Dukuh Golf Kemayoran", district: "Jakarta Selatan", lat: -6.2835, lng: 106.8450, type: "Apartment" },

  // Malls — South Jakarta
  { name: "Pacific Place Mall", district: "Jakarta Selatan", lat: -6.2244, lng: 106.8095, type: "Mall" },
  { name: "Senayan City Mall", district: "Jakarta Selatan", lat: -6.2270, lng: 106.7975, type: "Mall" },
  { name: "fX Sudirman Mall", district: "Jakarta Selatan", lat: -6.2240, lng: 106.8045, type: "Mall" },
  { name: "Plaza Senayan", district: "Jakarta Selatan", lat: -6.2253, lng: 106.7978, type: "Mall" },
  { name: "Gandaria City Mall", district: "Jakarta Selatan", lat: -6.2440, lng: 106.7850, type: "Mall" },
  { name: "Kota Kasablanka Mall", district: "Jakarta Selatan", lat: -6.2230, lng: 106.8420, type: "Mall" },
  { name: "Lotte Shopping Avenue", district: "Jakarta Selatan", lat: -6.2220, lng: 106.8290, type: "Mall" },
  { name: "ITC Kuningan", district: "Jakarta Selatan", lat: -6.2290, lng: 106.8310, type: "Mall" },
  { name: "Ambassador Mall", district: "Jakarta Selatan", lat: -6.2285, lng: 106.8295, type: "Mall" },
  { name: "Blok M Plaza", district: "Jakarta Selatan", lat: -6.2440, lng: 106.7990, type: "Mall" },
  { name: "Blok M Square", district: "Jakarta Selatan", lat: -6.2445, lng: 106.7975, type: "Mall" },
  { name: "Pondok Indah Mall 1", district: "Jakarta Selatan", lat: -6.2660, lng: 106.7830, type: "Mall" },
  { name: "Pondok Indah Mall 2", district: "Jakarta Selatan", lat: -6.2668, lng: 106.7842, type: "Mall" },
  { name: "Pondok Indah Mall 3", district: "Jakarta Selatan", lat: -6.2675, lng: 106.7820, type: "Mall" },
  { name: "Lippo Mall Kemang", district: "Jakarta Selatan", lat: -6.2680, lng: 106.8140, type: "Mall" },
  { name: "Cilandak Town Square (Citos)", district: "Jakarta Selatan", lat: -6.2910, lng: 106.8020, type: "Mall" },
  { name: "Pejaten Village Mall", district: "Jakarta Selatan", lat: -6.2770, lng: 106.8330, type: "Mall" },
  { name: "Dharmawangsa Square", district: "Jakarta Selatan", lat: -6.2563, lng: 106.7992, type: "Mall" },

  // Hotels — South Jakarta
  { name: "The Ritz-Carlton Pacific Place", district: "Jakarta Selatan", lat: -6.2245, lng: 106.8090, type: "Hotel" },
  { name: "Fairmont Jakarta", district: "Jakarta Selatan", lat: -6.2180, lng: 106.8280, type: "Hotel" },
  { name: "JW Marriott Jakarta", district: "Jakarta Selatan", lat: -6.2155, lng: 106.8300, type: "Hotel" },
  { name: "The Mulia Senayan", district: "Jakarta Selatan", lat: -6.2278, lng: 106.7950, type: "Hotel" },
  { name: "Shangri-La Hotel Jakarta", district: "Jakarta Selatan", lat: -6.2180, lng: 106.8190, type: "Hotel" },
  { name: "InterContinental Jakarta", district: "Jakarta Selatan", lat: -6.2190, lng: 106.8260, type: "Hotel" },
  { name: "Westin Jakarta", district: "Jakarta Selatan", lat: -6.2210, lng: 106.8080, type: "Hotel" },
  { name: "Raffles Jakarta", district: "Jakarta Selatan", lat: -6.2258, lng: 106.8350, type: "Hotel" },
  { name: "DoubleTree by Hilton Kuningan", district: "Jakarta Selatan", lat: -6.2300, lng: 106.8260, type: "Hotel" },
  { name: "Keraton at The Plaza", district: "Jakarta Selatan", lat: -6.2103, lng: 106.8190, type: "Hotel" },
  { name: "Hotel Kristal Jakarta", district: "Jakarta Selatan", lat: -6.2150, lng: 106.8115, type: "Hotel" },
  { name: "Four Seasons Jakarta", district: "Jakarta Selatan", lat: -6.2250, lng: 106.8300, type: "Hotel" },

  // Hospitals — South Jakarta
  { name: "RS Medistra", district: "Jakarta Selatan", lat: -6.2310, lng: 106.8210, type: "Hospital" },
  { name: "Siloam Hospitals Semanggi", district: "Jakarta Selatan", lat: -6.2200, lng: 106.8140, type: "Hospital" },
  { name: "MMC Hospital (Metropolitan Medical Centre)", district: "Jakarta Selatan", lat: -6.2282, lng: 106.8308, type: "Hospital" },
  { name: "RS Pondok Indah – Puri Indah", district: "Jakarta Selatan", lat: -6.2650, lng: 106.7850, type: "Hospital" },
  { name: "RS Pondok Indah – Bintaro Jaya", district: "Jakarta Selatan", lat: -6.2660, lng: 106.7570, type: "Hospital" },
  { name: "RS Fatmawati", district: "Jakarta Selatan", lat: -6.2920, lng: 106.7970, type: "Hospital" },
  { name: "RS Siloam TB Simatupang", district: "Jakarta Selatan", lat: -6.2850, lng: 106.7900, type: "Hospital" },
  { name: "RS Pertamina Jaya", district: "Jakarta Selatan", lat: -6.2290, lng: 106.8360, type: "Hospital" },

  // Universities — South Jakarta
  { name: "Universitas Trisakti", district: "Jakarta Selatan", lat: -6.1958, lng: 106.7880, type: "University" },
  { name: "Universitas Bina Nusantara (Binus) Senayan", district: "Jakarta Selatan", lat: -6.2290, lng: 106.7870, type: "University" },
  { name: "London School of PR", district: "Jakarta Selatan", lat: -6.2270, lng: 106.8100, type: "University" },
  { name: "Universitas Bakrie", district: "Jakarta Selatan", lat: -6.2245, lng: 106.8380, type: "University" },
  { name: "SMA Labschool Jakarta", district: "Jakarta Selatan", lat: -6.2350, lng: 106.8500, type: "School" },

  // Stations — South Jakarta
  { name: "Stasiun Sudirman", district: "Jakarta Selatan", lat: -6.2020, lng: 106.8235, type: "Station" },
  { name: "Stasiun Karet", district: "Jakarta Selatan", lat: -6.2115, lng: 106.8180, type: "Station" },
  { name: "Stasiun Tebet", district: "Jakarta Selatan", lat: -6.2260, lng: 106.8560, type: "Station" },
  { name: "Stasiun Cawang", district: "Jakarta Selatan", lat: -6.2425, lng: 106.8590, type: "Station" },
  { name: "Stasiun Duren Kalibata", district: "Jakarta Selatan", lat: -6.2565, lng: 106.8555, type: "Station" },
  { name: "Stasiun Pasar Minggu", district: "Jakarta Selatan", lat: -6.2840, lng: 106.8440, type: "Station" },
  { name: "Halte TransJakarta Kuningan", district: "Jakarta Selatan", lat: -6.2285, lng: 106.8290, type: "Station" },

  // ===================================================================
  // ZONE 3: EAST JAKARTA (Jakarta Timur) — 5–10 km from restaurant
  // ===================================================================

  // Kecamatan
  { name: "Matraman", district: "Jakarta Timur", lat: -6.2092, lng: 106.8586, type: "Area" },
  { name: "Jatinegara", district: "Jakarta Timur", lat: -6.2201, lng: 106.8745, type: "Area" },
  { name: "Pulogadung", district: "Jakarta Timur", lat: -6.1846, lng: 106.9028, type: "Area" },
  { name: "Cakung", district: "Jakarta Timur", lat: -6.1731, lng: 106.9454, type: "Area" },
  { name: "Duren Sawit", district: "Jakarta Timur", lat: -6.2361, lng: 106.9133, type: "Area" },
  { name: "Kramat Jati", district: "Jakarta Timur", lat: -6.2746, lng: 106.8698, type: "Area" },
  { name: "Makasar", district: "Jakarta Timur", lat: -6.2565, lng: 106.8927, type: "Area" },
  { name: "Cipayung", district: "Jakarta Timur", lat: -6.3109, lng: 106.8978, type: "Area" },
  { name: "Pasar Rebo", district: "Jakarta Timur", lat: -6.3229, lng: 106.8568, type: "Area" },

  // Apartments — East Jakarta
  { name: "Bassura City Apartment", district: "Jakarta Timur", lat: -6.2270, lng: 106.8600, type: "Apartment" },
  { name: "MT Haryono Residence", district: "Jakarta Timur", lat: -6.2380, lng: 106.8570, type: "Apartment" },
  { name: "Sentra Timur Residence", district: "Jakarta Timur", lat: -6.1960, lng: 106.9080, type: "Apartment" },
  { name: "Casablanca East Residence", district: "Jakarta Timur", lat: -6.2240, lng: 106.8640, type: "Apartment" },
  { name: "Apartemen Gading Nias", district: "Jakarta Timur", lat: -6.1550, lng: 106.9065, type: "Apartment" },
  { name: "Gateway Ahmad Yani Apartment", district: "Jakarta Timur", lat: -6.2345, lng: 106.8655, type: "Apartment" },
  { name: "Signature Park Grande MT Haryono", district: "Jakarta Timur", lat: -6.2320, lng: 106.8600, type: "Apartment" },
  { name: "Cibubur Village Apartment", district: "Jakarta Timur", lat: -6.3700, lng: 106.8810, type: "Apartment" },

  // Malls — East Jakarta
  { name: "AEON Mall JGC (Jakarta Garden City)", district: "Jakarta Timur", lat: -6.1570, lng: 106.9290, type: "Mall" },
  { name: "Arion Mall Rawamangun", district: "Jakarta Timur", lat: -6.1900, lng: 106.8850, type: "Mall" },
  { name: "Cibubur Junction", district: "Jakarta Timur", lat: -6.3700, lng: 106.8830, type: "Mall" },
  { name: "Cipinang Indah Mall", district: "Jakarta Timur", lat: -6.2200, lng: 106.8800, type: "Mall" },
  { name: "Tamini Square", district: "Jakarta Timur", lat: -6.2670, lng: 106.8720, type: "Mall" },
  { name: "Mall Cijantung", district: "Jakarta Timur", lat: -6.3100, lng: 106.8690, type: "Mall" },
  { name: "Living World Cibubur", district: "Jakarta Timur", lat: -6.3695, lng: 106.8820, type: "Mall" },
  { name: "Buaran Plaza", district: "Jakarta Timur", lat: -6.2150, lng: 106.9210, type: "Mall" },

  // Hotels — East Jakarta
  { name: "Hotel Harris Tebet", district: "Jakarta Timur", lat: -6.2290, lng: 106.8540, type: "Hotel" },
  { name: "Grand Sahid Jaya Hotel", district: "Jakarta Timur", lat: -6.2145, lng: 106.8225, type: "Hotel" },

  // Hospitals — East Jakarta
  { name: "RS Premier Jatinegara", district: "Jakarta Timur", lat: -6.2190, lng: 106.8730, type: "Hospital" },
  { name: "RS Islam Jakarta Cempaka Putih", district: "Jakarta Timur", lat: -6.1780, lng: 106.8720, type: "Hospital" },
  { name: "RS UKI Cawang", district: "Jakarta Timur", lat: -6.2530, lng: 106.8650, type: "Hospital" },

  // Universities — East Jakarta
  { name: "Universitas Negeri Jakarta (UNJ)", district: "Jakarta Timur", lat: -6.1880, lng: 106.8930, type: "University" },
  { name: "Universitas Kristen Indonesia (UKI)", district: "Jakarta Timur", lat: -6.2510, lng: 106.8660, type: "University" },

  // Stations — East Jakarta
  { name: "Stasiun Jatinegara", district: "Jakarta Timur", lat: -6.2150, lng: 106.8700, type: "Station" },
  { name: "Stasiun Klender", district: "Jakarta Timur", lat: -6.2100, lng: 106.9030, type: "Station" },
  { name: "Stasiun Buaran", district: "Jakarta Timur", lat: -6.2160, lng: 106.9200, type: "Station" },

  // ===================================================================
  // ZONE 4: NORTH JAKARTA (Jakarta Utara) — 5–10 km from restaurant
  // ===================================================================

  // Kecamatan
  { name: "Kelapa Gading", district: "Jakarta Utara", lat: -6.1568, lng: 106.9048, type: "Area" },
  { name: "Tanjung Priok", district: "Jakarta Utara", lat: -6.1098, lng: 106.8707, type: "Area" },
  { name: "Penjaringan", district: "Jakarta Utara", lat: -6.1247, lng: 106.8005, type: "Area" },
  { name: "Pademangan", district: "Jakarta Utara", lat: -6.1359, lng: 106.8451, type: "Area" },
  { name: "Koja", district: "Jakarta Utara", lat: -6.1142, lng: 106.9013, type: "Area" },
  { name: "Cilincing", district: "Jakarta Utara", lat: -6.1097, lng: 106.9414, type: "Area" },

  // Apartments — North Jakarta
  { name: "Green Bay Pluit Apartment", district: "Jakarta Utara", lat: -6.1110, lng: 106.7850, type: "Apartment" },
  { name: "Pluit Sea View Apartment", district: "Jakarta Utara", lat: -6.1130, lng: 106.7880, type: "Apartment" },
  { name: "Pantai Mutiara Apartment", district: "Jakarta Utara", lat: -6.1150, lng: 106.7740, type: "Apartment" },
  { name: "Gold Coast PIK Apartment", district: "Jakarta Utara", lat: -6.1070, lng: 106.7440, type: "Apartment" },
  { name: "Sedayu City Kelapa Gading", district: "Jakarta Utara", lat: -6.1530, lng: 106.9060, type: "Apartment" },
  { name: "MOI (Mall of Indonesia) Residence", district: "Jakarta Utara", lat: -6.1500, lng: 106.8920, type: "Apartment" },
  { name: "Gading Mediterania Residence", district: "Jakarta Utara", lat: -6.1570, lng: 106.9045, type: "Apartment" },
  { name: "Gading Greenhill Apartment", district: "Jakarta Utara", lat: -6.1540, lng: 106.9100, type: "Apartment" },
  { name: "Mediterania Marina Ancol", district: "Jakarta Utara", lat: -6.1300, lng: 106.8320, type: "Apartment" },
  { name: "PIK 2 Sedayu Indo City", district: "Jakarta Utara", lat: -6.0820, lng: 106.7210, type: "Apartment" },
  { name: "Tokyo Riverside PIK 2", district: "Jakarta Utara", lat: -6.0840, lng: 106.7230, type: "Apartment" },
  { name: "Regatta Apartment Pantai Mutiara", district: "Jakarta Utara", lat: -6.1100, lng: 106.7700, type: "Apartment" },

  // Malls — North Jakarta
  { name: "Mall of Indonesia (MOI)", district: "Jakarta Utara", lat: -6.1490, lng: 106.8920, type: "Mall" },
  { name: "Mall Kelapa Gading", district: "Jakarta Utara", lat: -6.1580, lng: 106.9070, type: "Mall" },
  { name: "La Piazza Kelapa Gading", district: "Jakarta Utara", lat: -6.1560, lng: 106.9050, type: "Mall" },
  { name: "Pluit Village Mall", district: "Jakarta Utara", lat: -6.1160, lng: 106.7870, type: "Mall" },
  { name: "PIK Avenue", district: "Jakarta Utara", lat: -6.1090, lng: 106.7460, type: "Mall" },
  { name: "Baywalk Mall Pluit", district: "Jakarta Utara", lat: -6.1110, lng: 106.7860, type: "Mall" },
  { name: "Mall Artha Gading", district: "Jakarta Utara", lat: -6.1445, lng: 106.8910, type: "Mall" },
  { name: "Emporium Pluit Mall", district: "Jakarta Utara", lat: -6.1175, lng: 106.7895, type: "Mall" },
  { name: "WTC Mangga Dua", district: "Jakarta Utara", lat: -6.1380, lng: 106.8350, type: "Mall" },
  { name: "ITC Mangga Dua", district: "Jakarta Utara", lat: -6.1360, lng: 106.8340, type: "Mall" },
  { name: "Mangga Dua Square", district: "Jakarta Utara", lat: -6.1350, lng: 106.8330, type: "Mall" },

  // Hotels — North Jakarta
  { name: "Mercure Jakarta Kelapa Gading", district: "Jakarta Utara", lat: -6.1580, lng: 106.9090, type: "Hotel" },
  { name: "Swiss-Belhotel Kelapa Gading", district: "Jakarta Utara", lat: -6.1560, lng: 106.9020, type: "Hotel" },
  { name: "Harris Hotel Kelapa Gading", district: "Jakarta Utara", lat: -6.1560, lng: 106.9045, type: "Hotel" },
  { name: "Hotel Mercure Ancol", district: "Jakarta Utara", lat: -6.1280, lng: 106.8350, type: "Hotel" },

  // Landmarks — North Jakarta
  { name: "Ancol Dreamland (Dunia Fantasi)", district: "Jakarta Utara", lat: -6.1250, lng: 106.8340, type: "Landmark" },
  { name: "Ancol Beach City", district: "Jakarta Utara", lat: -6.1230, lng: 106.8360, type: "Landmark" },
  { name: "Jakarta International Expo (JIExpo) Kemayoran", district: "Jakarta Utara", lat: -6.1470, lng: 106.8460, type: "Landmark" },
  { name: "Tanjung Priok Port", district: "Jakarta Utara", lat: -6.1000, lng: 106.8700, type: "Landmark" },

  // Hospitals — North Jakarta
  { name: "RS Gading Pluit", district: "Jakarta Utara", lat: -6.1570, lng: 106.9000, type: "Hospital" },
  { name: "RS Mitra Kelapa Gading", district: "Jakarta Utara", lat: -6.1600, lng: 106.9040, type: "Hospital" },
  { name: "RS Atma Jaya Pluit", district: "Jakarta Utara", lat: -6.1200, lng: 106.7920, type: "Hospital" },

  // ===================================================================
  // ZONE 5: WEST JAKARTA (Jakarta Barat) — 5–10 km from restaurant
  // ===================================================================

  // Kecamatan
  { name: "Grogol Petamburan", district: "Jakarta Barat", lat: -6.1639, lng: 106.7870, type: "Area" },
  { name: "Taman Sari", district: "Jakarta Barat", lat: -6.1477, lng: 106.8151, type: "Area" },
  { name: "Tambora", district: "Jakarta Barat", lat: -6.1504, lng: 106.8009, type: "Area" },
  { name: "Palmerah", district: "Jakarta Barat", lat: -6.1927, lng: 106.7970, type: "Area" },
  { name: "Kebon Jeruk", district: "Jakarta Barat", lat: -6.1876, lng: 106.7690, type: "Area" },
  { name: "Kembangan", district: "Jakarta Barat", lat: -6.1852, lng: 106.7385, type: "Area" },
  { name: "Cengkareng", district: "Jakarta Barat", lat: -6.1483, lng: 106.7271, type: "Area" },
  { name: "Kalideres", district: "Jakarta Barat", lat: -6.1334, lng: 106.6975, type: "Area" },

  // Apartments — West Jakarta
  { name: "Central Park Residence", district: "Jakarta Barat", lat: -6.1770, lng: 106.7910, type: "Apartment" },
  { name: "Taman Anggrek Residences", district: "Jakarta Barat", lat: -6.1780, lng: 106.7900, type: "Apartment" },
  { name: "Madison Park Apartment", district: "Jakarta Barat", lat: -6.1770, lng: 106.7915, type: "Apartment" },
  { name: "Mediterania Garden 1", district: "Jakarta Barat", lat: -6.1785, lng: 106.7895, type: "Apartment" },
  { name: "Mediterania Garden 2", district: "Jakarta Barat", lat: -6.1780, lng: 106.7880, type: "Apartment" },
  { name: "Green Central City Apartment", district: "Jakarta Barat", lat: -6.1700, lng: 106.7910, type: "Apartment" },
  { name: "Puri Park View Apartment", district: "Jakarta Barat", lat: -6.1870, lng: 106.7360, type: "Apartment" },
  { name: "Season City Apartment", district: "Jakarta Barat", lat: -6.1595, lng: 106.7940, type: "Apartment" },
  { name: "Green Garden Apartment", district: "Jakarta Barat", lat: -6.1810, lng: 106.7760, type: "Apartment" },
  { name: "Apartemen Mediterania Palace", district: "Jakarta Barat", lat: -6.1620, lng: 106.7960, type: "Apartment" },
  { name: "West Vista Apartment", district: "Jakarta Barat", lat: -6.1682, lng: 106.7850, type: "Apartment" },
  { name: "Puri Orchard Apartment", district: "Jakarta Barat", lat: -6.1860, lng: 106.7330, type: "Apartment" },
  { name: "Puri Mansion Apartment", district: "Jakarta Barat", lat: -6.1855, lng: 106.7340, type: "Apartment" },
  { name: "Victoria Square Apartment Tangerang", district: "Jakarta Barat", lat: -6.1880, lng: 106.7270, type: "Apartment" },

  // Malls — West Jakarta
  { name: "Central Park Mall", district: "Jakarta Barat", lat: -6.1770, lng: 106.7905, type: "Mall" },
  { name: "Mall Taman Anggrek", district: "Jakarta Barat", lat: -6.1780, lng: 106.7890, type: "Mall" },
  { name: "Ciputra Mall (Mall Ciputra)", district: "Jakarta Barat", lat: -6.1690, lng: 106.7890, type: "Mall" },
  { name: "Puri Indah Mall", district: "Jakarta Barat", lat: -6.1870, lng: 106.7350, type: "Mall" },
  { name: "Lippo Mall Puri", district: "Jakarta Barat", lat: -6.1855, lng: 106.7365, type: "Mall" },
  { name: "Season City Mall", district: "Jakarta Barat", lat: -6.1600, lng: 106.7935, type: "Mall" },
  { name: "Mall Ciputra 2", district: "Jakarta Barat", lat: -6.1695, lng: 106.7885, type: "Mall" },
  { name: "Slipi Jaya Mall", district: "Jakarta Barat", lat: -6.1905, lng: 106.7980, type: "Mall" },
  { name: "Green Sedayu Mall", district: "Jakarta Barat", lat: -6.1440, lng: 106.7090, type: "Mall" },

  // Hotels — West Jakarta
  { name: "Pullman Jakarta Central Park", district: "Jakarta Barat", lat: -6.1770, lng: 106.7915, type: "Hotel" },
  { name: "Four Points Sheraton Thamrin", district: "Jakarta Barat", lat: -6.1820, lng: 106.7960, type: "Hotel" },

  // Hospitals — West Jakarta
  { name: "RS Royal Taruma", district: "Jakarta Barat", lat: -6.1630, lng: 106.7870, type: "Hospital" },
  { name: "RS Sumber Waras", district: "Jakarta Barat", lat: -6.1640, lng: 106.7860, type: "Hospital" },
  { name: "RS Puri Indah", district: "Jakarta Barat", lat: -6.1890, lng: 106.7340, type: "Hospital" },

  // Universities — West Jakarta
  { name: "Universitas Tarumanagara (Untar)", district: "Jakarta Barat", lat: -6.1644, lng: 106.7878, type: "University" },
  { name: "Binus University Anggrek", district: "Jakarta Barat", lat: -6.1800, lng: 106.7870, type: "University" },
  { name: "Binus University Syahdan", district: "Jakarta Barat", lat: -6.1825, lng: 106.7850, type: "University" },

  // Stations — West Jakarta
  { name: "Stasiun Tanah Abang", district: "Jakarta Barat", lat: -6.1855, lng: 106.8100, type: "Station" },
  { name: "Stasiun Palmerah", district: "Jakarta Barat", lat: -6.2070, lng: 106.7980, type: "Station" },
  { name: "Stasiun Duri", district: "Jakarta Barat", lat: -6.1510, lng: 106.8010, type: "Station" },
  { name: "Stasiun Grogol", district: "Jakarta Barat", lat: -6.1620, lng: 106.7870, type: "Station" },

  // ===================================================================
  // ZONE 6: SURROUNDING AREAS — 10–15+ km from restaurant
  // ===================================================================

  // Tangerang Selatan
  { name: "BSD City", district: "Tangerang Selatan", lat: -6.3017, lng: 106.6522, type: "Area" },
  { name: "Serpong", district: "Tangerang Selatan", lat: -6.3133, lng: 106.6706, type: "Area" },
  { name: "Bintaro", district: "Tangerang Selatan", lat: -6.2750, lng: 106.7300, type: "Area" },
  { name: "Ciputat", district: "Tangerang Selatan", lat: -6.3200, lng: 106.7560, type: "Area" },
  { name: "Pamulang", district: "Tangerang Selatan", lat: -6.3430, lng: 106.7380, type: "Area" },

  // Apartments — Tangerang Selatan
  { name: "The Breeze BSD Apartment", district: "Tangerang Selatan", lat: -6.3020, lng: 106.6540, type: "Apartment" },
  { name: "Foresta BSD Apartment", district: "Tangerang Selatan", lat: -6.3050, lng: 106.6500, type: "Apartment" },
  { name: "Bintaro Plaza Residence", district: "Tangerang Selatan", lat: -6.2760, lng: 106.7310, type: "Apartment" },
  { name: "Serpong Garden Apartment", district: "Tangerang Selatan", lat: -6.3140, lng: 106.6680, type: "Apartment" },
  { name: "Serpong M-Town Residence", district: "Tangerang Selatan", lat: -6.3160, lng: 106.6720, type: "Apartment" },

  // Malls — Tangerang Selatan
  { name: "AEON Mall BSD City", district: "Tangerang Selatan", lat: -6.3043, lng: 106.6435, type: "Mall" },
  { name: "The Breeze BSD City", district: "Tangerang Selatan", lat: -6.3015, lng: 106.6530, type: "Mall" },
  { name: "QBig BSD City", district: "Tangerang Selatan", lat: -6.3000, lng: 106.6410, type: "Mall" },
  { name: "ITC BSD", district: "Tangerang Selatan", lat: -6.3060, lng: 106.6530, type: "Mall" },
  { name: "Bintaro Jaya Xchange Mall", district: "Tangerang Selatan", lat: -6.2770, lng: 106.7280, type: "Mall" },
  { name: "Bintaro Entertainment District", district: "Tangerang Selatan", lat: -6.2752, lng: 106.7290, type: "Mall" },
  { name: "Living World Alam Sutera", district: "Tangerang Selatan", lat: -6.2430, lng: 106.6510, type: "Mall" },

  // Tangerang
  { name: "Alam Sutera", district: "Tangerang", lat: -6.2398, lng: 106.6465, type: "Area" },
  { name: "Tangerang Kota", district: "Tangerang", lat: -6.1781, lng: 106.6320, type: "Area" },
  { name: "Gading Serpong", district: "Tangerang", lat: -6.2380, lng: 106.6290, type: "Area" },
  { name: "Lippo Karawaci", district: "Tangerang", lat: -6.2330, lng: 106.6130, type: "Area" },
  { name: "Cikokol", district: "Tangerang", lat: -6.1940, lng: 106.6250, type: "Area" },

  // Apartments — Tangerang
  { name: "Silktown Alam Sutera", district: "Tangerang", lat: -6.2410, lng: 106.6470, type: "Apartment" },
  { name: "Benton Apartment Lippo Karawaci", district: "Tangerang", lat: -6.2320, lng: 106.6120, type: "Apartment" },
  { name: "Supermall Mansion Lippo Karawaci", district: "Tangerang", lat: -6.2340, lng: 106.6110, type: "Apartment" },

  // Malls — Tangerang
  { name: "Mall @ Alam Sutera", district: "Tangerang", lat: -6.2400, lng: 106.6480, type: "Mall" },
  { name: "Summarecon Mall Serpong", district: "Tangerang", lat: -6.2400, lng: 106.6290, type: "Mall" },
  { name: "Supermall Karawaci", district: "Tangerang", lat: -6.2340, lng: 106.6100, type: "Mall" },
  { name: "Tangcity Mall", district: "Tangerang", lat: -6.1800, lng: 106.6310, type: "Mall" },
  { name: "Metropolis Town Square (Metris)", district: "Tangerang", lat: -6.1790, lng: 106.6320, type: "Mall" },

  // Bekasi
  { name: "Bekasi Barat", district: "Bekasi", lat: -6.2349, lng: 106.9942, type: "Area" },
  { name: "Bekasi Selatan", district: "Bekasi", lat: -6.2581, lng: 107.0025, type: "Area" },
  { name: "Bekasi Utara", district: "Bekasi", lat: -6.2150, lng: 107.0030, type: "Area" },
  { name: "Bekasi Timur", district: "Bekasi", lat: -6.2450, lng: 107.0200, type: "Area" },
  { name: "Jatiasih", district: "Bekasi", lat: -6.2990, lng: 106.9630, type: "Area" },
  { name: "Pondok Gede", district: "Bekasi", lat: -6.2860, lng: 106.9240, type: "Area" },
  { name: "Jati Sampurna", district: "Bekasi", lat: -6.3540, lng: 106.9230, type: "Area" },

  // Apartments — Bekasi
  { name: "Grand Galaxy Park Apartment", district: "Bekasi", lat: -6.2680, lng: 106.9710, type: "Apartment" },
  { name: "Summarecon Bekasi Apartment", district: "Bekasi", lat: -6.2260, lng: 107.0010, type: "Apartment" },
  { name: "Ahmad Yani Residence Bekasi", district: "Bekasi", lat: -6.2350, lng: 107.0050, type: "Apartment" },
  { name: "Center Point Bekasi Apartment", district: "Bekasi", lat: -6.2345, lng: 106.9930, type: "Apartment" },

  // Malls — Bekasi
  { name: "Grand Galaxy Park Mall Bekasi", district: "Bekasi", lat: -6.2670, lng: 106.9700, type: "Mall" },
  { name: "Summarecon Mall Bekasi", district: "Bekasi", lat: -6.2250, lng: 107.0005, type: "Mall" },
  { name: "Metropolitan Mall Bekasi", district: "Bekasi", lat: -6.2360, lng: 106.9950, type: "Mall" },
  { name: "Mega Bekasi Hypermall", district: "Bekasi", lat: -6.2380, lng: 106.9970, type: "Mall" },
  { name: "Grand Metropolitan Bekasi", district: "Bekasi", lat: -6.2340, lng: 106.9945, type: "Mall" },
  { name: "Revo Town Bekasi", district: "Bekasi", lat: -6.2610, lng: 107.0080, type: "Mall" },

  // Hospitals — Bekasi
  { name: "RS Mitra Keluarga Bekasi", district: "Bekasi", lat: -6.2370, lng: 107.0010, type: "Hospital" },
  { name: "RS Anna Bekasi", district: "Bekasi", lat: -6.2400, lng: 106.9990, type: "Hospital" },

  // Depok
  { name: "Depok", district: "Depok", lat: -6.3924, lng: 106.8243, type: "Area" },
  { name: "Margonda", district: "Depok", lat: -6.3750, lng: 106.8300, type: "Area" },
  { name: "Cinere", district: "Depok", lat: -6.3340, lng: 106.7830, type: "Area" },
  { name: "Sawangan", district: "Depok", lat: -6.4100, lng: 106.7550, type: "Area" },
  { name: "Beji", district: "Depok", lat: -6.3700, lng: 106.8320, type: "Area" },

  // Apartments — Depok
  { name: "Margonda Residence 1", district: "Depok", lat: -6.3730, lng: 106.8310, type: "Apartment" },
  { name: "Margonda Residence 2", district: "Depok", lat: -6.3740, lng: 106.8305, type: "Apartment" },
  { name: "Margonda Residence 3", district: "Depok", lat: -6.3720, lng: 106.8315, type: "Apartment" },
  { name: "Margonda Residence 4", district: "Depok", lat: -6.3710, lng: 106.8320, type: "Apartment" },
  { name: "Margonda Residence 5", district: "Depok", lat: -6.3715, lng: 106.8318, type: "Apartment" },
  { name: "Taman Melati Apartment Depok", district: "Depok", lat: -6.3680, lng: 106.8340, type: "Apartment" },
  { name: "Dave Apartment Depok", district: "Depok", lat: -6.3760, lng: 106.8290, type: "Apartment" },

  // Malls — Depok
  { name: "Depok Town Square (Detos)", district: "Depok", lat: -6.3920, lng: 106.8240, type: "Mall" },
  { name: "Margo City Depok", district: "Depok", lat: -6.3700, lng: 106.8310, type: "Mall" },
  { name: "ITC Depok", district: "Depok", lat: -6.3920, lng: 106.8230, type: "Mall" },
  { name: "Mall Cinere Bellevue", district: "Depok", lat: -6.3330, lng: 106.7820, type: "Mall" },
  { name: "Pesona Square Depok", district: "Depok", lat: -6.3950, lng: 106.8200, type: "Mall" },

  // Hospitals — Depok
  { name: "RS Universitas Indonesia (RSUI) Depok", district: "Depok", lat: -6.3600, lng: 106.8270, type: "Hospital" },
  { name: "RS Mitra Keluarga Depok", district: "Depok", lat: -6.3870, lng: 106.8250, type: "Hospital" },

  // Universities — Depok
  { name: "Universitas Indonesia (UI) Depok", district: "Depok", lat: -6.3606, lng: 106.8273, type: "University" },
  { name: "Universitas Gunadarma Depok", district: "Depok", lat: -6.3705, lng: 106.8316, type: "University" },

  // Bogor (far)
  { name: "Bogor Kota", district: "Bogor", lat: -6.5971, lng: 106.8060, type: "Area" },
  { name: "Cibinong", district: "Bogor", lat: -6.4820, lng: 106.8430, type: "Area" },
  { name: "Sentul City", district: "Bogor", lat: -6.5670, lng: 106.8540, type: "Area" },
];

// Group areas by district for dropdown
export function getAreasByDistrict(): Record<string, JakartaArea[]> {
  const grouped: Record<string, JakartaArea[]> = {};
  for (const area of JAKARTA_AREAS) {
    if (!grouped[area.district]) {
      grouped[area.district] = [];
    }
    grouped[area.district].push(area);
  }
  return grouped;
}
