import type { ReactNode } from "react";

export type IllustrationName =
  "contacts" | "history" | "success" | "scan" | "receive" | "biometric";

const SCENES: Record<IllustrationName, ReactNode> = {
  contacts: (
    <>
      <circle cx="60" cy="48" r="22" fill="#00a9e0" />
      <circle cx="60" cy="42" r="8" fill="#fff" />
      <path d="M44 62c4-8 28-8 32 0" fill="#fff" />
      <circle cx="108" cy="58" r="16" fill="#ff7800" />
      <circle cx="108" cy="54" r="6" fill="#fff" />
      <path d="M97 67c3-6 19-6 22 0" fill="#fff" />
      <circle cx="116" cy="26" r="11" fill="#002a8d" />
      <path
        d="M116 20v12M110 26h12"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </>
  ),
  history: (
    <>
      <rect
        x="40"
        y="18"
        width="80"
        height="84"
        rx="10"
        fill="#fff"
        stroke="#c8d3ec"
        strokeWidth="2"
      />
      <rect x="52" y="34" width="56" height="8" rx="4" fill="#c8d3ec" />
      <rect x="52" y="52" width="40" height="8" rx="4" fill="#c8d3ec" />
      <rect x="52" y="70" width="48" height="8" rx="4" fill="#c8d3ec" />
      <circle cx="112" cy="94" r="18" fill="#002a8d" />
      <path
        d="M112 84v11l7 4"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  success: (
    <>
      <circle cx="80" cy="60" r="44" fill="#e6f3ec" />
      <circle cx="80" cy="60" r="32" fill="#1b6b45" />
      <path
        d="M64 61l12 12 22-24"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="30" cy="30" r="5" fill="#ff7800" />
      <circle cx="132" cy="38" r="4" fill="#00a9e0" />
      <circle cx="124" cy="100" r="5" fill="#ff7800" />
      <circle cx="36" cy="94" r="4" fill="#002a8d" />
    </>
  ),
  scan: (
    <>
      <path
        d="M36 44V30a8 8 0 0 1 8-8h14M102 22h14a8 8 0 0 1 8 8v14M124 80v10a8 8 0 0 1-8 8h-14M58 98H44a8 8 0 0 1-8-8V80"
        fill="none"
        stroke="#002a8d"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="56" y="42" width="18" height="18" rx="3" fill="#14213d" />
      <rect x="86" y="42" width="18" height="18" rx="3" fill="#14213d" />
      <rect x="56" y="70" width="18" height="18" rx="3" fill="#14213d" />
      <rect x="86" y="72" width="8" height="8" fill="#14213d" />
      <rect x="96" y="80" width="8" height="8" fill="#14213d" />
      <rect x="30" y="58" width="100" height="4" rx="2" fill="#ff7800" />
    </>
  ),
  receive: (
    <>
      <rect
        x="40"
        y="16"
        width="80"
        height="88"
        rx="12"
        fill="#fff"
        stroke="#c8d3ec"
        strokeWidth="2"
      />
      <rect x="54" y="30" width="22" height="22" rx="3" fill="#14213d" />
      <rect x="84" y="30" width="22" height="22" rx="3" fill="#14213d" />
      <rect x="54" y="60" width="22" height="22" rx="3" fill="#14213d" />
      <rect x="84" y="62" width="10" height="10" fill="#14213d" />
      <rect x="96" y="74" width="10" height="10" fill="#14213d" />
      <circle cx="122" cy="92" r="16" fill="#ff7800" />
      <text
        x="122"
        y="99"
        textAnchor="middle"
        fontSize="18"
        fontWeight="700"
        fill="#fff"
        fontFamily="Segoe UI, system-ui, sans-serif"
      >
        S/
      </text>
    </>
  ),
  biometric: (
    <>
      <path
        d="M36 44V30a8 8 0 0 1 8-8h14M102 22h14a8 8 0 0 1 8 8v14M124 80v10a8 8 0 0 1-8 8h-14M58 98H44a8 8 0 0 1-8-8V80"
        fill="none"
        stroke="#002a8d"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <ellipse
        cx="80"
        cy="60"
        rx="22"
        ry="28"
        fill="#e6edfa"
        stroke="#00a9e0"
        strokeWidth="3"
      />
      <circle cx="71" cy="54" r="3" fill="#002a8d" />
      <circle cx="89" cy="54" r="3" fill="#002a8d" />
      <path
        d="M72 72c5 5 11 5 16 0"
        fill="none"
        stroke="#002a8d"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </>
  ),
};

// Decorative only: the text next to it always carries the meaning.
export function Illustration({ name }: { name: IllustrationName }) {
  return (
    <svg
      className="illustration"
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
    >
      {SCENES[name]}
    </svg>
  );
}
