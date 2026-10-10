import type L from 'leaflet';
import type { AforoColectivo } from '@/hooks/useColectivoAforo';

/** Only manages the occupancy tooltip; never removes unrelated route labels. */
export function applyColectivoAforo(marker: L.Marker, value: AforoColectivo | undefined) {
  if (!value || !Number.isFinite(value.n)) {
    if (marker.getTooltip()?.options.className === 'aforo-tooltip') marker.unbindTooltip();
    return;
  }
  const cap = Math.max(1, Math.trunc(value.cap || 4));
  const occupied = Math.max(0, Math.min(cap, Math.trunc(value.n)));
  const free = cap - occupied;
  const content = occupied === cap
    ? `<span class="aforo-full">LLENO · ${cap}/${cap}</span>`
    : `<strong>${occupied}/${cap}</strong> · cabe${free === 1 ? '' : 'n'} ${free}`;
  if (marker.getTooltip()?.options.className === 'aforo-tooltip') {
    marker.setTooltipContent(content);
  } else {
    marker.bindTooltip(content, {
      permanent: true,
      direction: 'top',
      offset: [0, -22],
      className: 'aforo-tooltip',
      opacity: 1,
    });
  }
}
