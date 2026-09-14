// @novnc/novnc ships no TypeScript types — this covers only the RFB surface RecordingViewer
// actually uses (see https://github.com/novnc/noVNC/blob/master/docs/API.md for the full API).
declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { credentials?: { password?: string } });
    scaleViewport: boolean;
    resizeSession: boolean;
    disconnect(): void;
  }
}
