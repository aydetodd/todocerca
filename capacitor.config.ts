import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.todocerca.app',
  appName: 'TodoCerca',
  webDir: 'dist',
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
