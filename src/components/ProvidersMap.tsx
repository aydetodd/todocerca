import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon in React-Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface Provider {
  id: string;
  business_name: string;
  business_address: string;
  business_phone: string | null;
  latitude: number;
  longitude: number;
  productos: {
    nombre: string;
    precio: number;
  }[];
}

interface ProvidersMapProps {
  providers: Provider[];
}

const ProvidersMap = ({ providers }: ProvidersMapProps) => {
  // Center map on Mexico City by default, or first provider if available
  const defaultCenter: [number, number] = [19.4326, -99.1332];
  const center: [number, number] = providers.length > 0 && providers[0].latitude && providers[0].longitude
    ? [providers[0].latitude, providers[0].longitude]
    : defaultCenter;

  return (
    <div className="w-full h-[500px] rounded-lg overflow-hidden border">
      <MapContainer
        center={center}
        zoom={providers.length > 0 ? 12 : 5}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {providers.map((provider) => {
          if (!provider.latitude || !provider.longitude) return null;
          
          return (
            <Marker
              key={provider.id}
              position={[provider.latitude, provider.longitude]}
            >
              <Popup>
                <div className="p-2">
                  <h3 className="font-semibold text-lg mb-1">{provider.business_name}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{provider.business_address}</p>
                  {provider.business_phone && (
                    <p className="text-sm mb-2">
                      <span className="font-medium">Teléfono:</span> {provider.business_phone}
                    </p>
                  )}
                  {provider.productos.length > 0 && (
                    <div>
                      <p className="font-medium text-sm mb-1">Productos encontrados:</p>
                      <ul className="text-sm">
                        {provider.productos.map((producto, idx) => (
                          <li key={idx}>
                            {producto.nombre} - ${producto.precio}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default ProvidersMap;
