"use client";

import dynamic from "next/dynamic";

const MapApp = dynamic(() => import("@/components/MapApp"), {
  ssr: false,
  loading: () => <div className="map-shell" aria-hidden />,
});

export default function MapAppLoader() {
  return <MapApp />;
}
