import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.85760625b6da43c890e2846dd01fbbe3',
  appName: 'todocerca',
  webDir: 'dist',
  server: {
    url: 'https://85760625-b6da-43c8-90e2-846dd01fbbe3.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    Geolocation: {
      permissions: ['location', 'coarseLocation']
    },
    BackgroundRunner: {
      label: 'com.todocerca.background.tracking',
      src: 'background.js',
      event: 'trackingUpdate',
      repeat: true,
      interval: 30,
      autoStart: false
    }
  }
};

export default config;
