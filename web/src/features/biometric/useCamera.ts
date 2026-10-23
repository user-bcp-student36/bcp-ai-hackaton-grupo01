import { useEffect, useState, type RefObject } from "react";

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
const FRAME_QUALITY = 0.7;

export type CameraState = "idle" | "starting" | "ready" | "denied" | "unsupported";

export function useCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  isActive: boolean,
) {
  const [opened, setOpened] = useState<"starting" | "ready" | "denied">("starting");
  // jsdom and old browsers have no camera API.
  const isSupported = "mediaDevices" in navigator;
  const state: CameraState = !isActive
    ? "idle"
    : isSupported
      ? opened
      : "unsupported";

  useEffect(() => {
    if (!isActive || !isSupported) return;
    let isCurrent = true;
    let stream: MediaStream | undefined;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
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
          setOpened("ready");
        },
        () => {
          if (isCurrent) setOpened("denied");
        },
      );
    return () => {
      isCurrent = false;
      setOpened("starting");
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [videoRef, isActive, isSupported]);

  function captureFrame(): string | undefined {
    const video = videoRef.current;
    if (!video || state !== "ready") return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    canvas.getContext("2d")?.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    return canvas.toDataURL("image/jpeg", FRAME_QUALITY);
  }

  return { state, captureFrame };
}
