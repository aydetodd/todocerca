import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// La compra de QR fijos de $9 fue retirada.
// Ahora todo se maneja como Saldo QR (Wallet Familiar): cuenta eje + sub-QR.
export default function QrBoletos() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/wallet/familiar", { replace: true });
  }, [navigate]);
  return null;
}
