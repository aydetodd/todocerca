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
  console.log('🗺️ ProvidersMap recibió proveedores:', providers);
  
  // Filter providers with valid coordinates
  const validProviders = providers.filter(p => p.latitude && p.longitude);
  console.log('✅ Proveedores válidos con coordenadas:', validProviders);
  
  if (validProviders.length === 0) {
    return (
      <div className="w-full h-[500px] rounded-lg overflow-hidden border flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">No hay proveedores con ubicación disponible</p>
      </div>
    );
  }
  
  // Center map on first provider
  const center: [number, number] = [validProviders[0].latitude, validProviders[0].longitude];
  
  console.log('🎯 Centro del mapa:', center, 'Proveedores a mostrar:', validProviders.length);

  // Create a key based on providers to force remount when they change
  const mapKey = validProviders.map(p => p.id).join('-');

  return (
    <div className="w-full h-[500px] rounded-lg overflow-hidden border">
      <MapContainer
        key={mapKey}
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validProviders.map((provider) => (
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
        ))}
      </MapContainer>
    </div>
  );
};

export default ProvidersMap;
