// SOSMapView - Componente de mapa separado para alerta SOS
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface SOSMapViewProps {
  latitude: number;
  longitude: number;
  senderName: string;
}

// Icono de emergencia para el mapa
const emergencyIcon = new L.DivIcon({
  className: 'sos-marker',
  html: `
    <div style="
      width: 32px;
      height: 32px;
      background: #dc2626;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.5);
      animation: pulse 1s infinite;
    ">
      <span style="color: white; font-weight: bold; font-size: 10px;">SOS</span>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const SOSMapView = ({ latitude, longitude, senderName }: SOSMapViewProps) => {
  return (
    <div className="h-40 rounded-lg overflow-hidden border-2 border-red-300">
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        className="h-full w-full"
        scrollWheelZoom={false}
        dragging={true}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          position={[latitude, longitude]}
          icon={emergencyIcon}
        >
          <Popup>
            <strong>🆘 {senderName}</strong>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default SOSMapView;
