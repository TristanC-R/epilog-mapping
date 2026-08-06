"use client";

import dynamic from "next/dynamic";

const EpicMapWorkspace = dynamic(
  () => import("@/components/EpicMapWorkspace"),
  {
    ssr: false,
    loading: () => <div className="map-shell" aria-hidden />,
  },
);

export default function EpicMapCanvasLoader() {
  return <EpicMapWorkspace />;
}
