import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { Tool } from "@google/genai";
import { api } from "./api.js";
import type { VitalsReading } from "./shared/types.js";
import { CameraCapture } from "./media/camera.js";
import { WakeWordAudioGate } from "./media/audio.js";

const SYSTEM_INSTRUCTION = `You are MediBot Eyes, an ambient vision and voice component for a scripted EMS demo.

VISION:
- Continuously inspect the latest simulated patient-monitor frame.
- When you receive [VISION_SCAN], stay completely silent. If and only if HR, SpO2, systolic BP, and diastolic BP are all clearly visible, call report_vitals with the exact displayed values and a confidence from 0 to 1.
- Never infer an obscured digit and never describe the frame aloud.

VOICE:
- Never produce audio unless the current human utterance explicitly includes the name "MediBot".
- When addressed with a patient-state question, call query_patient_state before answering.
- Answer in one short sentence using only the tool result. If the value is unavailable, say it is not available.
- Do not provide diagnosis, treatment recommendations, or invented clinical facts.`;

const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "report_vitals",
        description:
          "Append clearly visible monitor vitals. Call on a changed reading during a VISION_SCAN. Never call with guessed or partial values.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            hrBpm: { type: Type.INTEGER, description: "Heart rate in beats per minute" },
            spo2Pct: { type: Type.INTEGER, description: "Oxygen saturation percent" },
            systolicMmHg: { type: Type.INTEGER, description: "Systolic blood pressure" },
            diastolicMmHg: { type: Type.INTEGER, description: "Diastolic blood pressure" },
            confidence: { type: Type.NUMBER, description: "Visual-read confidence from 0 to 1" },
          },
          required: [
            "hrBpm",
            "spo2Pct",
            "systolicMmHg",
            "diastolicMmHg",
            "confidence",
          ],
        },
      },
      {
        name: "query_patient_state",
        description:
          "Fetch authoritative medications, allergies, last epinephrine time, and protocol position before answering a patient-state question.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
    ],
  },
];

interface LiveSession {
  sendRealtimeInput(input: {
    audio?: { data: string; mimeType: string };
    video?: { data: string; mimeType: string };
    text?: string;
  }): void;
  sendToolResponse(input: {
    functionResponses: Array<{
      id?: string;
      name: string;
      response: Record<string, unknown>;
    }>;
  }): void;
  close(): void;
}

export interface LiveEyesCallbacks {
  onStatus(message: string): void;
  onTranscript(source: "human" | "medibot", text: string): void;
  onVitals(reading: VitalsReading, duplicate: boolean): void;
  onTool(message: string): void;
  onFallback(reason: string): void;
}

function imagePayload(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid camera data URL");
  return dataUrl.slice(comma + 1);
}

export class LiveEyes {
  private session?: LiveSession;
  private running = false;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private frameTimer?: number;
  private scanTimer?: number;

  constructor(
    private readonly camera: CameraCapture,
    private readonly audioGate: WakeWordAudioGate,
    private readonly callbacks: LiveEyesCallbacks,
  ) {}

  async start(): Promise<void> {
    this.running = true;
    this.reconnectAttempts = 0;
    try {
      await this.connect();
    } catch (error) {
      await this.reconnect(error instanceof Error ? error.message : "Initial connection failed");
    }
  }

  sendAudio(base64Pcm: string): void {
    if (!this.running || !this.session) return;
    this.session.sendRealtimeInput({
      audio: { data: base64Pcm, mimeType: "audio/pcm;rate=16000" },
    });
  }

