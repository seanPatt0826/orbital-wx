export const PHENOMENA = {
  drought: {
    id: 'drought',
    label: 'Drought (precipitation dryness)',
    gibsLayerId: 'MODIS_Terra_NDVI_8Day',
    gridFile: 'drought.json',
    bands: [
      { name: 'Severe', min: 0, max: 10, color: '#7f1d1d' },
      { name: 'Moderate', min: 10, max: 30, color: '#f59e0b' },
      { name: 'Mild', min: 30, max: 50, color: '#fbbf24' },
      { name: 'Normal', min: 50, max: Infinity, color: '#16a34a' },
    ],
  },
  wildfires: {
    id: 'wildfires',
    label: 'Active fires',
    gibsLayerId: 'MODIS_Terra_Thermal_Anomalies_All',
    gridFile: 'wildfires.json',
    bands: [
      { name: 'None', min: 0, max: 1, color: '#1f2937' },
      { name: 'Low', min: 1, max: 5, color: '#f59e0b' },
      { name: 'High', min: 5, max: Infinity, color: '#dc2626' },
    ],
  },
  heat: {
    id: 'heat',
    label: 'Land surface temperature',
    gibsLayerId: 'MODIS_Terra_Land_Surface_Temp_Day',
    gridFile: 'heat.json',
    bands: [
      { name: 'Cold', min: -Infinity, max: 0, color: '#2563eb' },
      { name: 'Mild', min: 0, max: 25, color: '#16a34a' },
      { name: 'Hot', min: 25, max: 40, color: '#f59e0b' },
      { name: 'Extreme', min: 40, max: Infinity, color: '#dc2626' },
    ],
  },
};

export function listPhenomenaIds() {
  return Object.keys(PHENOMENA);
}
