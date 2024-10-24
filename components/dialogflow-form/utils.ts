export const downsampleBuffer = (
  buffer: Float32Array,
  sampleRate: number,
  outSampleRate: number
) => {
  if (outSampleRate === sampleRate) {
    return convertFloat32ToInt16(buffer);
  }
  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    // Use average value between samples to prevent audio artifacts
    let accum = 0,
      count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = Math.min(1, accum / count) * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result.buffer;
};

export const convertFloat32ToInt16 = (buffer: Float32Array) => {
  const l = buffer.length;
  const buf = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    buf[i] = Math.max(-1, Math.min(1, buffer[i])) * 0x7fff;
  }
  return buf.buffer;
};

export const getNextDelay = (word: string): number => {
  const baseDelay = 30; // Increased base delay for readability
  const variableDelay = Math.random() * 100; // 0-100ms of variable delay

  const lastChar = word[word.length - 1];
  if ([".", "!", "?"].includes(lastChar)) {
    return baseDelay + variableDelay + 600; // Longer pause after sentences
  } else if ([",", ";", ":"].includes(lastChar)) {
    return baseDelay + variableDelay + 300; // Medium pause after clauses
  } else {
    return baseDelay + variableDelay;
  }
};