  stop(): void {
    this.running = false;
    this.stopTimers();
    this.audioGate.reset();
    this.session?.close();
    this.session = undefined;
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    this.callbacks.onStatus("Requesting secure Live token…");
    const { token, model } = await api.createLiveToken();
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });

    this.session = (await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: SYSTEM_INSTRUCTION,
        tools,
      },
      callbacks: {
        onopen: () => {
          this.reconnectAttempts = 0;
          this.callbacks.onStatus("Gemini Live connected");
          this.startTimers();
        },
        onmessage: (message) => void this.handleMessage(message),
        onerror: (event) => {
          this.callbacks.onStatus(`Live error: ${event.message || "connection error"}`);
        },
        onclose: (event) => {
          this.session = undefined;
          this.stopTimers();
          if (this.running) void this.reconnect(event.reason || "Live connection closed");
        },
      },
    })) as LiveSession;
  }

  private startTimers(): void {
    this.stopTimers();
    const sendFrame = () => {
      if (!this.session) return;
      try {
        this.session.sendRealtimeInput({
          video: {
            data: imagePayload(this.camera.captureJpeg()),
            mimeType: "image/jpeg",
          },
        });
      } catch (error) {
        this.callbacks.onStatus(error instanceof Error ? error.message : "Camera frame failed");
      }
    };

    sendFrame();
    this.frameTimer = window.setInterval(sendFrame, 1_000);
    this.scanTimer = window.setInterval(() => {
      this.session?.sendRealtimeInput({
        text: "[VISION_SCAN] Inspect the latest frame and silently report complete changed vitals via the tool.",
      });
    }, 3_000);
  }

  private stopTimers(): void {
    if (this.frameTimer) window.clearInterval(this.frameTimer);
    if (this.scanTimer) window.clearInterval(this.scanTimer);
    this.frameTimer = undefined;
    this.scanTimer = undefined;
  }

  private async reconnect(reason: string): Promise<void> {
    if (this.reconnecting || !this.running) return;
    this.reconnecting = true;
    try {
      while (this.running && this.reconnectAttempts < 3) {
        this.reconnectAttempts += 1;
        const delay = 500 * 2 ** (this.reconnectAttempts - 1);
        this.callbacks.onStatus(`Reconnect ${this.reconnectAttempts}/3 in ${delay}ms`);
        await new Promise((resolve) => window.setTimeout(resolve, delay));
        try {
          await this.connect();
          return;
        } catch (error) {
          reason = error instanceof Error ? error.message : reason;
        }
      }

      if (this.running) {
        this.running = false;
        this.callbacks.onFallback(`Live unavailable after 3 retries: ${reason}`);
      }
    } finally {
      this.reconnecting = false;
    }
  }

  private async handleMessage(message: {
    serverContent?: {
      inputTranscription?: { text?: string };
      outputTranscription?: { text?: string };
      modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
      turnComplete?: boolean;
      interrupted?: boolean;
    };
    toolCall?: {
      functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>;
    };
  }): Promise<void> {
    const content = message.serverContent;
    const inputText = content?.inputTranscription?.text;
    if (inputText) {
      this.audioGate.observeTranscript(inputText);
      this.callbacks.onTranscript("human", inputText);
    }

    const outputText = content?.outputTranscription?.text;
    if (outputText) this.callbacks.onTranscript("medibot", outputText);

    for (const part of content?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) {
        this.audioGate.pushAudio(part.inlineData.data);
      }
    }

    if (content?.interrupted) this.audioGate.reset();
    if (content?.turnComplete) this.audioGate.finishTurn();

    const functionResponses: Array<{
      id?: string;
      name: string;
      response: Record<string, unknown>;
    }> = [];

    for (const call of message.toolCall?.functionCalls ?? []) {
      if (!call.name) continue;
      try {
        if (call.name === "report_vitals") {
          const reading = call.args as unknown as VitalsReading;
          const result = await api.reportVitals(reading);
          this.callbacks.onVitals(reading, result.duplicate);
          this.callbacks.onTool(result.duplicate ? "Vitals unchanged — skipped" : "Vitals appended to Convex");
          functionResponses.push({
            ...(call.id ? { id: call.id } : {}),
            name: call.name,
            response: { result },
          });
        } else if (call.name === "query_patient_state") {
          const state = await api.queryPatientState();
          this.callbacks.onTool("Patient state read from Convex");
          functionResponses.push({
            ...(call.id ? { id: call.id } : {}),
            name: call.name,
            response: { result: state },
          });
        } else {
          functionResponses.push({
            ...(call.id ? { id: call.id } : {}),
            name: call.name,
            response: { error: "Unknown tool" },
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Tool failed";
        this.callbacks.onTool(`${call.name} failed: ${errorMessage}`);
        functionResponses.push({
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: { error: errorMessage },
        });
      }
    }

    if (functionResponses.length) this.session?.sendToolResponse({ functionResponses });
  }
}

export class FallbackScanner {
  private timer?: number;
  private running = false;

  constructor(
    private readonly camera: CameraCapture,
    private readonly callbacks: Pick<LiveEyesCallbacks, "onStatus" | "onVitals" | "onTool">,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.callbacks.onStatus("Fallback vision active — scanning every 3 seconds");
    void this.scan();
    this.timer = window.setInterval(() => void this.scan(), 3_000);
  }

  stop(): void {
    this.running = false;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private async scan(): Promise<void> {
    if (!this.running) return;
    try {
      const result = await api.analyzeFrame(this.camera.captureJpeg());
      if (!result.detected || !result.reading) {
        this.callbacks.onTool("Fallback scan: complete vitals not visible");
        return;
      }
      this.callbacks.onVitals(result.reading, result.publish?.duplicate ?? false);
      this.callbacks.onTool(
        result.publish?.duplicate
          ? "Fallback scan: unchanged — skipped"
          : "Fallback scan: vitals appended to Convex",
      );
    } catch (error) {
      this.callbacks.onStatus(
        `Fallback scan failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}
