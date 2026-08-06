"use client";

import { useState } from "react";

import type { ToolId } from "@/lib/tools";

type ModifyPanelProps = {
  tool: Extract<
    ToolId,
    | "move"
    | "reshape"
    | "rotate"
    | "split"
    | "merge"
    | "add-ring"
    | "delete-ring"
    | "add-part"
    | "delete-part"
    | "simplify"
    | "offset"
  >;
  selectionCount: number;
  onRotate: (degrees: number) => void;
  onMerge: () => void;
  onSimplify: (tolerance: number) => void;
  onOffset: (distance: number) => void;
};

export default function ModifyPanel({
  tool,
  selectionCount,
  onRotate,
  onMerge,
  onSimplify,
  onOffset,
}: ModifyPanelProps) {
  const [angle, setAngle] = useState(90);
  const [tolerance, setTolerance] = useState(0.1);
  const [offset, setOffset] = useState(1);

  if (tool === "rotate") {
    return (
      <div className="tool-options__form action-card">
        <p>
          Drag on the map to spin the selection about its centre, or apply an
          exact angle. Positive angles turn anticlockwise.
        </p>
        <label>
          Angle (degrees)
          <input
            type="number"
            step={1}
            value={angle}
            onChange={(event) => setAngle(Number(event.target.value) || 0)}
          />
        </label>
        <button
          type="button"
          className="primary-action"
          disabled={!selectionCount}
          onClick={() => onRotate(angle)}
        >
          Rotate {selectionCount || "no"} selected
        </button>
        <div className="button-row">
          <button
            type="button"
            className="secondary-action"
            disabled={!selectionCount}
            onClick={() => onRotate(-90)}
          >
            −90°
          </button>
          <button
            type="button"
            className="secondary-action"
            disabled={!selectionCount}
            onClick={() => onRotate(90)}
          >
            +90°
          </button>
        </div>
      </div>
    );
  }

  if (tool === "merge") {
    return (
      <div className="tool-options__form action-card">
        <p>
          Combines compatible selected features into one multipart feature.
          Attributes come from the first feature in the list.
        </p>
        <button
          type="button"
          className="primary-action"
          disabled={selectionCount < 2}
          onClick={onMerge}
        >
          Merge {selectionCount || 0} features
        </button>
        {selectionCount < 2 ? (
          <p className="tool-options__assign-empty">
            Select at least two features in the active layer first.
          </p>
        ) : null}
      </div>
    );
  }

  if (tool === "simplify" || tool === "offset") {
    const isSimplify = tool === "simplify";
    const value = isSimplify ? tolerance : offset;
    return (
      <div className="tool-options__form action-card">
        <p>
          {isSimplify
            ? "Removes vertices closer than the tolerance while preserving the overall line or polygon shape."
            : "Creates a parallel copy of the selected line. Positive values offset left; negative values offset right."}
        </p>
        <label>
          {isSimplify ? "Tolerance (metres)" : "Offset distance (metres)"}
          <input
            type="number"
            step={0.05}
            min={isSimplify ? 0.01 : undefined}
            value={value}
            onChange={(event) => {
              const next = Number(event.target.value) || 0;
              if (isSimplify) {
                setTolerance(Math.max(0.01, next));
              } else {
                setOffset(next);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="primary-action"
          disabled={!selectionCount}
          onClick={() =>
            isSimplify ? onSimplify(tolerance) : onOffset(offset)
          }
        >
          {isSimplify ? "Simplify selection" : "Create offset"}
        </button>
      </div>
    );
  }

  if (
    tool === "add-ring" ||
    tool === "delete-ring" ||
    tool === "add-part" ||
    tool === "delete-part"
  ) {
    const instruction: Record<typeof tool, string> = {
      "add-ring":
        "Select one polygon, then draw the hole boundary. Enter or double-click finishes the ring.",
      "delete-ring":
        "Select a polygon, then click inside the interior ring you want to remove.",
      "add-part":
        "Select one feature, then digitise another part using that layer’s geometry type.",
      "delete-part":
        "Select a multipart feature, then click the part you want to remove.",
    };
    return (
      <div className="tool-options__form action-card">
        <p>{instruction[tool]}</p>
        {!selectionCount ? (
          <p className="tool-options__assign-empty">
            Select an editable feature first.
          </p>
        ) : null}
      </div>
    );
  }

  if (tool === "split") {
    return (
      <div className="tool-options__form action-card">
        <p>
          Click two points to draw a cut line, then press Enter. Every selected
          plot the line crosses is split in two; with nothing selected, the cut
          applies to whichever graves it crosses.
        </p>
        <p className="tool-options__assign-empty">
          {selectionCount
            ? `${selectionCount} plot${selectionCount === 1 ? "" : "s"} will be considered.`
            : "No selection — the cut will find graves under the line."}
        </p>
      </div>
    );
  }

  return (
    <div className="tool-options__form action-card">
      <p>
        {tool === "move"
          ? "Select a feature, then click where its centre should sit. Repeat to nudge it again."
          : "Click a plot to load its vertices, then drag one to reshape. Alt-click a vertex deletes it; clicking an edge adds one."}
      </p>
    </div>
  );
}
