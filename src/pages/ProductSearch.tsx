import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search as SearchIcon, MapPin, Map as MapIcon, List, ArrowLeft, X, Clock } from "lucide-react";
import { GlobalHeader } from "@/components/GlobalHeader";
import { NavigationBar } from "@/components/NavigationBar";
import ProvidersMapView from "@/components/ProvidersMapView";
import { StatusControl } from "@/components/StatusControl";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMunicipios } from "@/hooks/useMunicipios";

interface Category {
  id: string;
  name: string;
}

type VehicleFilter = "all" | "taxi" | "ruta";

type MapProvider = {
  id: string;
  business_name: string;
  business_address: string;
  business_phone: string | null;
  latitude: number;
  longitude: number;
  user_id: string;
  productos: {
    nombre: string;
    precio: number;
    descripcion: string;
    stock: number;
    unit: string;
    categoria: string;
  }[];
};

interface AvailableRoute {
  nombre: string;
  count: number;
}

const ALL_MUNICIPIOS_VALUE = "__ALL__";

const ProductSearch = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [searchEstado, setSearchEstado] = useState<string>("Sonora");
  const [searchCiudad, setSearchCiudad] = useState<string>("Cajeme");

  const [availableRoutes, setAvailableRoutes] = useState<AvailableRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [loadingRoutes, setLoadingRoutes] = useState(false);

  const [results, setResults] = useState<any[]>([]);
  const [mapProviders, setMapProviders] = useState<MapProvider[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const { getEstados, getMunicipios } = useMunicipios();

  const municipiosDisponibles = useMemo(
    () => getMunicipios(searchEstado),
    [searchEstado, getMunicipios]
  );

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const selectedCategoryName = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId)?.name,
    [categories, selectedCategoryId]
  );

  const isCosasGratis = (selectedCategoryName || "").toLowerCase().includes("gratis");

  const vehicleFilter: VehicleFilter = useMemo(() => {
    if (selectedCategoryName === "Taxi") return "taxi";
    if (selectedCategoryName === "Rutas de Transporte") return "ruta";
    return "all";
  }, [selectedCategoryName]);

  const isRutasCategory = selectedCategoryName === "Rutas de Transporte";

  // Fetch available routes when "Rutas de Transporte" is selected
  useEffect(() => {
    if (!isRutasCategory) {
      setAvailableRoutes([]);
      setSelectedRoute(null);
      return;
    }

    const fetchAvailableRoutes = async () => {
      setLoadingRoutes(true);
      try {
        // Get the "Rutas de Transporte" category ID
        const rutasCategory = categories.find(c => c.name === "Rutas de Transporte");
        if (!rutasCategory) {
          setAvailableRoutes([]);
          return;
        }

        let query = supabase
          .from("productos")
          .select("nombre")
          .eq("category_id", rutasCategory.id)
          .eq("is_available", true)
          .gte("stock", 1);

        // Location filters
        if (searchEstado) query = query.eq("estado", searchEstado);
        if (searchCiudad && searchCiudad !== ALL_MUNICIPIOS_VALUE) {
          query = query.eq("ciudad", searchCiudad);
        }

        const { data, error } = await query;

        if (error) {
          console.error("[ProductSearch] Error fetching routes:", error);
          setAvailableRoutes([]);
          return;
        }

        // Group routes and count them
        const routeCountMap = new Map<string, number>();
        (data || []).forEach((producto: any) => {
          const routeName = producto.nombre;
          routeCountMap.set(routeName, (routeCountMap.get(routeName) || 0) + 1);
        });

        // Convert to array and sort
        const routes: AvailableRoute[] = Array.from(routeCountMap.entries())
          .map(([nombre, count]) => ({ nombre, count }))
          .sort((a, b) => {
            // Extract route number for natural sorting
            const numA = parseInt(a.nombre.match(/\d+/)?.[0] || "0");
            const numB = parseInt(b.nombre.match(/\d+/)?.[0] || "0");
            return numA - numB;
          });

        setAvailableRoutes(routes);
      } catch (err) {
        console.error("[ProductSearch] Error:", err);
        setAvailableRoutes([]);
      } finally {
        setLoadingRoutes(false);
      }
    };

    fetchAvailableRoutes();
  }, [isRutasCategory, searchEstado, searchCiudad, categories]);

  useEffect(() => {
    document.title = "Buscar productos, taxi y rutas | TodoCerca";

    const meta = document.querySelector('meta[name="description"]');
    meta?.setAttribute(
      "content",
      "Busca productos, taxi, rutas y cosas gratis por estado y municipio en TodoCerca."
    );

    // Canonical
    const canonicalHref = `${window.location.origin}/search`;
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalHref;

    let cancelled = false;

    const loadCategories = async () => {
      try {
        const { data, error } = await supabase
          .from("product_categories")
          .select("id, name")
          .order("name");

        if (error) throw error;
        if (cancelled) return;

        setCategories(data || []);
      } catch (err) {
        console.error("[ProductSearch] Error loading categories:", err);
      }
    };

    loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async (e?: FormEvent) => {
    e?.preventDefault();

    setLoading(true);
    setHasSearched(true);

    try {
      // Check if searching for "Cosas gratis" category
      if (isCosasGratis) {
        // Search in listings table for free items
        let query = supabase
          .from("listings")
          .select(`
            id, title, description, price, is_free, latitude, longitude, profile_id, created_at, expires_at,
            profiles (
              id, nombre, user_id, telefono
            ),
            fotos_listings (
              url, es_principal
            )
          `)
          .eq("is_active", true)
          .gt("expires_at", new Date().toISOString());

        // Keyword search
        if (searchTerm.trim()) {
          query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query.limit(50);

        if (error) {
          console.error("[ProductSearch] Error searching listings:", error);
          setResults([]);
          setMapProviders([]);
          return;
        }

        const rows = data || [];
        
        // Transform listings to match product format for display
        const transformedResults = rows.map((listing: any) => ({
          id: listing.id,
          nombre: listing.title,
          descripcion: listing.description,
          precio: listing.price || 0,
          stock: 1,
          unit: "unidad",
          is_listing: true,
          is_free: listing.is_free,
          latitude: listing.latitude,
          longitude: listing.longitude,
          profiles: listing.profiles,
          fotos: listing.fotos_listings,
          created_at: listing.created_at,
          expires_at: listing.expires_at,
        }));

        setResults(transformedResults);

        // Build map providers from listings with coordinates
        const providerMap = new Map<string, MapProvider>();
        rows.forEach((listing: any) => {
          if (!listing.latitude || !listing.longitude) return;
          
          const profile = listing.profiles;
          if (!profile?.id || !profile?.user_id) return;

          const providerId = String(profile.id);
          const existing = providerMap.get(providerId);

          const productForMap = {
            nombre: String(listing.title ?? ""),
            precio: Number(listing.price ?? 0),
            descripcion: String(listing.description ?? ""),
            stock: 1,
            unit: "unidad",
            categoria: "Cosas gratis",
          };

          if (!existing) {
            providerMap.set(providerId, {
              id: providerId,
              business_name: String(profile.nombre ?? "Usuario"),
              business_address: "",
              business_phone: profile.telefono || null,
              latitude: Number(listing.latitude),
              longitude: Number(listing.longitude),
              user_id: String(profile.user_id),
              productos: [productForMap],
            });
          } else {
            existing.productos.push(productForMap);
          }
        });

        setMapProviders(Array.from(providerMap.values()));
      } else {
        // Regular product search
        let query = supabase
          .from("productos")
          .select(`
            id, nombre, descripcion, precio, stock, unit, proveedor_id, category_id, estado, ciudad,
            proveedores (
              id, nombre, user_id, telefono, business_address, business_phone, latitude, longitude
            )
          `)
          .eq("is_available", true)
          .gte("stock", 1);

        // Location filters
        if (searchEstado) query = query.eq("estado", searchEstado);
        if (searchCiudad && searchCiudad !== ALL_MUNICIPIOS_VALUE) {
          query = query.eq("ciudad", searchCiudad);
        }

        // Category filter
        if (selectedCategoryId) {
          query = query.eq("category_id", selectedCategoryId);
        }

        // Route filter (for "Rutas de Transporte")
        if (isRutasCategory && selectedRoute) {
          query = query.eq("nombre", selectedRoute);
        }

        // Keyword search
        if (searchTerm.trim()) {
          query = query.or(`nombre.ilike.%${searchTerm}%,keywords.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query.limit(50);

        if (error) {
          console.error("[ProductSearch] Error searching:", error);
          setResults([]);
          setMapProviders([]);
          return;
        }

        const rows = data || [];
        setResults(rows);

        // Build providers list for map from product rows
        const providerMap = new Map<string, MapProvider>();
        rows.forEach((producto: any) => {
          const prov = producto.proveedores;
          if (!prov?.id || !prov?.user_id) return;

          const providerId = String(prov.id);
          const existing = providerMap.get(providerId);

          const categoria = categoryNameById.get(String(producto.category_id)) || selectedCategoryName || "";

          const productForMap = {
            nombre: String(producto.nombre ?? ""),
            precio: Number(producto.precio ?? 0),
            descripcion: String(producto.descripcion ?? ""),
            stock: Number(producto.stock ?? 0),
            unit: String(producto.unit ?? ""),
            categoria,
          };

          if (!existing) {
            providerMap.set(providerId, {
              id: providerId,
              business_name: String(prov.nombre ?? "Proveedor"),
              business_address: String(prov.business_address ?? ""),
              business_phone: (prov.business_phone ?? prov.telefono ?? null) as string | null,
              latitude: Number(prov.latitude ?? 0),
              longitude: Number(prov.longitude ?? 0),
              user_id: String(prov.user_id),
              productos: [productForMap],
            });
          } else {
            existing.productos.push(productForMap);
          }
        });

        setMapProviders(Array.from(providerMap.values()));
      }
    } catch (err) {
      console.error("[ProductSearch] Error:", err);
      setResults([]);
      setMapProviders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    const newSelected = selectedCategoryId === categoryId ? null : categoryId;
    setSelectedCategoryId(newSelected);
    setSelectedRoute(null); // Reset route selection when changing category
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />

      <main className="container mx-auto px-4 py-8 pb-24">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">Buscar Productos y Servicios</h1>
        </header>

        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Buscar productos o servicios..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>
              <SearchIcon className="w-4 h-4 mr-2" />
              {loading ? "Buscando…" : "Buscar"}
            </Button>
          </div>
        </form>

        <section aria-label="Ubicación" className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Estado:</p>
              <Select
                value={searchEstado}
                onValueChange={(v) => {
                  setSearchEstado(v);
                  setSearchCiudad(ALL_MUNICIPIOS_VALUE);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona estado" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {getEstados().map((estado) => (
                    <SelectItem key={estado} value={estado}>
                      {estado}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Municipio:</p>
              <Select value={searchCiudad} onValueChange={setSearchCiudad}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona municipio" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value={ALL_MUNICIPIOS_VALUE}>Todos</SelectItem>
                  {municipiosDisponibles.map((ciudad) => (
                    <SelectItem key={ciudad} value={ciudad}>
                      {ciudad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section aria-label="Categorías" className="mb-6">
          <p className="text-sm text-muted-foreground mb-3">Categorías:</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Badge
                key={category.id}
                variant={selectedCategoryId === category.id ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/80 transition-colors px-3 py-1.5"
                onClick={() => handleCategoryClick(category.id)}
              >
                {category.name}
              </Badge>
            ))}
          </div>
        </section>

        {/* Route selector when "Rutas de Transporte" is selected */}
        {isRutasCategory && (
          <section aria-label="Rutas disponibles" className="mb-6">
            <p className="text-sm text-muted-foreground mb-3">
              Rutas disponibles en {searchCiudad === ALL_MUNICIPIOS_VALUE ? searchEstado : `${searchCiudad}, ${searchEstado}`}:
            </p>
            {loadingRoutes ? (
              <p className="text-sm text-muted-foreground">Cargando rutas...</p>
            ) : availableRoutes.length === 0 ? (
              <p className="text-sm text-orange-500">
                No hay rutas registradas en esta ubicación.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableRoutes.map((route) => (
                  <Badge
                    key={route.nombre}
                    variant={selectedRoute === route.nombre ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary/80 transition-colors px-3 py-1.5"
                    onClick={() => setSelectedRoute(selectedRoute === route.nombre ? null : route.nombre)}
                  >
                    {route.nombre} ({route.count})
                  </Badge>
                ))}
              </div>
            )}
          </section>
        )}

        {hasSearched && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {results.length} resultado{results.length !== 1 ? "s" : ""} encontrado{results.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="flex rounded-lg overflow-hidden border border-border mb-6">
              <Button
                type="button"
                variant={viewMode === "map" ? "default" : "ghost"}
                className="flex-1 rounded-none"
                onClick={() => setViewMode("map")}
              >
                <MapIcon className="w-4 h-4 mr-2" />
                Ver Mapa
              </Button>
              <Button
                type="button"
                variant={viewMode === "list" ? "default" : "ghost"}
                className="flex-1 rounded-none"
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4 mr-2" />
                Ver Listado
              </Button>
            </div>

            {viewMode === "map" ? (
              <section aria-label="Mapa" className="fixed inset-0 z-50 bg-background">
                <div className="absolute top-4 left-4 z-[1000]">
                  <Button
                    variant="default"
                    size="lg"
                    onClick={() => setViewMode("list")}
                    className="shadow-2xl bg-primary hover:bg-primary/90"
                  >
                    <ArrowLeft className="h-5 w-5 mr-2" />
                    Volver
                  </Button>
                </div>
                <div className="absolute top-4 right-4 z-[1000]">
                  <StatusControl />
                </div>
                <div className="h-full w-full">
                  <ProvidersMapView providers={mapProviders as any} vehicleFilter={vehicleFilter} />
                </div>
              </section>
            ) : (
              <section aria-label="Resultados" className="space-y-4">
                {results.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-muted-foreground">No se encontraron resultados.</p>
                    </CardContent>
                  </Card>
                ) : (
                  results.map((item) => {
                    const foto = item.fotos?.find((f: any) => f.es_principal) || item.fotos?.[0];
                    return (
                      <Card key={item.id}>
                        <CardContent className="p-4">
                          <div className="flex gap-3">
                            {/* Photo thumbnail for free items */}
                            {foto?.url && (
                              <div 
                                className="flex-shrink-0 cursor-pointer"
                                onClick={() => setLightboxImage(foto.url)}
                              >
                                <img
                                  src={foto.url}
                                  alt={item.nombre}
                                  className="w-20 h-20 object-cover rounded-lg hover:opacity-80 transition-opacity"
                                />
                              </div>
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h2 className="font-semibold text-lg truncate">{item.nombre}</h2>
                                {(isCosasGratis || item.is_free) && (
                                  <Badge className="bg-green-500 text-white flex-shrink-0">¡Gratis!</Badge>
                                )}
                              </div>
                              
                              {item.descripcion && (
                                <p className="text-muted-foreground text-sm line-clamp-2 mt-1">
                                  {item.descripcion}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                {!item.is_free && (
                                  <Badge variant="secondary">${item.precio}</Badge>
                                )}
                                {!item.is_listing && (
                                  <Badge variant="outline">Stock: {item.stock}</Badge>
                                )}
                              </div>

                              {item.proveedores && (
                                <p className="text-sm text-muted-foreground mt-2">
                                  <MapPin className="w-3 h-3 inline mr-1" />
                                  {item.proveedores.nombre}
                                </p>
                              )}
                              {item.profiles && (
                                <p className="text-sm text-muted-foreground mt-2">
                                  <MapPin className="w-3 h-3 inline mr-1" />
                                  {item.profiles.nombre}
                                </p>
                              )}

                              {/* Date info for free items */}
                              {item.is_listing && item.created_at && (
                                <div className="flex flex-col gap-1 mt-2 text-xs text-muted-foreground">
                                  <span>
                                    Publicado: {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                                  </span>
                                  {item.expires_at && (
                                    <span className="flex items-center gap-1 text-orange-500">
                                      <Clock className="w-3 h-3" />
                                      Expira: {format(new Date(item.expires_at), "dd/MM/yyyy HH:mm", { locale: es })} ({formatDistanceToNow(new Date(item.expires_at), { locale: es, addSuffix: true })})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </section>
            )}
          </>
        )}
      </main>

      <NavigationBar />

      {/* Lightbox Dialog */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/90 border-none">
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-2 right-2 z-50 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
          >
            <X className="h-6 w-6" />
          </button>
          {lightboxImage && (
            <img
              src={lightboxImage}
              alt="Imagen ampliada"
              className="w-full h-full object-contain max-h-[90vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductSearch;
