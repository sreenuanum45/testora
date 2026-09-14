import { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";

/** Builds the ws(s):// origin the VNC relay listens on from VITE_API_URL — same host as
 *  the REST API, just a different scheme and path (see backend/src/recording/vnc-relay.ts).
 *  Only ever called when vncEnabled is true, which only happens when the backend is a
 *  server with no real display of its own (see NEEDS_VIRTUAL_DISPLAY) — API_URL is always
 *  an absolute https:// URL there, never the local dev "/api" relative default. */
function vncWsUrl(testId: string): string {
  const origin = API_URL.replace(/\/api\/?$/, "").replace(/^http/, "ws");
  const token = localStorage.getItem("testora_token") ?? "";
  return `${origin}/ws/recording?testId=${encodeURIComponent(testId)}&token=${encodeURIComponent(token)}`;
}

/** Live view of the Codegen browser window the backend is recording into — for a
 *  production/headless backend (vncEnabled), that window only exists on a virtual display
 *  on the server, so this is the only way to see or click through it. Renders into a plain
 *  div; noVNC owns everything inside it (canvas, scaling, input capture). */
export default function RecordingViewer({ testId }: { testId: string }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");

  useEffect(() => {
    if (!containerRef.current) return;
    let rfb: InstanceType<typeof RFB> | null = null;
    let cancelled = false;
    // The container's Xvfb+x11vnc take a moment to come up after the recording/start
    // response returns (recording.service.ts's own fixed startup delays) — the first
    // connect attempt landing before x11vnc is listening is expected, not exceptional.
    let attempt = 0;

    const connect = (): void => {
      if (cancelled || !containerRef.current) return;
      try {
        rfb = new RFB(containerRef.current, vncWsUrl(testId));
        rfb.scaleViewport = true;
        rfb.addEventListener("connect", () => !cancelled && setStatus("connected"));
        rfb.addEventListener("disconnect", () => {
          if (cancelled) return;
          if (attempt < 8) {
            attempt += 1;
            setTimeout(connect, 800);
          } else {
            setStatus("error");
          }
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    connect();

    return () => {
      cancelled = true;
      rfb?.disconnect();
    };
  }, [testId]);

  return (
    <div className="rounded-lg border border-border bg-black overflow-hidden">
      {status !== "connected" && (
        <div className="px-3 py-2 text-xs text-muted bg-panel border-b border-border">
          {status === "connecting" ? "Connecting to the live browser…" : "Couldn't connect to the live view — the recording is still running server-side; try refreshing."}
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", aspectRatio: "1440 / 900" }} />
    </div>
  );
}
