// Owns the Leaflet instance. Nothing else in the app touches Leaflet.

import { API, GIBS_LAYERS } from './config.js';

let map = null;
let marker = null;
let tileLayer = null;
let activeLayerId = GIBS_LAYERS[0].id;

/**
 * GIBS publishes imagery per UTC day. Today's tiles are often not processed
 * yet, so the app requests yesterday, which is reliably available.
 */
export function gibsDateString(date = new Date()) {
  const utc = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return utc.toISOString().slice(0, 10);
}

function layerById(id) {
  return GIBS_LAYERS.find((l) => l.id === id) || GIBS_LAYERS[0];
}

export function initMap(elementId) {
  map = L.map(elementId, {
    center: [20, 0],
    zoom: 2,
    worldCopyJump: true,
    attributionControl: true
  });
  setLayer(activeLayerId);
  return map;
}

/** Swaps the GIBS tile layer, keeping the current view. */
export function setLayer(layerId) {
  const config = layerById(layerId);
  activeLayerId = config.id;

  if (tileLayer) map.removeLayer(tileLayer);

  // NASA GIBS follows the WMTS REST convention, which orders the path as
  // {TileMatrix}/{TileRow}/{TileCol}, i.e. {z}/{y}/{x}. Leaflet's own
  // default is {z}/{x}/{y}, so the axis order here is deliberate.
  const template =
    `${API.gibs}/${config.layer}/default/${gibsDateString()}/${config.matrixSet}/{z}/{y}/{x}.${config.format}`;

  tileLayer = L.tileLayer(template, {
    maxZoom: config.maxZoom,
    minZoom: 1,
    tileSize: 256,
    attribution: 'Imagery: NASA EOSDIS GIBS'
  });
  tileLayer.addTo(map);

  // Zooming past the layer's maximum leaves the map blank, so clamp it.
  if (map.getZoom() > config.maxZoom) map.setZoom(config.maxZoom);
  map.setMaxZoom(config.maxZoom);

  return config;
}

export function flyTo(latitude, longitude, label) {
  const config = layerById(activeLayerId);
  const zoom = Math.min(6, config.maxZoom);
  map.flyTo([latitude, longitude], zoom, { duration: 1.2 });

  if (marker) map.removeLayer(marker);
  marker = L.marker([latitude, longitude]).addTo(map);
  marker.bindPopup(label);

  // The map is decorative to a screen reader unless it says where it is.
  document.getElementById('map')
    .setAttribute('aria-label', `Satellite map centred on ${label}, showing the ${config.label} layer`);
}

/** Builds the layer switch buttons and reports the active layer's metadata. */
export function renderLayerSwitch(containerId, onSelect) {
  const container = document.getElementById(containerId);
  container.replaceChildren();

  for (const config of GIBS_LAYERS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'layer-switch__btn';
    button.textContent = config.label;
    button.setAttribute('aria-pressed', String(config.id === activeLayerId));
    if (config.id === activeLayerId) button.classList.add('is-active');

    button.addEventListener('click', () => {
      const applied = setLayer(config.id);
      for (const sibling of container.children) {
        const isActive = sibling === button;
        sibling.classList.toggle('is-active', isActive);
        sibling.setAttribute('aria-pressed', String(isActive));
      }
      onSelect(applied);
    });

    container.appendChild(button);
  }
  return layerById(activeLayerId);
}
