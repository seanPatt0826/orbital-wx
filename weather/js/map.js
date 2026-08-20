// Owns the CesiumJS globe. Nothing else in the app touches Cesium.
//
// Cesium arrives as a UMD bundle from a CDN, so there is still no build step
// and still no API key: no ion asset is ever requested, and every tile comes
// from NASA GIBS, which is open. See index.html for the two script tags.

import { API, GIBS_LAYERS, GIBS_BASE, GLOBE } from './config.js';

let viewer = null;
let overlay = null;
let marker = null;
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

/**
 * Builds the options for one GIBS layer.
 *
 * The layer id and tile matrix set are interpolated into the URL rather than
 * left as Cesium template tokens: the provider lowercases those particular
 * tokens ({layer}, {tilematrixset}) and depending on that casing is a trap.
 * Only {TileMatrix}/{TileRow}/{TileCol} are substituted per tile.
 */
function gibsProvider({ layer, matrixSet, format, maxZoom, date }) {
  const stamp = date ? `${date}/` : '';
  return new Cesium.WebMapTileServiceImageryProvider({
    url: `${API.gibs}/${layer}/default/${stamp}${matrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${format}`,
    layer,
    style: 'default',
    format: format === 'png' ? 'image/png' : 'image/jpeg',
    tileMatrixSetID: matrixSet,
    maximumLevel: maxZoom,
    // The epsg3857 endpoint is web mercator. Cesium's WMTS provider assumes a
    // geographic tiling scheme and would misregister every tile without this.
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    credit: 'Imagery: NASA EOSDIS GIBS'
  });
}

export function initMap(elementId) {
  const element = document.getElementById(elementId);

  // Cesium ships with a default ion access token baked into the bundle. This
  // app promises no API keys anywhere, and an unused-but-present credential is
  // still a credential, so it is cleared before the viewer exists. Nothing
  // here requests an ion asset; clearing it makes that structural rather than
  // a matter of trust, and any accidental ion call now fails loudly.
  Cesium.Ion.defaultAccessToken = undefined;

  // The default credit is the Cesium ion logo, which advertises a hosted
  // service this app deliberately does not use. CesiumJS is Apache 2.0 and
  // asks for attribution, not for that logo, so it is credited in words.
  // NASA's imagery credit rides along with each tile provider. Must be set
  // before the viewer is constructed: the display reads it at creation.
  Cesium.CreditDisplay.cesiumCredit = new Cesium.Credit('Globe rendered with CesiumJS', false);

  viewer = new Cesium.Viewer(element, {
    // Blue Marble underneath everything: it is a static global mosaic with no
    // orbital gaps, so where a daily swath is missing the globe shows terrain
    // rather than a black sliver.
    baseLayer: new Cesium.ImageryLayer(gibsProvider(GIBS_BASE)),
    baseLayerPicker: false,
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
    // Redraw on change rather than running a 60fps loop while the page idles.
    requestRenderMode: true
  });

  const { scene } = viewer;
  scene.globe.baseColor = Cesium.Color.fromCssColorString(GLOBE.oceanColor);
  // Even illumination. A real day/night terminator would hide half the data,
  // and this is an instrument panel rather than an orrery.
  scene.globe.enableLighting = false;
  // Shades the limb so the globe reads as a sphere. At full brightness it fogs
  // out the imagery, so it is darkened and desaturated.
  scene.globe.showGroundAtmosphere = true;
  scene.globe.atmosphereBrightnessShift = -0.4;
  scene.globe.atmosphereSaturationShift = -0.3;
  scene.skyAtmosphere.brightnessShift = -0.1;

  setLayer(activeLayerId);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0, 15, GLOBE.startAltitudeMetres)
  });

  // On desktop the map panel stretches to match the readout column, which only
  // reaches full height once the forecast, anomaly and tips have loaded - long
  // after this runs. requestRenderMode means Cesium is not polling for that, so
  // it has to be told, or the globe keeps its startup size in a taller box.
  //
  // Thresholded, because the readout column reflows by a pixel or two whenever
  // a value is re-rendered - switching to Fahrenheit widens every number. Each
  // of those would otherwise resize the globe and pull fresh tiles for a
  // change nobody can see.
  if (typeof ResizeObserver === 'function') {
    let appliedWidth = 0;
    let appliedHeight = 0;
    new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (Math.abs(width - appliedWidth) < GLOBE.resizeThresholdPx
        && Math.abs(height - appliedHeight) < GLOBE.resizeThresholdPx) return;
      appliedWidth = width;
      appliedHeight = height;
      viewer.resize();
      viewer.scene.requestRender();
    }).observe(element);
  }

  return viewer;
}

/** Swaps the daily GIBS overlay, keeping the current camera position. */
export function setLayer(layerId) {
  const config = layerById(layerId);
  activeLayerId = config.id;
  if (!viewer || viewer.isDestroyed()) return config;

  if (overlay) {
    viewer.imageryLayers.remove(overlay, true);
    overlay = null;
  }

  const provider = gibsProvider({ ...config, date: gibsDateString() });
  // GIBS 404s on layer and date combinations it does not hold. Cesium retries
  // on its own, so this is logged once rather than surfaced as a panel error.
  provider.errorEvent.addEventListener((error) => {
    console.warn(`GIBS tile request failed for ${config.layer}`, error);
  });

  overlay = viewer.imageryLayers.addImageryProvider(provider);
  // Thematic layers read better with the Blue Marble relief showing through;
  // true colour is the photograph itself and is left opaque.
  overlay.alpha = config.format === 'png' ? GLOBE.thematicAlpha : 1;

  // MODIS and VIIRS image in strips, and consecutive orbits do not quite meet
  // near the equator. Those gaps arrive as black pixels inside a JPEG, which
  // has no alpha channel, so they cannot reveal the layer underneath on their
  // own and read as tears in the planet. Keying near-black out turns them back
  // into windows onto Blue Marble. The threshold is deliberately tight: deep
  // ocean in true colour is dark navy, not black, and must survive.
  overlay.colorToAlpha = Cesium.Color.BLACK;
  overlay.colorToAlphaThreshold = GLOBE.noDataThreshold;

  return config;
}

export function flyTo(latitude, longitude, label) {
  const config = layerById(activeLayerId);

  if (marker) viewer.entities.remove(marker);
  marker = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
    point: {
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString(GLOBE.accentColor),
      outlineColor: Cesium.Color.fromCssColorString(GLOBE.markerOutline),
      outlineWidth: 2,
      // Keeps the marker visible when it sits over the horizon-facing surface.
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: label,
      font: '13px ui-monospace, Consolas, monospace',
      fillColor: Cesium.Color.fromCssColorString(GLOBE.labelColor),
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString(GLOBE.labelBackground),
      pixelOffset: new Cesium.Cartesian2(0, -22),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, GLOBE.regionAltitudeMetres),
    duration: GLOBE.flyDurationSeconds
  });

  // The globe is decorative to a screen reader unless it says where it is.
  document.getElementById('map')
    .setAttribute('aria-label', `Satellite globe centred on ${label}, showing the ${config.label} layer`);
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
