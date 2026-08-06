"use client";

import { formatArea, formatDistance } from "@/lib/digitising";

type MeasurePanelProps = {
  points: number;
  length: number;
  area: number | null;
  onClear: () => void;
};

export default function MeasurePanel({
  points,
  length,
  area,
  onClear,
}: MeasurePanelProps) {
  return (
    <div className="tool-options__form action-card">
      <p>
        Click along the ground to measure. Three or more points also report the
        enclosed area. Distances use British National Grid metres.
      </p>
      <dl className="stat-grid">
        <div>
          <dt>Points</dt>
          <dd>{points}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{formatDistance(length)}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{area == null ? "—" : formatArea(area)}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="secondary-action"
        disabled={!points}
        onClick={onClear}
      >
        Clear measurement
      </button>
    </div>
  );
}
