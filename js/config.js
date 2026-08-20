// Central configuration. No logic lives here, only frozen constants.
// Every endpoint below is keyless and was verified live on 2026-08-06.

export const API = Object.freeze({
  forecast: 'https://api.open-meteo.com/v1/forecast',
  geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  airQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  power: 'https://power.larc.nasa.gov/api/temporal/climatology/point',
  epicApi: 'https://epic.gsfc.nasa.gov/api/natural',
  epicArchive: 'https://epic.gsfc.nasa.gov/archive/natural',
  gibs: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
});

// NASA GIBS tile layers, all confirmed to return imagery in EPSG:3857.
// The fire / thermal anomaly layers were tested and rejected every
// GoogleMapsCompatible tile matrix set, so they are deliberately absent.
export const GIBS_LAYERS = Object.freeze([
  {
    id: 'truecolor',
    label: 'True colour',
    layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    maxZoom: 9,
    description: 'What the MODIS instrument on Terra saw, in natural colour.'
  },
  {
    id: 'viirs',
    label: 'True colour (VIIRS)',
    layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    maxZoom: 9,
    description: 'Natural colour from the VIIRS instrument on Suomi NPP.'
  },
  {
    id: 'aerosol',
    label: 'Aerosol depth',
    layer: 'MODIS_Combined_Value_Added_AOD',
    matrixSet: 'GoogleMapsCompatible_Level6',
    format: 'png',
    maxZoom: 6,
    description: 'Airborne particles: smoke, dust and haze seen from orbit.'
  },
  {
    id: 'landtemp',
    label: 'Land surface temp',
    layer: 'MODIS_Terra_Land_Surface_Temp_Day',
    matrixSet: 'GoogleMapsCompatible_Level7',
    format: 'png',
    maxZoom: 7,
    description: 'Daytime land surface temperature measured by MODIS.'
  }
]);

// Thresholds for the insight rules. All values are metric, matching the
// units the APIs return, so rules behave identically in either display unit.
export const THRESHOLDS = Object.freeze({
  uvIndex: 6,
  windSpeedKmh: 40,
  usAqi: 101,
  // The EPA "Unhealthy" boundary, where the air quality tip stops being a
  // caution for sensitive groups and becomes a warning for everyone.
  usAqiUnhealthy: 151,
  precipProbability: 60,
  anomalyWarmC: 3,
  anomalyCoolC: -3,
  apparentHotC: 32,
  apparentColdC: 0
});

// WMO weather interpretation codes returned by Open-Meteo.
// `icon` selects an inline SVG symbol defined in index.html.
export const WMO_CODES = Object.freeze({
  0: { label: 'Clear sky', icon: 'clear' },
  1: { label: 'Mainly clear', icon: 'clear' },
  2: { label: 'Partly cloudy', icon: 'partly' },
  3: { label: 'Overcast', icon: 'cloud' },
  45: { label: 'Fog', icon: 'fog' },
  48: { label: 'Depositing rime fog', icon: 'fog' },
  51: { label: 'Light drizzle', icon: 'drizzle' },
  53: { label: 'Moderate drizzle', icon: 'drizzle' },
  55: { label: 'Dense drizzle', icon: 'drizzle' },
  56: { label: 'Light freezing drizzle', icon: 'sleet' },
  57: { label: 'Dense freezing drizzle', icon: 'sleet' },
  61: { label: 'Slight rain', icon: 'rain' },
  63: { label: 'Moderate rain', icon: 'rain' },
  65: { label: 'Heavy rain', icon: 'rain' },
  66: { label: 'Light freezing rain', icon: 'sleet' },
  67: { label: 'Heavy freezing rain', icon: 'sleet' },
  71: { label: 'Slight snowfall', icon: 'snow' },
  73: { label: 'Moderate snowfall', icon: 'snow' },
  75: { label: 'Heavy snowfall', icon: 'snow' },
  77: { label: 'Snow grains', icon: 'snow' },
  80: { label: 'Slight rain showers', icon: 'rain' },
  81: { label: 'Moderate rain showers', icon: 'rain' },
  82: { label: 'Violent rain showers', icon: 'rain' },
  85: { label: 'Slight snow showers', icon: 'snow' },
  86: { label: 'Heavy snow showers', icon: 'snow' },
  95: { label: 'Thunderstorm', icon: 'storm' },
  96: { label: 'Thunderstorm with slight hail', icon: 'storm' },
  99: { label: 'Thunderstorm with heavy hail', icon: 'storm' }
});

// NASA POWER returns monthly climatology keyed by these abbreviations.
export const MONTH_KEYS = Object.freeze([
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
]);

// POWER uses -999 to mean "no data". It must never be rendered or used
// in arithmetic. The live value is read from header.fill_value; this is
// the documented default used when the header is absent.
export const POWER_FILL_VALUE = -999;

export const REQUEST_TIMEOUT_MS = 8000;
export const STORAGE_KEY = 'nasa-weather:last-location';
