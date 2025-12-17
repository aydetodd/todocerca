// ProductSearch
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search as SearchIcon, MapPin } from "lucide-react";
import { GlobalHeader } from "@/components/GlobalHeader";
import { NavigationBar } from "@/components/NavigationBar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Estados de México con algunos municipios principales
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

const MUNICIPIOS: Record<string, string[]> = {
  Sonora: [
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
  "Nuevo León": [
    "Monterrey",
    "San Pedro Garza García",
    "Guadalupe",
    "San Nicolás",
    "Apodaca",
  ],
  "Ciudad de México": [
    "Benito Juárez",
    "Coyoacán",
    "Miguel Hidalgo",
    "Cuauhtémoc",
    "Álvaro Obregón",
  ],
};

const RUTAS_TRANSPORTE = Array.from({ length: 50 }, (_, i) => `Ruta ${i + 1}`);

type SearchCategory = "taxi" | "rutas" | "cosas_gratis";

const ProductSearch = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [loading, setLoading] = useState(false);

  const [searchCategory, setSearchCategory] = useState<SearchCategory>("taxi");
  const [selectedRuta, setSelectedRuta] = useState<string>("Ruta 1");

  const [searchEstado, setSearchEstado] = useState<string>("Sonora");
  const ALL_MUNICIPIOS_VALUE = "__ALL__";
  const [searchCiudad, setSearchCiudad] = useState<string>("Ciudad Obregón");

  const [taxiCategoryId, setTaxiCategoryId] = useState<string | null>(null);
  const [rutasCategoryId, setRutasCategoryId] = useState<string | null>(null);
  const [cosasGratisCategoryId, setCosasGratisCategoryId] = useState<string | null>(null);

  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    // SEO basics
    document.title = "Buscar taxi, rutas y cosas gratis | TodoCerca";

    const meta = document.querySelector('meta[name="description"]');
    meta?.setAttribute(
      "content",
      "Busca taxi, rutas y cosas gratis por estado y municipio en TodoCerca."
    );

    const canonicalHref = `${window.location.origin}/search`;
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalHref;

    let cancelled = false;

    const loadCategoryIds = async () => {
      try {
        const { data, error } = await supabase
          .from("product_categories")
          .select("id, name")
          .in("name", ["Taxi", "Rutas de Transporte", "Cosas gratis"]);

        if (error) throw error;
        if (cancelled) return;

        setTaxiCategoryId(data?.find((c) => c.name === "Taxi")?.id ?? null);
        setRutasCategoryId(data?.find((c) => c.name === "Rutas de Transporte")?.id ?? null);
        setCosasGratisCategoryId(data?.find((c) => c.name === "Cosas gratis")?.id ?? null);
      } catch (err) {
        console.error("[ProductSearch] Error loading category IDs:", err);
      }
    };

    loadCategoryIds();
    return () => {
      cancelled = true;
    };
  }, []);

  const ciudadesDisponibles = useMemo(
    () => MUNICIPIOS[searchEstado] || [],
    [searchEstado]
  );

  const categoryIdByCategory = useMemo(() => {
    if (searchCategory === "taxi") return taxiCategoryId;
    if (searchCategory === "rutas") return rutasCategoryId;
    return cosasGratisCategoryId;
  }, [cosasGratisCategoryId, rutasCategoryId, searchCategory, taxiCategoryId]);

  const handleSearch = async (e?: FormEvent, opts?: { category?: SearchCategory }) => {
    e?.preventDefault();
    const category = opts?.category ?? searchCategory;

    setLoading(true);
    setHasSearched(true);

    try {
      let query = supabase
        .from("productos")
        .select(
          `
            id, nombre, descripcion, precio, stock, unit, proveedor_id,
            proveedores (id, nombre, telefono, business_address)
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
      const activeCategoryId =
        category === "taxi"
          ? taxiCategoryId
          : category === "rutas"
            ? rutasCategoryId
            : cosasGratisCategoryId;

      if (activeCategoryId) {
        query = query.eq("category_id", activeCategoryId);
      }

      // Route filter (when searching routes)
      if (category === "rutas" && selectedRuta) {
        query = query.eq("nombre", selectedRuta);
      }

      // Keyword search
      if (searchTerm.trim()) {
        query = query.or(`nombre.ilike.%${searchTerm}%,keywords.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query.limit(50);

      if (error) {
        console.error("[ProductSearch] Error searching:", error);
        setResults([]);
      } else {
        setResults(data || []);
      }
    } catch (err) {
      console.error("[ProductSearch] Error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const setCategoryAndSearch = (category: SearchCategory) => {
    setSearchCategory(category);
    // Dispara búsqueda inmediatamente para que se sienta como “categorías” reales
    void handleSearch(undefined, { category });
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />

      <main className="container mx-auto px-4 py-8 pb-24">
        <header className="mb-4">
          <h1 className="text-3xl font-bold">Buscar taxi, rutas y cosas gratis</h1>
        </header>

        <section aria-label="Categorías" className="mb-4">
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant={searchCategory === "taxi" ? "default" : "outline"}
              className="h-12"
              aria-pressed={searchCategory === "taxi"}
              onClick={() => setCategoryAndSearch("taxi")}
            >
              Taxi
            </Button>

            <Button
              type="button"
              variant={searchCategory === "rutas" ? "default" : "outline"}
              className="h-12"
              aria-pressed={searchCategory === "rutas"}
              onClick={() => setCategoryAndSearch("rutas")}
            >
              Rutas
            </Button>

            <Button
              type="button"
              variant={searchCategory === "cosas_gratis" ? "default" : "outline"}
              className="h-12"
              aria-pressed={searchCategory === "cosas_gratis"}
              onClick={() => setCategoryAndSearch("cosas_gratis")}
            >
              Cosas gratis
            </Button>
          </div>

          {/* Indicador sutil si aún no cargaron IDs */}
          {!categoryIdByCategory && (
            <p className="mt-2 text-sm text-muted-foreground">
              Cargando catálogo de categorías…
            </p>
          )}
        </section>

        {searchCategory === "rutas" && (
          <section aria-label="Ruta" className="mb-4">
            <div className="p-4 bg-muted/50 rounded-lg border border-border">
              <span className="text-sm text-muted-foreground mb-1 block">Ruta:</span>
              <Select value={selectedRuta} onValueChange={setSelectedRuta}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona ruta" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {RUTAS_TRANSPORTE.map((ruta) => (
                    <SelectItem key={ruta} value={ruta}>
                      {ruta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>
        )}

        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-4">
            <Input
              type="text"
              placeholder={
                searchCategory === "rutas"
                  ? "Buscar por palabra (opcional)…"
                  : "Buscar productos o servicios…"
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-12"
            />
            <Button type="submit" disabled={loading} className="h-12">
              <SearchIcon className="w-4 h-4 mr-2" />
              {loading ? "Buscando…" : "Buscar"}
            </Button>
          </div>
        </form>

        <section aria-label="Ubicación" className="mb-4 p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <span className="text-sm text-muted-foreground mb-1 block">Estado:</span>
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

            <div className="flex-1">
              <span className="text-sm text-muted-foreground mb-1 block">Municipio:</span>
              <Select value={searchCiudad} onValueChange={setSearchCiudad}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona municipio" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value={ALL_MUNICIPIOS_VALUE}>Todos</SelectItem>
                  {ciudadesDisponibles.map((ciudad) => (
                    <SelectItem key={ciudad} value={ciudad}>
                      {ciudad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {hasSearched && (
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

                      {searchCategory === "cosas_gratis" && (
                        <Badge variant="secondary">¡Gratis!</Badge>
                      )}
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
      </main>

      <NavigationBar />
    </div>
  );
};

export default ProductSearch;

