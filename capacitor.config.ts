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
