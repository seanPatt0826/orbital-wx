// Pure logic. No network, no DOM, no side effects.
// Everything here is unit tested, which is only possible because it is pure.

import { WMO_CODES, MONTH_KEYS, THRESHOLDS, POWER_FILL_VALUE } from './config.js';

// Rendered whenever a value is genuinely unavailable. Never render a zero
// or a guess in its place.
export const EM_DASH = '—';

/** True only for real, finite numbers. Guards every formatter below. */
function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function celsiusToFahrenheit(celsius) {
  if (!isNumber(celsius)) return null;
  return celsius * 9 / 5 + 32;
}

export function kmhToMph(kmh) {
  if (!isNumber(kmh)) return null;
  return kmh * 0.621371;
}

/**
 * Converts a temperature DIFFERENCE, which scales by 9/5 with no offset.
 * Passing a difference through celsiusToFahrenheit would add 32 degrees to
 * it and be wrong every single time, so the two conversions are separate
 * functions rather than one function with a flag.
 */
export function celsiusDeltaToFahrenheit(deltaC) {
  if (!isNumber(deltaC)) return null;
  return deltaC * 9 / 5;
}

/**
 * Reads the first entry of a forecast series. Open-Meteo omits a field
 * outright when it has nothing to report, so indexing it directly throws
 * instead of yielding a missing value.
 */
export function firstValue(series) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const value = series[0];
  return isNumber(value) ? value : null;
}

/** Maps a WMO weather interpretation code to a label and an SVG icon id. */
export function describeWeatherCode(code) {
  const entry = WMO_CODES[code];
  if (!entry) return { label: 'Unknown', icon: 'unknown' };
  // Copy: Object.freeze on WMO_CODES does not freeze the nested entries, so
  // returning one directly lets any caller corrupt the table for everyone.
  return { ...entry };
}

/**
 * Formats a Celsius value for display. Conversion happens here, at render
 * time, so all stored values and all threshold comparisons stay metric.
 */
export function formatTemperature(celsius, units) {
  if (!isNumber(celsius)) return EM_DASH;
  if (units === 'imperial') {
    return `${celsiusToFahrenheit(celsius).toFixed(1)} F`;
  }
  return `${celsius.toFixed(1)} C`;
}

/** Formats any other measurement with an explicit unit label. */
export function formatMeasurement(value, unit = '', digits = 1) {
  if (!isNumber(value)) return EM_DASH;
  // trim() covers the unitless case, such as the UV index.
  return `${value.toFixed(digits)} ${unit}`.trim();
}

/**
 * Converts a Date into the JAN..DEC key NASA POWER uses for climatology.
 * Reads the browser's local month, so it is only correct for a location in
 * the browser's own timezone. For a searched location use
 * monthKeyFromIsoDate with the date Open-Meteo reports for that place.
 */
export function monthKeyFromDate(date) {
  return MONTH_KEYS[date.getMonth()];
}

/**
 * Converts Open-Meteo's local date string ("YYYY-MM-DD") into a POWER month
 * key. The string is parsed by hand rather than through Date: Date treats a
 * bare date as UTC midnight and then reports it in the machine's timezone,
 * which slides the day either side of a month boundary. The date already
 * belongs to the searched location, so no conversion is wanted at all.
 */
