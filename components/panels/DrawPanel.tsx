"use client";

import type { DrawTarget } from "@/lib/tools";

type DrawPanelProps = {
  /** Only the generic shape tools can switch layer; grave/base draw is fixed. */
  target: DrawTarget | null;
  onTarget: (target: DrawTarget) => void;
  snapping: boolean;
  onSnapping: (enabled: boolean) => void;
  snapTolerance: number;
  onSnapTolerance: (pixels: number) => void;
};

export default function DrawPanel({
  target,
  onTarget,
  snapping,
  onSnapping,
  snapTolerance,
  onSnapTolerance,
}: DrawPanelProps) {
  return (
    <div className="tool-options__form">
      {target ? (
        <div className="segmented" role="group" aria-label="Draw into layer">
          {(["graves", "base"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`segmented__btn${target === option ? " is-active" : ""}`}
              aria-pressed={target === option}
              onClick={() => onTarget(option)}
            >
              {option === "graves" ? "Grave plot" : "Base area"}
            </button>
          ))}
        </div>
      ) : null}

      <label className="tool-options__check">
        <input
          type="checkbox"
          checked={snapping}
          onChange={(event) => onSnapping(event.target.checked)}
        />
        Snap to nearby vertices
      </label>

      {snapping ? (
        <label>
          Snap distance (screen pixels)
          <input
            type="number"
            min={2}
            max={40}
            value={snapTolerance}
            onChange={(event) =>
              onSnapTolerance(
                Math.min(40, Math.max(2, Number(event.target.value) || 10)),
              )
            }
          />
        </label>
      ) : null}

      <p className="tool-options__assign-empty">
        Enter or double-click finishes a shape · Backspace removes the last
        vertex · Esc cancels.
      </p>
    </div>
  );
}
