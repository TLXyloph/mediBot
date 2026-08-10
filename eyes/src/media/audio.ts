function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function downsample(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return input;
  if (sourceRate < targetRate) throw new Error("Audio upsampling is not supported");

  const ratio = sourceRate / targetRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);
  let sourceOffset = 0;

  for (let outputOffset = 0; outputOffset < outputLength; outputOffset += 1) {
    const nextOffset = Math.round((outputOffset + 1) * ratio);
    let total = 0;
    let count = 0;
    for (; sourceOffset < nextOffset && sourceOffset < input.length; sourceOffset += 1) {
      total += input[sourceOffset] ?? 0;
      count += 1;
    }
    output[outputOffset] = count ? total / count : 0;
  }
  return output;
}

function floatToPcm16(samples: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return new Uint8Array(buffer);
}

export class PcmMicrophone {
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private sink?: GainNode;

  async start(stream: MediaStream, onChunk: (base64Pcm: string) => void): Promise<void> {
    if (this.context) return;
    this.context = new AudioContext();
    await this.context.resume();
    this.source = this.context.createMediaStreamSource(stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.sink = this.context.createGain();
    this.sink.gain.value = 0;

    this.processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      const mono16Khz = downsample(samples, event.inputBuffer.sampleRate, 16_000);
      onChunk(bytesToBase64(floatToPcm16(mono16Khz)));
    };

    this.source.connect(this.processor);
    this.processor.connect(this.sink);
    this.sink.connect(this.context.destination);
  }

  stop(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    void this.context?.close();
    this.processor = undefined;
    this.source = undefined;
    this.sink = undefined;
    this.context = undefined;
  }
}

export class PcmSpeaker {
  private readonly context = new AudioContext();
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  async resume(): Promise<void> {
    await this.context.resume();
  }

  enqueue(base64Pcm: string, sampleRate = 24_000): void {
    const bytes = base64ToBytes(base64Pcm);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const buffer = this.context.createBuffer(1, sampleCount, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      channel[index] = view.getInt16(index * 2, true) / 0x8000;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const startAt = Math.max(this.context.currentTime + 0.025, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  stop(): void {
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.nextStartTime = this.context.currentTime;
  }
}

export class WakeWordAudioGate {
  private transcript = "";
  private addressed = false;
  private bufferedAudio: string[] = [];

  constructor(private readonly speaker: PcmSpeaker) {}

  observeTranscript(text: string): boolean {
    this.transcript = `${this.transcript} ${text}`.trim();
    // Wake word is "Scribe" (ASR spells real words; "MediBot" → Metabott/Merbau,
    // so the legacy pattern alone silently discarded every answer).
    if (/\bscribe(?:s|r)?\b|\bmedi\s*bot\b/i.test(this.transcript)) {
      this.addressed = true;
      for (const chunk of this.bufferedAudio) this.speaker.enqueue(chunk);
      this.bufferedAudio = [];
    }
    return this.addressed;
  }

  pushAudio(base64Pcm: string): void {
    if (this.addressed) {
      this.speaker.enqueue(base64Pcm);
      return;
    }
    this.bufferedAudio.push(base64Pcm);
    if (this.bufferedAudio.length > 12) this.bufferedAudio.shift();
  }

  finishTurn(): void {
    if (!this.addressed) this.bufferedAudio = [];
    this.transcript = "";
    this.addressed = false;
  }

  reset(): void {
    this.bufferedAudio = [];
    this.transcript = "";
    this.addressed = false;
    this.speaker.stop();
  }
}
