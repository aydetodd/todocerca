import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.todocerca.app',
  appName: 'todocerca',
  webDir: 'dist',
  server: {
    url: 'https://85760625-b6da-43c8-90e2-846dd01fbbe3.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    Geolocation: {
      permissions: ['location', 'coarseLocation']
    }
  }
};

export default config;
