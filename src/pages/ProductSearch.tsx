import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search as SearchIcon, MapPin, Map as MapIcon, List } from "lucide-react";
import { GlobalHeader } from "@/components/GlobalHeader";
import { NavigationBar } from "@/components/NavigationBar";
import ProvidersMapView from "@/components/ProvidersMapView";
import { StatusControl } from "@/components/StatusControl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

// Estados de México (lista corta para UI) + municipios principales
const ESTADOS_MEXICO = [
  "Aguascalientes",
  "Baja California",
  "Baja California Sur",
  "Campeche",
  "Chiapas",
  "Chihuahua",
  "Ciudad de México",
  "Coahuila",
  "Colima",
  "Durango",
  "Guanajuato",
  "Guerrero",
  "Hidalgo",
  "Jalisco",
  "México",
  "Michoacán",
  "Morelos",
  "Nayarit",
  "Nuevo León",
  "Oaxaca",
  "Puebla",
  "Querétaro",
  "Quintana Roo",
  "San Luis Potosí",
  "Sinaloa",
  "Sonora",
  "Tabasco",
  "Tamaulipas",
  "Tlaxcala",
  "Veracruz",
  "Yucatán",
  "Zacatecas",
];

const ALL_MUNICIPIOS_VALUE = "__ALL__";

const MUNICIPIOS: Record<string, string[]> = {
  Sonora: [
    "Cajeme",
    "Ciudad Obregón",
    "Hermosillo",
    "Nogales",
    "Guaymas",
    "Navojoa",
    "San Luis Río Colorado",
  ],
  Sinaloa: ["Culiacán", "Mazatlán", "Los Mochis", "Guasave", "Ahome"],
  Chihuahua: ["Chihuahua", "Ciudad Juárez", "Delicias", "Cuauhtémoc", "Parral"],
  "Baja California": ["Tijuana", "Mexicali", "Ensenada", "Tecate", "Rosarito"],
  Jalisco: ["Guadalajara", "Puerto Vallarta", "Zapopan", "Tlaquepaque", "Tonalá"],
  "Nuevo León": ["Monterrey", "San Pedro Garza García", "Guadalupe", "San Nicolás", "Apodaca"],
  "Ciudad de México": ["Benito Juárez", "Coyoacán", "Miguel Hidalgo", "Cuauhtémoc", "Álvaro Obregón"],
};

const ProductSearch = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [searchEstado, setSearchEstado] = useState<string>("Sonora");
  const [searchCiudad, setSearchCiudad] = useState<string>("Cajeme");

  const [results, setResults] = useState<any[]>([]);
  const [mapProviders, setMapProviders] = useState<MapProvider[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  const municipiosDisponibles = useMemo(
    () => MUNICIPIOS[searchEstado] || [],
    [searchEstado]
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
      let query = supabase
        .from("productos")
        .select(
          `
            id, nombre, descripcion, precio, stock, unit, proveedor_id, category_id, estado, ciudad,
            proveedores (
              id, nombre, user_id, telefono, business_address, business_phone, latitude, longitude
            )
          `
        )
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
                  {ESTADOS_MEXICO.map((estado) => (
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
                <div className="absolute top-4 left-4 z-10">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className="shadow-lg"
                  >
                    <List className="w-4 h-4 mr-2" />
                    Ver Listado
                  </Button>
                </div>
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                  <StatusControl />
                </div>
                <div className="absolute top-4 right-4 z-10">
                  <Badge variant="secondary" className="shadow-lg">
                    {mapProviders.length} proveedor{mapProviders.length !== 1 ? "es" : ""}
                  </Badge>
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
                  results.map((producto) => (
                    <Card key={producto.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="font-semibold text-lg truncate">{producto.nombre}</h2>
                            {producto.descripcion && (
                              <p className="text-muted-foreground text-sm line-clamp-2">
                                {producto.descripcion}
                              </p>
                            )}
                          </div>

                          {isCosasGratis && <Badge variant="secondary">¡Gratis!</Badge>}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="secondary">${producto.precio}</Badge>
                          <Badge variant="outline">Stock: {producto.stock}</Badge>
                        </div>

                        {producto.proveedores && (
                          <p className="text-sm text-muted-foreground mt-2">
                            <MapPin className="w-3 h-3 inline mr-1" />
                            {producto.proveedores.nombre}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </section>
            )}
          </>
        )}
      </main>

      <NavigationBar />
    </div>
  );
};

export default ProductSearch;
