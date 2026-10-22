// Sonidos sintetizados: sin descargas, también disponibles en el HTML portable.
export function createSoundFeedback() {
  let context;
  let output;
  let shutterBuffer;
  let generation = 0;
  const voices = new Set();

  function stop() {
    generation++;
    for (const voice of voices) {
      try {
        voice.stop();
      } catch {}
    }
    voices.clear();
  }

  function tone(
    frequency,
    duration,
    volume,
    delay = 0,
    endFrequency = frequency,
  ) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      start + duration,
    );
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    envelope.gain.linearRampToValueAtTime(0, start + duration + 0.01);
    oscillator.connect(envelope).connect(output);
    voices.add(oscillator);
    oscillator.onended = () => {
      voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.015);
  }

  function shutter() {
    if (!shutterBuffer) {
      const duration = 0.28;
      shutterBuffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * duration),
        context.sampleRate,
      );
      const samples = shutterBuffer.getChannelData(0);
      let previousNoise = 0;
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        const time = i / context.sampleRate;
        const noise = Math.random() * 2 - 1;
        const crispNoise = (noise - previousNoise) * 0.5;
        previousNoise = noise;
        // Apertura y cierre del obturador: un «ka-chic» corto y mecánico.
        let sample = 0;
        for (const [offset, strength] of [
          [0, 0.85],
          [0.085, 1],
        ]) {
          const t = time - offset;
          if (t < 0) continue;
          const attack = Math.min(1, t / 0.0015);
          const click = crispNoise * Math.exp(-t / 0.012) * 0.9;
          const body =
            Math.sin(2 * Math.PI * 230 * t) * Math.exp(-t / 0.022) * 0.42;
          const mechanism =
            (Math.sin(2 * Math.PI * 1380 * t) +
              Math.sin(2 * Math.PI * 2110 * t) * 0.4) *
            Math.exp(-t / 0.013) *
            0.13;
          sample += (click + body + mechanism) * attack * strength;
        }
        // Aire breve entre ambos clics, como el movimiento de la cortinilla.
        if (time > 0.015 && time < 0.14)
          sample +=
            noise * Math.sin((Math.PI * (time - 0.015)) / 0.125) ** 2 * 0.1;
        samples[i] = sample * Math.min(1, (duration - time) / 0.015);
        peak = Math.max(peak, Math.abs(samples[i]));
      }
      for (let i = 0; i < samples.length; i++)
        samples[i] *= 0.78 / Math.max(peak, 0.78);
    }
    const source = context.createBufferSource();
    source.buffer = shutterBuffer;
    source.connect(output);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
    };
    source.start();
  }

  async function play(kind, { gesture = false, final = false } = {}) {
    if (document.hidden) return;
    const ticket = generation;
    try {
      if (!context) {
        if (!gesture) return;
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        output = context.createGain();
        output.gain.value = 0.32;
        output.connect(context.destination);
      }
      if (context.state !== 'running') {
        if (!gesture) return;
        await context.resume();
      }
      if (
        document.hidden ||
        ticket !== generation ||
        context.state !== 'running'
      )
        return;
      if (kind === 'shutter') shutter();
      else if (kind === 'select') {
        tone(620, 0.09, 0.26);
        tone(830, 0.12, 0.2, 0.055);
      } else if (kind === 'tick') tone(final ? 980 : 740, 0.13, 0.32);
      else tone(520, 0.07, 0.24, 0, 390);
    } catch {
      // Un dispositivo sin audio nunca debe interrumpir la experiencia.
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
      context?.suspend().catch(() => {});
    }
  });
  window.addEventListener('pagehide', stop);

  return { play };
}
