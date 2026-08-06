"use client";

import type { ComponentType } from "react";

import {
  IconAddFeature,
  IconAddPart,
  IconAddRing,
  IconBatch,
  IconBox,
  IconCircle,
  IconContinue,
  IconDrawBase,
  IconDrawGrave,
  IconDuplicate,
  IconDeletePart,
  IconDeleteRing,
  IconDuplicates,
  IconExport,
  IconFreehand,
  IconGrid,
  IconMeasure,
  IconMerge,
  IconMove,
  IconNumber,
  IconOffset,
  IconPan,
  IconQuality,
  IconRect,
  IconRedo,
  IconReference,
  IconRegenerate,
  IconRotate,
  IconRowCount,
  IconRowSize,
  IconSelect,
  IconSimplify,
  IconSplit,
  IconTrash,
  IconUndo,
  IconVertices,
} from "@/components/icons";
import { TOOLS, TOOL_GROUPS, type ToolId } from "@/lib/tools";

type ToolRailProps = {
  workspaceModule?: "mapping" | "erasmus";
  value: ToolId;
  onChange: (tool: ToolId) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  disabledTools?: Readonly<Record<string, string>>;
};

const ICONS: Record<ToolId, ComponentType<{ className?: string }>> = {
  pan: IconPan,
  measure: IconMeasure,
  select: IconSelect,
  "box-select": IconBox,
  "freehand-select": IconFreehand,
  "circle-select": IconCircle,
  "add-feature": IconAddFeature,
  "draw-grave": IconDrawGrave,
  "draw-base": IconDrawBase,
  "draw-rect": IconRect,
  "draw-circle": IconCircle,
  "draw-freehand": IconFreehand,
  move: IconMove,
  reshape: IconVertices,
  rotate: IconRotate,
  split: IconSplit,
  merge: IconMerge,
  "add-ring": IconAddRing,
  "delete-ring": IconDeleteRing,
  "add-part": IconAddPart,
  "delete-part": IconDeletePart,
  simplify: IconSimplify,
  offset: IconOffset,
  "row-count": IconRowCount,
  "row-size": IconRowSize,
  grid: IconGrid,
  "continue-row": IconContinue,
  regenerate: IconRegenerate,
  "batch-row": IconBatch,
  "number-freehand": IconFreehand,
  "number-line": IconNumber,
  references: IconReference,
  duplicates: IconDuplicates,
  quality: IconQuality,
};

export default function ToolRail({
  workspaceModule = "mapping",
  value,
  onChange,
  onDelete,
  onDuplicate,
  onUndo,
  onRedo,
  onExport,
  canDelete,
  canUndo,
  canRedo,
  disabledTools = {},
}: ToolRailProps) {
  const visibleGroups =
    workspaceModule === "erasmus"
      ? TOOL_GROUPS.filter(
          (group) => group.id === "navigate" || group.id === "select",
        )
      : TOOL_GROUPS;
  return (
    <nav className="tool-rail" aria-label="Map tools">
      {visibleGroups.map((group) => (
        <div
          key={group.id}
          className="tool-rail__group"
          role="group"
          aria-labelledby={`tool-group-${group.id}`}
        >
          <p id={`tool-group-${group.id}`} className="tool-rail__title">
            {group.label}
          </p>
          <div className="tool-rail__buttons">
            {TOOLS.filter((tool) => tool.group === group.id).map((tool) => {
              const Icon = ICONS[tool.id];
              const active = value === tool.id;
              const disabledReason = disabledTools[tool.id];
              const tooltip = tool.shortcut
                ? `${tool.label} (${tool.shortcut.toUpperCase()}) — ${tool.hint}`
                : `${tool.label} — ${tool.hint}`;
              return (
                <button
                  key={tool.id}
                  type="button"
                  className={`tool-rail__btn${active ? " is-active" : ""}`}
                  aria-label={tool.label}
                  aria-pressed={active}
                  disabled={Boolean(disabledReason)}
                  data-tooltip={
                    disabledReason
                      ? `${tool.label} — ${disabledReason}`
                      : tooltip
                  }
                  onClick={() => onChange(tool.id)}
                >
                  <Icon />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {workspaceModule === "mapping" ? (
      <div
        className="tool-rail__group"
        role="group"
        aria-labelledby="tool-group-actions"
      >
        <p id="tool-group-actions" className="tool-rail__title">
          Actions
        </p>
        <div className="tool-rail__buttons">
          <button
            type="button"
            className="tool-rail__btn"
            aria-label="Undo"
            data-tooltip="Undo (Ctrl+Z) — Reverse the most recent map or record edit."
            disabled={!canUndo}
            onClick={onUndo}
          >
            <IconUndo />
          </button>
          <button
            type="button"
            className="tool-rail__btn"
            aria-label="Redo"
            data-tooltip="Redo (Ctrl+Shift+Z) — Restore the edit that was just undone."
            disabled={!canRedo}
            onClick={onRedo}
          >
            <IconRedo />
          </button>
          <button
            type="button"
            className="tool-rail__btn"
            aria-label="Duplicate selection"
            data-tooltip="Duplicate — Copy the selected graves or base areas with a small offset."
            disabled={!canDelete}
            onClick={onDuplicate}
          >
            <IconDuplicate />
          </button>
          <button
            type="button"
            className="tool-rail__btn"
            aria-label="Delete selection"
            data-tooltip="Delete (Del) — Remove every feature in the current selection."
            disabled={!canDelete}
            onClick={onDelete}
          >
            <IconTrash />
          </button>
          <button
            type="button"
            className="tool-rail__btn"
            aria-label="Export GeoJSON"
            data-tooltip="Export backup — Download the base map and graves as GeoJSON files."
            onClick={onExport}
          >
            <IconExport />
          </button>
        </div>
      </div>
      ) : (
        <div
          className="tool-rail__group"
          role="group"
          aria-labelledby="tool-group-actions"
        >
          <p id="tool-group-actions" className="tool-rail__title">
            Actions
          </p>
          <div className="tool-rail__buttons">
            <button
              type="button"
              className="tool-rail__btn"
              aria-label="Undo"
              data-tooltip="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <IconUndo />
            </button>
            <button
              type="button"
              className="tool-rail__btn"
              aria-label="Redo"
              data-tooltip="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <IconRedo />
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
