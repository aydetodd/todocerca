interface BrandIconProps {
  className?: string;
}

/** Icono oficial de TodoCerca (pin con bolsa sobre fondo blanco). */
export const BrandIcon = ({ className = "h-8 w-8" }: BrandIconProps) => (
  <img
    src="/icon-512.png"
    alt="TodoCerca"
    className={`${className} rounded-full object-cover bg-white shadow-[var(--shadow-card)]`}
    loading="eager"
  />
);

export default BrandIcon;
