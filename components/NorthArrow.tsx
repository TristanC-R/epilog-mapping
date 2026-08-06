"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

type NorthArrowProps = {
  mapRef: RefObject<MapLibreMap | null>;
  ready: boolean;
};

export default function NorthArrow({ mapRef, ready }: NorthArrowProps) {
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }

    const update = () => {
      setBearing(map.getBearing());
    };

    update();
    map.on("rotate", update);
    map.on("move", update);

    return () => {
      map.off("rotate", update);
      map.off("move", update);
    };
  }, [mapRef, ready]);

  const resetNorth = () => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    map.easeTo({
      bearing: 0,
      pitch: 0,
      duration: 600,
      essential: true,
    });
  };

  const offset = ((bearing % 360) + 360) % 360;
  const isNorth = offset < 0.5 || offset > 359.5;

  return (
    <button
      type="button"
      className={`north-arrow${isNorth ? " is-north" : ""}`}
      aria-label="Reset map to north"
      title="Reset to north"
      onClick={resetNorth}
    >
      <span
        className="north-arrow__dial"
        style={{ transform: `rotate(${-bearing}deg)` }}
        aria-hidden
      >
        <svg viewBox="0 0 48 48" className="north-arrow__svg">
          <circle cx="24" cy="24" r="22" className="north-arrow__ring" />
          <path d="M24 8 L30 28 L24 24 L18 28 Z" className="north-arrow__needle" />
          <text x="24" y="16.5" textAnchor="middle" className="north-arrow__n">
            N
          </text>
        </svg>
      </span>
    </button>
  );
}
