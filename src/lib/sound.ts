let enabled = true;

export function setSoundEnabled(value: boolean) {
  enabled = value;
}

export function playTone(type: "turn" | "win" | "tap" | "error") {
  if (!enabled) {
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const map = {
    turn: [680, 0.09],
    win: [880, 0.18],
    tap: [420, 0.06],
    error: [180, 0.12]
  } as const;
  const [frequency, duration] = map[type];
  oscillator.frequency.value = frequency;
  oscillator.type = type === "win" ? "triangle" : "sine";
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
