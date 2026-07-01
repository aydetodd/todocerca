import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Wallet Familiar retirada. Ahora todo se maneja como QaRd (número único de 16 dígitos).
export default function WalletFamiliar() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/qard", { replace: true });
  }, [navigate]);
  return null;
}
