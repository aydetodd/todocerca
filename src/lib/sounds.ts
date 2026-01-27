// Sistema unificado de sonidos para notificaciones
// Usa Web Speech API para voz y Web Audio API para alertas

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

// ============= SISTEMA DE VOZ =============

/**
 * Reproduce un mensaje con voz de mujer en español
 */
const speakMessage = (message: string) => {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis no soportado');
    return;
  }

  // Cancelar cualquier mensaje anterior
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = 'es-MX';
  utterance.rate = 1.0;
  utterance.pitch = 1.1;
  utterance.volume = 1.0;

  // Buscar voz femenina en español
  const setVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const spanishFemaleVoice = voices.find(
      v => (v.lang.startsWith('es') && v.name.toLowerCase().includes('female')) ||
           (v.lang.startsWith('es') && v.name.toLowerCase().includes('mujer')) ||
           (v.lang.startsWith('es') && v.name.includes('Paulina')) ||
           (v.lang.startsWith('es') && v.name.includes('Monica')) ||
           (v.lang.startsWith('es') && v.name.includes('Francisca')) ||
           (v.lang === 'es-MX')
    ) || voices.find(v => v.lang.startsWith('es'));
    
    if (spanishFemaleVoice) {
      utterance.voice = spanishFemaleVoice;
    }
    
    window.speechSynthesis.speak(utterance);
  };

  // Las voces pueden tardar en cargar
  if (window.speechSynthesis.getVoices().length > 0) {
    setVoice();
  } else {
    window.speechSynthesis.onvoiceschanged = setVoice;
  }
};

// Pequeño beep de atención antes del mensaje
const playAttentionBeep = () => {
  try {
    const ctx = getAudioContext();
    playTone(ctx, 880, 0, 0.1, 'sine', 0.4);
    playTone(ctx, 1100, 0.12, 0.1, 'sine', 0.4);
  } catch (error) {
    console.error('Error en beep:', error);
  }
};

/**
 * 🔔 Sonido para MENSAJES recibidos
 */
export const playMessageSound = () => {
  try {
    playAttentionBeep();
    setTimeout(() => {
      speakMessage('Tienes un nuevo mensaje en todocerca punto mx');
    }, 300);
  } catch (error) {
    console.error('Error reproduciendo sonido de mensaje:', error);
  }
};

/**
 * 🛒 Sonido para PEDIDOS/APARTADOS nuevos
 */
export const playOrderSound = () => {
  try {
    playAttentionBeep();
    setTimeout(() => {
      speakMessage('Tienes un nuevo pedido en todocerca punto mx');
    }, 300);

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
 */
export const playAppointmentSound = () => {
  try {
    playAttentionBeep();
    setTimeout(() => {
      speakMessage('Tienes una nueva cita en todocerca punto mx');
    }, 300);

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
 */
export const playTaxiAlertSound = () => {
  try {
    playAttentionBeep();
    setTimeout(() => {
      speakMessage('Tienes una nueva solicitud de taxi en todocerca punto mx');
    }, 300);

    // Vibración
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  } catch (error) {
    console.error('Error reproduciendo sonido de taxi:', error);
  }
};

/**
 * 🆘 Sonido para emergencias SOS
 * Sirena tipo alarma + voz
 */
export const playSirenSound = () => {
  try {
    const ctx = getAudioContext();
    const currentTime = ctx.currentTime;

    // Crear sonido de sirena tipo alarma de emergencia
    const createSirenOscillator = (startFreq: number, endFreq: number, startTime: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(startFreq, currentTime + startTime);
      oscillator.frequency.linearRampToValueAtTime(endFreq, currentTime + startTime + duration);

      gainNode.gain.setValueAtTime(0.8, currentTime + startTime);
      gainNode.gain.setValueAtTime(0.8, currentTime + startTime + duration - 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + startTime + duration);

      oscillator.start(currentTime + startTime);
      oscillator.stop(currentTime + startTime + duration);
    };

    // Patrón de sirena: subida y bajada rápida
    createSirenOscillator(400, 1200, 0, 0.3);
    createSirenOscillator(1200, 400, 0.3, 0.3);
    
    // Mensaje de voz después de la sirena
    setTimeout(() => {
      speakMessage('¡Alerta! Tienes un llamado de auxilio en todocerca punto mx');
    }, 700);

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
 */
export const playClientRegistrationSound = () => {
  try {
    playAttentionBeep();
    setTimeout(() => {
      speakMessage('Nuevo cliente registrado en todocerca punto mx');
    }, 300);
  } catch (error) {
    console.error('Error reproduciendo sonido de registro cliente:', error);
  }
};

/**
 * 🚕 Sonido para registro de PROVEEDOR
 */
export const playProviderRegistrationSound = () => {
  try {
    playAttentionBeep();
    setTimeout(() => {
      speakMessage('Nuevo proveedor registrado en todocerca punto mx');
    }, 300);
  } catch (error) {
    console.error('Error reproduciendo sonido de registro proveedor:', error);
  }
};

// ============= LOOP DE ALARMAS =============

let alertLoopInterval: NodeJS.Timeout | null = null;
let alertLoopVibrate: NodeJS.Timeout | null = null;

/**
 * Iniciar loop de alerta para taxi (suena cada 3s para dar tiempo a la voz)
 */
export const startTaxiAlertLoop = () => {
  if (alertLoopInterval) return; // Ya está activo

  playTaxiAlertSound();
  alertLoopInterval = setInterval(() => {
    playTaxiAlertSound();
  }, 4000);
};

/**
 * Iniciar loop de sirena SOS (suena cada 4s para dar tiempo a la voz)
 */
export const startSOSAlertLoop = () => {
  if (alertLoopInterval) return;

  playSirenSound();
  alertLoopInterval = setInterval(() => {
    playSirenSound();
  }, 5000);

  // Vibración continua
  alertLoopVibrate = setInterval(() => {
    if ('vibrate' in navigator) {
      const sosPattern = [300, 100, 300, 100, 300, 300, 600, 100, 600, 100, 600, 300, 300, 100, 300, 100, 300];
      navigator.vibrate(sosPattern);
    }
  }, 4000);
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
  // Detener cualquier voz en curso
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};
