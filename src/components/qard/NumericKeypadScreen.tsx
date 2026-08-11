import { Button } from "@/components/ui/button";
import { X, Delete } from "lucide-react";

interface NumericKeypadScreenProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  value: string;
  onChange: (value: string) => void;
  title?: string;
  subtitle?: string;
  maxLength?: number;
}

export function NumericKeypadScreen({
  open,
  onClose,
  onSubmit,
  value,
  onChange,
  title = "Ingresa el CVV",
  subtitle,
  maxLength = 4,
}: NumericKeypadScreenProps) {
  if (!open) return null;

  const addDigit = (digit: string) => {
    if (value.length < maxLength) {
      onChange(value + digit);
    }
  };

  const backspace = () => {
    onChange(value.slice(0, -1));
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
          <X className="h-6 w-6" />
        </Button>
      </div>

      {subtitle && (
        <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
      )}

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex items-center gap-3 mb-8" aria-live="polite">
          {Array.from({ length: maxLength }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-colors ${
                i < value.length ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
          {keys.map((key) => (
            <Button
              key={key}
              variant="outline"
              size="lg"
              className="h-16 text-2xl font-medium"
              onClick={() => addDigit(key)}
            >
              {key}
            </Button>
          ))}

          <Button
            variant="secondary"
            size="lg"
            className="h-16 text-lg font-medium"
            onClick={backspace}
            disabled={value.length === 0}
            aria-label="Borrar"
          >
            <Delete className="h-6 w-6" />
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="h-16 text-2xl font-medium"
            onClick={() => addDigit("0")}
          >
            0
          </Button>

          <Button
            variant="default"
            size="lg"
            className="h-16 text-lg font-semibold"
            onClick={onSubmit}
            disabled={value.length === 0}
          >
            Enter
          </Button>
        </div>
      </div>
    </div>
  );
}
