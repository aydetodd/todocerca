import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export const isNativeApp = () => Capacitor.isNativePlatform();

export const requestLocationPermissions = async () => {
  if (!isNativeApp()) return true;
  
  try {
    const status = await Geolocation.checkPermissions();
    
    if (status.location === 'granted' || status.coarseLocation === 'granted') {
      return true;
    }
    
    const permissionRequest = await Geolocation.requestPermissions({
      permissions: ['location', 'coarseLocation']
    });
    
    return permissionRequest.location === 'granted' || 
           permissionRequest.coarseLocation === 'granted';
  } catch (error) {
    console.error('Error requesting location permissions:', error);
    return false;
  }
};

export const getCurrentPosition = async () => {
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      throw new Error('Location permission denied');
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp
    };
  } catch (error) {
    console.error('Error getting current position:', error);
    throw error;
  }
};

export const watchPosition = async (callback: (position: any) => void) => {
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      throw new Error('Location permission denied');
    }

    const watchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      },
      (position, err) => {
        if (err) {
          console.error('Watch position error:', err);
          return;
        }
        if (position) {
          callback({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          });
        }
      }
    );

    return watchId;
  } catch (error) {
    console.error('Error watching position:', error);
    throw error;
  }
};

export const clearWatch = async (watchId: string) => {
  try {
    await Geolocation.clearWatch({ id: watchId });
  } catch (error) {
    console.error('Error clearing watch:', error);
  }
};
