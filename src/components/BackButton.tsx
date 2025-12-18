import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const BackButton = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    const idx = (window.history.state && (window.history.state as any).idx) ?? 0;
    if (typeof idx === "number" && idx > 0) navigate(-1);
    else navigate("/dashboard");
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleBack}
      className="shrink-0"
      aria-label="Regresar"
    >
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );
};
