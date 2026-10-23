import { useEffect, useState, type RefObject } from "react";

const SCAN_INTERVAL_MS = 400;

type DetectedCode = { rawValue: string };
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<DetectedCode[]>;
};
type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorLike;

export type ScannerState = "idle" | "starting" | "scanning" | "denied" | "unsupported";

function detectorConstructor(): BarcodeDetectorConstructor | undefined {
  return (window as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

// Reads QR codes from the rear camera. Browsers without BarcodeDetector report "unsupported".
export function useQrScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  isActive: boolean,
  onDetect: (rawValue: string) => void,
) {
  const [opened, setOpened] = useState<"starting" | "scanning" | "denied">("starting");
  const isSupported = "mediaDevices" in navigator && detectorConstructor() !== undefined;
  const state: ScannerState = !isActive
    ? "idle"
    : isSupported
      ? opened
      : "unsupported";

  useEffect(() => {
    const Detector = detectorConstructor();
    if (!isActive || !isSupported || !Detector) return;
    const detector = new Detector({ formats: ["qr_code"] });
    let isCurrent = true;
    let stream: MediaStream | undefined;
    let timer: number | undefined;

    function scan() {
      const video = videoRef.current;
      if (!isCurrent || !video) return;
      void detector.detect(video).then(
        (codes) => {
          const value = codes[0]?.rawValue;
          if (!isCurrent) return;
          if (value) {
            onDetect(value);
            return;
          }
          timer = window.setTimeout(scan, SCAN_INTERVAL_MS);
        },
        () => {
          if (isCurrent) timer = window.setTimeout(scan, SCAN_INTERVAL_MS);
        },
      );
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
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
