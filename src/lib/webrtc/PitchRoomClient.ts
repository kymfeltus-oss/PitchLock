/**
 * Custom WebRTC entry point — swap internals for your signaling server / mesh / SFU.
 * This stub keeps UI and product flows decoupled from transport.
 */
export type PrivacyMode = { videoBlurred: boolean; audioMuted: boolean };

export class PitchRoomClient {
  private privacy: PrivacyMode = { videoBlurred: false, audioMuted: false };

  /** Placeholder: acquire camera + mic and attach to peer connection. */
  async startLocalMedia(_opts: { video: boolean; audio: boolean }): Promise<void> {
    return;
  }

  /** Placeholder: subscribe to remote tracks from signaling. */
  async attachRemote(_remoteId: string): Promise<void> {
    return;
  }

  setPrivacy(next: Partial<PrivacyMode>): PrivacyMode {
    this.privacy = { ...this.privacy, ...next };
    return this.privacy;
  }

  getPrivacy(): PrivacyMode {
    return this.privacy;
  }

  /** Placeholder: begin compositor / egress when recording engine is wired. */
  async beginRecordingSession(_label: string): Promise<void> {
    return;
  }

  dispose(): void {
    return;
  }
}
