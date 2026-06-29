// noVNC ships ES modules without TypeScript types. Declare the minimal surface
// Overseer uses from the RFB client.
declare module "@novnc/novnc" {
  export interface RFBOptions {
    credentials?: { username?: string; password?: string; target?: string };
    shared?: boolean;
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      urlOrChannel: string,
      options?: RFBOptions,
    );
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    background: string;
    qualityLevel: number;
    compressionLevel: number;
    focus(): void;
    blur(): void;
    disconnect(): void;
    sendCredentials(credentials: {
      username?: string;
      password?: string;
      target?: string;
    }): void;
    sendCtrlAltDel(): void;
    machineShutdown(): void;
    machineReboot(): void;
  }
}
