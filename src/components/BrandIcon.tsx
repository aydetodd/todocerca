import logoAsset from "@/assets/todocerca-logo.jpeg.asset.json";

interface BrandIconProps {
  className?: string;
}

/** Icono oficial de TodoCerca (mismo logotipo que la tarjeta QaRd). */
export const BrandIcon = ({ className = "h-8 w-8" }: BrandIconProps) => (
  <img
    src={logoAsset.url}
    alt="TodoCerca"
    className={`${className} rounded-full object-cover bg-white shadow-[var(--shadow-card)]`}
    loading="eager"
  />
);

export default BrandIcon;
