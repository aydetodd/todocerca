import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search as SearchIcon, MapPin, Map, List } from "lucide-react";
import { GlobalHeader } from "@/components/GlobalHeader";
import { NavigationBar } from "@/components/NavigationBar";

interface Category {
  id: string;
  name: string;
}

const ProductSearch = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  useEffect(() => {
    document.title = "Buscar Productos y Servicios | TodoCerca";

    const meta = document.querySelector('meta[name="description"]');
    meta?.setAttribute(
      "content",
      "Busca productos, servicios, taxi, rutas y cosas gratis en TodoCerca."
    );

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
            id, nombre, descripcion, precio, stock, unit, proveedor_id, category_id,
            proveedores (id, nombre, telefono, business_address)
          `
        )
        .eq("is_available", true)
        .gte("stock", 1);

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

  const handleCategoryClick = (categoryId: string) => {
    const newSelected = selectedCategoryId === categoryId ? null : categoryId;
    setSelectedCategoryId(newSelected);
  };

  const selectedCategoryName = categories.find(c => c.id === selectedCategoryId)?.name;
  const isCosasGratis = selectedCategoryName?.toLowerCase().includes("gratis");

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />

      <main className="container mx-auto px-4 py-8 pb-24">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">Buscar Productos y Servicios</h1>
        </header>

        <form onSubmit={handleSearch} className="mb-6">
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
                <Map className="w-4 h-4 mr-2" />
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

                        {isCosasGratis && (
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
          </>
        )}
      </main>

      <NavigationBar />
    </div>
  );
};

export default ProductSearch;
