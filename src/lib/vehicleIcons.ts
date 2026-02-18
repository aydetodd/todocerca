/**
 * Centralized vehicle SVG icons for maps.
 * 
 * Color scheme:
 * - Público (urbana): White (#FFFFFF)
 * - Foráneo: Blue (#3B82F6)
 * - Privado: Yellow (#FDB813)
 * - Taxi disponible: Green (#22c55e)
 * - Taxi ocupado: Yellow (#FDB813)
 */

// ── Taxi sedan SVG (elegant, realistic top-down sedan) ──────────────────

export const getTaxiSvg = (color: { body: string; stroke: string }, label?: string) => `
  <svg width="18" height="40" viewBox="0 0 36 80" xmlns="http://www.w3.org/2000/svg">
    <!-- Shadow -->
    <ellipse cx="18" cy="76" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>

    <!-- Rear wheels -->
    <ellipse cx="6" cy="62" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
    <ellipse cx="6" cy="62" rx="2" ry="3" fill="#4a4a4a"/>
    <ellipse cx="30" cy="62" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
    <ellipse cx="30" cy="62" rx="2" ry="3" fill="#4a4a4a"/>

    <!-- Car body (sedan shape – narrower & shorter than bus) -->
    <rect x="7" y="10" width="22" height="58" rx="6" fill="#1a1a1a" stroke="#333" stroke-width="0.8"/>

    <!-- Front wheels -->
    <ellipse cx="6" cy="22" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
    <ellipse cx="6" cy="22" rx="2" ry="3" fill="#4a4a4a"/>
    <ellipse cx="30" cy="22" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
    <ellipse cx="30" cy="22" rx="2" ry="3" fill="#4a4a4a"/>

    <!-- Colored roof / hood -->
    <rect x="10" y="12" width="16" height="52" rx="4" fill="${color.body}" stroke="${color.stroke}" stroke-width="0.5"/>

    <!-- Front windshield (curved) -->
    <path d="M 12 14 Q 18 10 24 14 L 24 22 L 12 22 Z" fill="#87CEEB" opacity="0.85" stroke="#555" stroke-width="0.5"/>

    <!-- Rear window -->
    <path d="M 12 62 L 24 62 L 24 56 Q 18 58 12 56 Z" fill="#87CEEB" opacity="0.75" stroke="#555" stroke-width="0.5"/>

    <!-- Side windows (left) -->
    <rect x="7" y="24" width="3" height="8" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>
    <rect x="7" y="34" width="3" height="8" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>
    <rect x="7" y="44" width="3" height="8" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>

    <!-- Side windows (right) -->
    <rect x="26" y="24" width="3" height="8" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>
    <rect x="26" y="34" width="3" height="8" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>
    <rect x="26" y="44" width="3" height="8" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>

    <!-- Headlights -->
    <circle cx="12" cy="12" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
    <circle cx="24" cy="12" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>

    <!-- Taillights -->
    <rect x="11" y="64" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
    <rect x="22" y="64" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>

    <!-- Taxi sign on roof -->
    <rect x="13" y="30" width="10" height="5" rx="1.5" fill="#FFFFFF" stroke="#888" stroke-width="0.4"/>
    <text x="18" y="34" font-family="Arial, sans-serif" font-size="4" font-weight="700" fill="#333" text-anchor="middle">TAXI</text>

    <!-- Label on roof -->
    ${label ? `<text x="18" y="46" font-family="Arial, sans-serif" font-size="6" font-weight="700" fill="${color.body === '#22c55e' || color.body === '#FDB813' ? '#1a1a1a' : '#FFFFFF'}" text-anchor="middle">${label}</text>` : ''}
  </svg>
`;

// ── Taxi color presets ──────────────────────────────────────────────────

export const TAXI_COLORS = {
  available: { body: '#22c55e', stroke: '#16a34a' },   // Green
  busy: { body: '#FDB813', stroke: '#D4960A' },         // Yellow
  offline: { body: '#ef4444', stroke: '#dc2626' },       // Red
} as const;

/** Map a provider status string to taxi colors */
export const getTaxiColorByStatus = (status: string) =>
  TAXI_COLORS[status as keyof typeof TAXI_COLORS] || TAXI_COLORS.available;

// ── Small taxi SVG for UI panels (DriverProfilePanel, etc.) ────────────

export const getTaxiSmallSvg = (status: string = 'available') => {
  const color = getTaxiColorByStatus(status);
  return getTaxiSvg(color);
};
