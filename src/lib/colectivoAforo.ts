import type L from 'leaflet';

/** Only manages the occupancy tooltip; never removes unrelated route labels. */
export function applyColectivoAforo(marker: L.Marker, value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    if (marker.getTooltip()?.options.className === 'aforo-tooltip') marker.unbindTooltip();
    return;
  }
  const occupied = Math.max(0, Math.min(4, Math.trunc(value)));
  const free = 4 - occupied;
  const content = occupied === 4
    ? '<span class="aforo-full">LLENO · 4/4</span>'
    : `<strong>${occupied}/4</strong> · cabe${free === 1 ? '' : 'n'} ${free}`;
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