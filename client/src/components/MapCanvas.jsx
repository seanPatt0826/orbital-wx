import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useEffect } from 'react';

const GIBS_TIME = '2024-06-01';
const gibsUrl = (layer, ext) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${GIBS_TIME}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.${ext}`;

// PNG for thematic overlays, JPG only for the true-color fallback.
const extFor = (layer) => (layer === 'MODIS_Terra_CorrectedReflectance_TrueColor' ? 'jpg' : 'png');

function Controller({ bbox, gibsLayerId }) {
  const map = useMap();
  useEffect(() => {
    if (bbox) {
      map.flyToBounds([[bbox.minLat, bbox.minLon], [bbox.maxLat, bbox.maxLon]], { duration: 1.2 });
    }
  }, [bbox, map]);
  return null;
}

export default function MapCanvas({ bbox, gibsLayerId }) {
  return (
    <MapContainer center={[10, 10]} zoom={2} style={{ height: '100%', width: '100%' }} worldCopyJump>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                 attribution="&copy; CARTO" />
      {gibsLayerId && (
        <TileLayer key={gibsLayerId} url={gibsUrl(gibsLayerId, extFor(gibsLayerId))}
                   opacity={0.75} attribution="Imagery &copy; NASA GIBS" />
      )}
      <Controller bbox={bbox} gibsLayerId={gibsLayerId} />
    </MapContainer>
  );
}