export function monthKeyFromIsoDate(isoDate) {
  if (typeof isoDate !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return MONTH_KEYS[monthIndex];
}

/**
 * The headline number: how far today's mean temperature sits from the
 * long-term average for this month at this exact point.
 *
 * Returns null rather than a guess whenever the comparison cannot be made
 * honestly, including when POWER reports its fill value (-999) for the month.
 */
export function computeAnomaly(todayMeanC, normals, monthKey, fillValue = POWER_FILL_VALUE) {
  if (!isNumber(todayMeanC)) return null;
  if (!normals || typeof normals !== 'object') return null;

  const normal = normals[monthKey];
  if (!isNumber(normal)) return null;
  if (normal === fillValue) return null;

  return todayMeanC - normal;
}

// US AQI breakpoints as published by the EPA.
const AQI_BANDS = [
  { max: 50, label: 'Good', level: 1 },
  { max: 100, label: 'Moderate', level: 2 },
  { max: 150, label: 'Unhealthy for sensitive groups', level: 3 },
  { max: 200, label: 'Unhealthy', level: 4 },
  { max: 300, label: 'Very unhealthy', level: 5 },
  { max: Infinity, label: 'Hazardous', level: 6 }
];

export function aqiCategory(usAqi) {
  if (!isNumber(usAqi)) return null;
  const band = AQI_BANDS.find((b) => usAqi <= b.max);
  return { label: band.label, level: band.level };
}

/**
 * Turns real measured values into actionable advice.
 *
 * Every rule reads a metric value and fires only when that value is actually
 * present, so a failed air quality request silently produces fewer tips
 * rather than a wrong one.
 */
export function buildTips(conditions) {
  const {
    uvIndexMax = null,
    windSpeedKmh = null,
    usAqi = null,
    precipProbabilityMax = null,
    anomalyC = null,
    apparentTemperatureC = null
  } = conditions || {};

  const tips = [];

  if (isNumber(uvIndexMax) && uvIndexMax >= THRESHOLDS.uvIndex) {
    tips.push({
      id: 'uv',
      severity: 'caution',
      title: 'Sun protection advised',
      body: `The UV index peaks at ${uvIndexMax.toFixed(1)} today. Cover up or use sunscreen around midday.`
    });
  }

  if (isNumber(windSpeedKmh) && windSpeedKmh >= THRESHOLDS.windSpeedKmh) {
    tips.push({
      id: 'wind',
      severity: 'caution',
      title: 'Strong wind',
      body: `Wind is running at ${windSpeedKmh.toFixed(0)} km/h. Secure loose outdoor objects.`
    });
  }

  if (isNumber(usAqi) && usAqi >= THRESHOLDS.usAqi) {
    const category = aqiCategory(usAqi);
    tips.push({
      id: 'aqi',
      severity: usAqi >= THRESHOLDS.usAqiUnhealthy ? 'warning' : 'caution',
      title: `Air quality: ${category.label.toLowerCase()}`,
      body: `US AQI is ${usAqi}. Sensitive groups should limit prolonged outdoor exertion.`
    });
    // The point where the weather data and the NASA data meet.
    tips.push({
      id: 'aqi-aerosol',
      severity: 'info',
      title: 'See it from orbit',
      body: 'Switch the map to the aerosol depth layer to see the airborne particles measured by MODIS.'
    });
  }

  if (isNumber(precipProbabilityMax) && precipProbabilityMax >= THRESHOLDS.precipProbability) {
    tips.push({
      id: 'precip',
      severity: 'info',
      title: 'Rain likely',
      body: `Precipitation probability reaches ${precipProbabilityMax.toFixed(0)} percent today.`
    });
  }

  if (isNumber(apparentTemperatureC) && apparentTemperatureC >= THRESHOLDS.apparentHotC) {
    tips.push({
      id: 'heat',
      severity: 'warning',
      title: 'Heat stress risk',
      body: `It feels like ${apparentTemperatureC.toFixed(1)} C. Hydrate and avoid exertion in the afternoon.`
    });
  }

  if (isNumber(apparentTemperatureC) && apparentTemperatureC <= THRESHOLDS.apparentColdC) {
    tips.push({
      id: 'freeze',
      severity: 'warning',
      title: 'Freezing conditions',
      body: `It feels like ${apparentTemperatureC.toFixed(1)} C. Watch for ice underfoot.`
    });
  }

  if (isNumber(anomalyC) && anomalyC >= THRESHOLDS.anomalyWarmC) {
    tips.push({
      id: 'anomaly-warm',
      severity: 'info',
      title: 'Warmer than the long-term average',
      body: `Today runs ${anomalyC.toFixed(1)} C above the NASA POWER average for this month here.`
    });
  }

  if (isNumber(anomalyC) && anomalyC <= THRESHOLDS.anomalyCoolC) {
    tips.push({
      id: 'anomaly-cool',
      severity: 'info',
      title: 'Cooler than the long-term average',
      body: `Today runs ${Math.abs(anomalyC).toFixed(1)} C below the NASA POWER average for this month here.`
    });
  }

  return tips;
}

