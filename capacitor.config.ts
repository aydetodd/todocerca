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
    },
    BackgroundGeolocation: {
      requestPermissions: true,
      backgroundMessage: "Compartiendo tu ubicación",
      backgroundTitle: "TodoCerca - Ubicación Activa"
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1e3a5f",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    }
  },
  android: {
    backgroundColor: "#1e3a5f"
  }
};

export default config;
