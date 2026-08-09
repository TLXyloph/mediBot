export class CameraCapture {
  private stream?: MediaStream;
  private readonly canvas = document.createElement("canvas");
  private readonly context = this.canvas.getContext("2d", { alpha: false });

  constructor(private readonly video: HTMLVideoElement) {
    if (!this.context) throw new Error("Canvas 2D context is unavailable");
  }

  async start(): Promise<MediaStream> {
    if (this.stream) return this.stream;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    return this.stream;
  }

  captureJpeg(quality = 0.76): string {
    if (!this.stream || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      throw new Error("Camera frame is not ready");
    }

    const sourceWidth = this.video.videoWidth || 1280;
    const sourceHeight = this.video.videoHeight || 720;
    const width = Math.min(sourceWidth, 960);
    const height = Math.round((sourceHeight / sourceWidth) * width);
    this.canvas.width = width;
    this.canvas.height = height;
    this.context!.drawImage(this.video, 0, 0, width, height);
    return this.canvas.toDataURL("image/jpeg", quality);
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.video.srcObject = null;
  }
}
