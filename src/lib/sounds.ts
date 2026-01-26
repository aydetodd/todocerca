// Sistema unificado de sonidos para notificaciones
// Todos los sonidos usan Web Audio API para funcionar con pantalla apagada

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
};

// Helper para crear tonos
const playTone = (
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.5
) => {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = type;

  gainNode.gain.setValueAtTime(volume, ctx.currentTime + startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);

  oscillator.start(ctx.currentTime + startTime);
  oscillator.stop(ctx.currentTime + startTime + duration);
};

/**
 * 🔔 Sonido para MENSAJES recibidos
 * Ding-dong fuerte y claro
 */
export const playMessageSound = () => {
  try {
    const ctx = getAudioContext();
    // Ding-dong clásico
    playTone(ctx, 830, 0, 0.15, 'sine', 0.8);      // Ding
    playTone(ctx, 660, 0.18, 0.25, 'sine', 0.7);   // Dong
  } catch (error) {
    console.error('Error reproduciendo sonido de mensaje:', error);
  }
};

/**
 * 🛒 Sonido para PEDIDOS/APARTADOS nuevos
 * Secuencia alegre tipo "caja registradora"
 */
export const playOrderSound = () => {
  try {
    const ctx = getAudioContext();
    // Secuencia alegre de 4 tonos
    playTone(ctx, 523, 0, 0.1, 'square', 0.5);     // C5
    playTone(ctx, 659, 0.12, 0.1, 'square', 0.5);  // E5
    playTone(ctx, 784, 0.24, 0.1, 'square', 0.5);  // G5
    playTone(ctx, 1047, 0.36, 0.2, 'square', 0.6); // C6

    // Vibración corta
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch (error) {
    console.error('Error reproduciendo sonido de pedido:', error);
  }
};

/**
 * 📅 Sonido para CITAS nuevas
 * Campanita clara y elegante
 */
export const playAppointmentSound = () => {
  try {
    const ctx = getAudioContext();
    // Campanita elegante - más fuerte que antes
    playTone(ctx, 880, 0, 0.12, 'sine', 0.7);      // A5
    playTone(ctx, 1109, 0.15, 0.12, 'sine', 0.6);  // C#6
    playTone(ctx, 1319, 0.30, 0.15, 'sine', 0.7);  // E6

    // Vibración corta
    if ('vibrate' in navigator) {
      navigator.vibrate([150, 100, 150]);
    }
  } catch (error) {
    console.error('Error reproduciendo sonido de cita:', error);
  }
};

/**
 * 🚕 Sonido para solicitudes de TAXI
 * Alerta urgente tipo sirena - más agresiva
 */
export const playTaxiAlertSound = () => {
  try {
    const ctx = getAudioContext();
    // Sirena urgente alternando frecuencias
    playTone(ctx, 800, 0, 0.15, 'square', 0.6);
    playTone(ctx, 1000, 0.15, 0.15, 'square', 0.6);
    playTone(ctx, 800, 0.30, 0.15, 'square', 0.6);
    playTone(ctx, 1000, 0.45, 0.15, 'square', 0.6);
    playTone(ctx, 800, 0.60, 0.15, 'square', 0.6);
    playTone(ctx, 1000, 0.75, 0.15, 'square', 0.6);

    // Vibración SOS-like
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  } catch (error) {
    console.error('Error reproduciendo sonido de taxi:', error);
  }
};

/**
 * 🆘 Sonido para emergencias SOS
 * Sirena tipo alarma de incendio/sismo - MUY FUERTE
 */
export const playSirenSound = () => {
  try {
    const ctx = getAudioContext();
    const currentTime = ctx.currentTime;

    // Crear sonido de sirena tipo alarma de incendio
    const createSirenOscillator = (startFreq: number, endFreq: number, startTime: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(startFreq, currentTime + startTime);
      oscillator.frequency.linearRampToValueAtTime(endFreq, currentTime + startTime + duration);

      gainNode.gain.setValueAtTime(1.0, currentTime + startTime);
      gainNode.gain.setValueAtTime(1.0, currentTime + startTime + duration - 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + startTime + duration);

      oscillator.start(currentTime + startTime);
      oscillator.stop(currentTime + startTime + duration);
    };

    // Patrón de sirena: subida y bajada rápida
    createSirenOscillator(400, 1200, 0, 0.3);
    createSirenOscillator(1200, 400, 0.3, 0.3);
    createSirenOscillator(400, 1200, 0.6, 0.3);
    createSirenOscillator(1200, 400, 0.9, 0.3);

    // Vibración SOS Morse
    if ('vibrate' in navigator) {
      const sosPattern = [300, 100, 300, 100, 300, 300, 600, 100, 600, 100, 600, 300, 300, 100, 300, 100, 300];
      navigator.vibrate(sosPattern);
    }
  } catch (error) {
    console.error('Error reproduciendo sirena SOS:', error);
  }
};

/**
 * 👤 Sonido para registro de CLIENTE
 * Un beep corto alto
 */
export const playClientRegistrationSound = () => {
  try {
    const ctx = getAudioContext();
    playTone(ctx, 800, 0, 0.2, 'sine', 0.5);
  } catch (error) {
    console.error('Error reproduciendo sonido de registro cliente:', error);
  }
};

/**
 * 🚕 Sonido para registro de PROVEEDOR
 * Dos beeps más largos y bajos
 */
export const playProviderRegistrationSound = () => {
  try {
    const ctx = getAudioContext();
    playTone(ctx, 500, 0, 0.3, 'sine', 0.5);
    playTone(ctx, 500, 0.4, 0.3, 'sine', 0.5);
  } catch (error) {
    console.error('Error reproduciendo sonido de registro proveedor:', error);
  }
};

// ============= LOOP DE ALARMAS =============

let alertLoopInterval: NodeJS.Timeout | null = null;
let alertLoopVibrate: NodeJS.Timeout | null = null;

/**
 * Iniciar loop de alerta para taxi (suena cada 1.5s)
 */
export const startTaxiAlertLoop = () => {
  if (alertLoopInterval) return; // Ya está activo

  playTaxiAlertSound();
  alertLoopInterval = setInterval(() => {
    playTaxiAlertSound();
  }, 1500);
};

/**
 * Iniciar loop de sirena SOS (suena cada 1.2s)
 */
export const startSOSAlertLoop = () => {
  if (alertLoopInterval) return;

  playSirenSound();
  alertLoopInterval = setInterval(() => {
    playSirenSound();
  }, 1200);

  // Vibración continua
  alertLoopVibrate = setInterval(() => {
    if ('vibrate' in navigator) {
      const sosPattern = [300, 100, 300, 100, 300, 300, 600, 100, 600, 100, 600, 300, 300, 100, 300, 100, 300];
      navigator.vibrate(sosPattern);
    }
  }, 3000);
};

/**
 * Detener cualquier loop de alerta activo
 */
export const stopAlertLoop = () => {
  if (alertLoopInterval) {
    clearInterval(alertLoopInterval);
    alertLoopInterval = null;
  }
  if (alertLoopVibrate) {
    clearInterval(alertLoopVibrate);
    alertLoopVibrate = null;
  }
  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }
};
