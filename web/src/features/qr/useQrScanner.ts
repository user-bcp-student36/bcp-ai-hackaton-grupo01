import { useEffect, useState, type RefObject } from "react";
import jsQR from "jsqr";

const SCAN_INTERVAL_MS = 250;

export type ScannerState =
  "idle" | "starting" | "scanning" | "denied" | "unsupported";

// Decodes QR codes from the rear camera in any browser; getUserMedia needs HTTPS or localhost.
export function useQrScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  isActive: boolean,
  onDetect: (rawValue: string) => void,
) {
  const [opened, setOpened] = useState<"starting" | "scanning" | "denied">(
    "starting",
  );
  const isSupported = "mediaDevices" in navigator;
  const state: ScannerState = !isActive
    ? "idle"
    : isSupported
      ? opened
      : "unsupported";

  useEffect(() => {
    if (!isActive || !isSupported) return;
    let isCurrent = true;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    const canvas = document.createElement("canvas");

    function scan() {
      const video = videoRef.current;
      if (!isCurrent || !video) return;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frame.data, frame.width, frame.height);
        if (code?.data) {
          onDetect(code.data);
          return;
        }
      }
      timer = window.setTimeout(scan, SCAN_INTERVAL_MS);
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      .then(
        async (granted) => {
          if (!isCurrent) {
            granted.getTracks().forEach((track) => {
              track.stop();
            });
            return;
          }
          stream = granted;
          if (videoRef.current) {
            videoRef.current.srcObject = granted;
            await videoRef.current.play().catch(() => undefined);
          }
          setOpened("scanning");
          scan();
        },
        () => {
          if (isCurrent) setOpened("denied");
        },
      );
    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
      setOpened("starting");
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [videoRef, isActive, isSupported, onDetect]);

  return state;
}
