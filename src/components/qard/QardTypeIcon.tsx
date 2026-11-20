import { ShoppingBasket, Fuel, BriefcaseMedical, NotebookPen, Ruler, PiggyBank, Coins, Wallet, Building2, Users, ShoppingCart } from 'lucide-react';

export default function QardTypeIcon({ index, pocket = false }: { index?: number; pocket?: boolean }) {
  if (pocket || index === 10) return <span className="inline-flex items-end" aria-label="Alcancía con moneda"><PiggyBank className="h-6 w-6" /><Coins className="h-3 w-3" /></span>;
  if (index === 6) return <span className="inline-flex items-end" aria-label="Cuaderno y escuadra"><NotebookPen className="h-6 w-6" /><Ruler className="h-4 w-4" /></span>;
  const Icon = index === 0 ? Wallet : index === 1 ? Building2 : index === 2 ? ShoppingBasket : index === 3 ? ShoppingCart : index === 4 ? Fuel : index === 5 ? BriefcaseMedical : Users;
  return <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />;
}