class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      // Clone the Float32Array to transfer it safely
      const clonedData = new Float32Array(channelData);
      this.port.postMessage(clonedData, [clonedData.buffer]);
    }
    return true;
  }
}

registerProcessor("recorder.worklet", RecorderProcessor);
