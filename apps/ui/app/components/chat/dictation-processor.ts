/** These names exist in AudioWorkletGlobalScope, rather than the DOM window. */
declare class AudioWorkletProcessor {
  public readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
declare const sampleRate: number;

/** Capture mono batches without routing the microphone to the speakers. */
class DictationProcessor extends AudioWorkletProcessor {
  readonly #samples = new Float32Array(Math.round(sampleRate / 10));
  #length = 0;
  #stopped = false;

  public constructor() {
    super();
    this.port.addEventListener('message', () => {
      this.#stopped = true;
      this.flush();
      this.port.postMessage({ type: 'flushed' });
    });
    this.port.start();
  }

  public process(inputs: Array<Array<Float32Array | undefined> | undefined>): boolean {
    if (this.#stopped) {
      return false;
    }
    const channel = inputs[0]?.[0];
    if (channel) {
      for (const sample of channel) {
        this.#samples[this.#length++] = sample;
        if (this.#length === this.#samples.length) {
          this.flush();
        }
      }
    }
    return true;
  }

  private flush(): void {
    if (this.#length > 0) {
      const samples = this.#samples.slice(0, this.#length);
      this.port.postMessage({ type: 'audio', samples }, [samples.buffer]);
      this.#length = 0;
    }
  }
}

registerProcessor('tau-dictation', DictationProcessor);
