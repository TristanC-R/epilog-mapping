"use client";

import { BASEMAPS, type BasemapId } from "@/lib/map";

type BasemapSwitcherProps = {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
};

export default function BasemapSwitcher({
  value,
  onChange,
}: BasemapSwitcherProps) {
  return (
    <div className="basemap-switcher" role="group" aria-label="Base map">
      {BASEMAPS.map((basemap) => {
        const active = basemap.id === value;
        return (
          <button
            key={basemap.id}
            type="button"
            className={`basemap-switcher__btn${active ? " is-active" : ""}`}
            aria-pressed={active}
            onClick={() => onChange(basemap.id)}
          >
            {basemap.label}
          </button>
        );
      })}
    </div>
  );
}
