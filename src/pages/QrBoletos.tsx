import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Boletos QR de $9 retirados. Ahora todo pasa por QaRd (saldo universal).
export default function QrBoletos() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/qard", { replace: true });
  }, [navigate]);
  return null;
}
