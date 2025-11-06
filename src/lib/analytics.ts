// Google Analytics 4 event tracking utilities

declare global {
  interface Window {
    gtag?: (command: string, ...args: any[]) => void;
  }
}

/**
 * Track custom events in Google Analytics 4
 */
export const trackEvent = (eventName: string, eventParams?: Record<string, any>) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, eventParams);
  }
};

/**
 * Track GPS subscription events
 */
export const trackGPSSubscription = (status: 'started' | 'completed' | 'cancelled', value?: number) => {
  trackEvent('gps_subscription', {
    subscription_status: status,
    value: value || 0,
    currency: 'MXN',
  });
};

/**
 * Track provider registration
 */
export const trackProviderRegistration = (step: 'started' | 'completed', category?: string) => {
  trackEvent('provider_registration', {
    registration_step: step,
    category: category || 'unknown',
  });
};

/**
 * Track product searches
 */
export const trackProductSearch = (searchTerm: string, resultsCount?: number) => {
  trackEvent('search', {
    search_term: searchTerm,
    results_count: resultsCount || 0,
  });
};

/**
 * Track page views manually (for SPA navigation)
 */
export const trackPageView = (pagePath: string, pageTitle: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', 'G-4V2SKLDLJF', {
      page_path: pagePath,
      page_title: pageTitle,
    });
  }
};

/**
 * Track conversions (provider upgrades, subscriptions)
 */
export const trackConversion = (type: 'provider_upgrade' | 'gps_subscription', value: number) => {
  trackEvent('conversion', {
    conversion_type: type,
    value: value,
    currency: 'MXN',
  });
};

/**
 * Track user engagement with messaging
 */
export const trackMessaging = (action: 'opened' | 'sent' | 'received') => {
  trackEvent('messaging', {
    action: action,
  });
};

/**
 * Track map interactions
 */
export const trackMapInteraction = (action: 'view' | 'search' | 'provider_click') => {
  trackEvent('map_interaction', {
    action: action,
  });
};
