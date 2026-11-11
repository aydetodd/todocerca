import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.p85760625b6da43c890e2846dd01fbbe3',
  appName: 'todocerca',
  webDir: 'dist',
  // Remote preview is for development only. Bundled builds must boot locally.
  ...(process.env.CAPACITOR_BUNDLED === '1' ? {} : {
    server: {
      url: 'https://85760625-b6da-43c8-90e2-846dd01fbbe3.lovableproject.com?forceHideBadge=true',
      cleartext: true,
    },
  }),
  plugins: {
    Geolocation: {
      permissions: ['location', 'coarseLocation']
    },
    BackgroundGeolocation: {
      requestPermissions: true,
      backgroundMessage: "Compartiendo tu ubicación",
      backgroundTitle: "TodoCerca - Ubicación Activa"
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#FFFFFF",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    }
  },
  android: {
    backgroundColor: "#FFFFFF"
  }
};

export default config;
