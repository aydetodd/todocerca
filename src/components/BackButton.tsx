import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const BackButton = () => {
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate(-1)}
      className="shrink-0"
      aria-label="Regresar"
    >
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );
};
