import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Landmark } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function QardRecargar() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-background pb-40">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => nav("/qard")} aria-label="Volver">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">Recargar por transferencia</h1>
        </div>
        <Card className="p-4 flex gap-3 items-start">
          <Landmark className="h-5 w-5 text-primary shrink-0" />
          <div className="text-sm text-muted-foreground">
            Las recargas por transferencia (SPEI) aún no están disponibles. Muy pronto podrás recargar tu QaRd desde tu banco.
          </div>
        </Card>
      </div>
    </div>
  );
}
