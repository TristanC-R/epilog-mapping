"use client";

import DrawPanel from "@/components/panels/DrawPanel";
import ErasmusInspectionPanel from "@/components/panels/ErasmusInspectionPanel";
import GridParamsPanel from "@/components/panels/GridParamsPanel";
import MeasurePanel from "@/components/panels/MeasurePanel";
import ModifyPanel from "@/components/panels/ModifyPanel";
import ReferencePanel, {
  type ReferenceRunResult,
} from "@/components/panels/ReferencePanel";
import ReviewPanel from "@/components/panels/ReviewPanel";
import RowParamsPanel from "@/components/panels/RowParamsPanel";
import SelectionPanel, {
  type SelectionPanelProps,
} from "@/components/panels/SelectionPanel";
import type { GraveLabelMode } from "@/lib/cemetery-layers";
import type { ErasmusInspectionController } from "@/hooks/useErasmusInspections";
import type {
  QualityIssue,
  ReferenceSummary,
} from "@/lib/cemetery-operations";
import {
  getTool,
  type DrawTarget,
  type GridParams,
  type NumberParams,
  type RowParams,
  type ToolId,
} from "@/lib/tools";

type ContextPanelProps = {
  workspaceModule: "mapping" | "erasmus";
  tool: ToolId;
  status: string;
  selectionCount: number;
  selectionRadiusMetres: number | null;
  selection: SelectionPanelProps;
  rowParams: RowParams;
  gridParams: GridParams;
  numberParams: NumberParams;
  onRowParams: (params: RowParams) => void;
  onGridParams: (params: GridParams) => void;
  onNumberParams: (params: NumberParams) => void;
  draw: {
    target: DrawTarget;
    onTarget: (target: DrawTarget) => void;
    snapping: boolean;
    onSnapping: (enabled: boolean) => void;
    snapTolerance: number;
    onSnapTolerance: (pixels: number) => void;
  };
  batch: { count: number; onCreate: () => void; onClear: () => void };
  regenerate: {
    mode: "row-count" | "row-size" | "grid" | null;
    onRegenerate: () => void;
  };
  references: {
    summary: ReferenceSummary;
    lastRun: ReferenceRunResult | null;
    labelMode: GraveLabelMode;
    onGenerate: (scope: "all" | "selection") => void;
    onShowChanged: () => void;
    onLabelMode: (mode: GraveLabelMode) => void;
  };
  review: {
    issues: QualityIssue[];
    hasRun: boolean;
    flaggedCount: number;
    onRun: (minimumGap: number) => void;
    onSelectIssue: (issue: QualityIssue) => void;
    onSelectAllFlagged: () => void;
    onClear: () => void;
  };
  modify: {
    onRotate: (degrees: number) => void;
    onMerge: () => void;
    onSimplify: (tolerance: number) => void;
    onOffset: (distance: number) => void;
  };
  measure: {
    points: number;
    length: number;
    area: number | null;
    onClear: () => void;
  };
  erasmus: ErasmusInspectionController;
};

const ROW_TOOLS = new Set<ToolId>([
  "row-count",
  "row-size",
  "continue-row",
  "batch-row",
]);

const SHAPE_TOOLS = new Set<ToolId>([
  "add-feature",
  "draw-grave",
  "draw-base",
  "draw-rect",
  "draw-circle",
  "draw-freehand",
]);

export default function ContextPanel(props: ContextPanelProps) {
  const { tool, status } = props;
  if (props.workspaceModule === "erasmus") {
    return (
      <section className="tool-options" aria-label="Erasmus inspection tools">
        <ErasmusInspectionPanel
          {...props.erasmus}
          selectionCount={props.selectionCount}
        />
      </section>
    );
  }
  const meta = getTool(tool);
  const regenerateMode = props.regenerate.mode;
  const hasActiveSelection =
    (tool === "select" ||
      tool === "box-select" ||
      tool === "freehand-select" ||
      tool === "circle-select") &&
    props.selectionCount > 0;

  const showRowParams =
    ROW_TOOLS.has(tool) ||
    (tool === "regenerate" &&
      (regenerateMode === "row-count" || regenerateMode === "row-size"));
  const showGridParams =
    tool === "grid" || (tool === "regenerate" && regenerateMode === "grid");

  return (
    <section className="tool-options" aria-label="Tool options">
      <header className="tool-options__head">
        <p className="eyebrow">{meta?.group ?? "Tool"}</p>
        <h2 className="tool-options__title">{meta?.label ?? "Tool"}</h2>
        {!hasActiveSelection ? (
          <>
            <p className="tool-options__hint">{meta?.hint}</p>
            <p className="tool-options__status">{status}</p>
          </>
        ) : null}
        {tool === "circle-select" && props.selectionRadiusMetres != null ? (
          <div className="selection-radius" aria-live="polite">
            <span className="selection-radius__label">Radius</span>
            <span className="selection-radius__value">
              {props.selectionRadiusMetres < 100
                ? props.selectionRadiusMetres.toFixed(1)
                : Math.round(props.selectionRadiusMetres).toLocaleString()}
              <small> m</small>
            </span>
          </div>
        ) : null}
      </header>

      {(tool === "select" ||
        tool === "box-select" ||
        tool === "freehand-select" ||
        tool === "circle-select") && (
        <div className="tool-options__form">
          <SelectionPanel {...props.selection} />
        </div>
      )}

      {SHAPE_TOOLS.has(tool) && (
        <DrawPanel
          target={null}
          onTarget={props.draw.onTarget}
          snapping={props.draw.snapping}
          onSnapping={props.draw.onSnapping}
          snapTolerance={props.draw.snapTolerance}
          onSnapTolerance={props.draw.onSnapTolerance}
        />
      )}

      {(tool === "move" ||
        tool === "reshape" ||
        tool === "rotate" ||
        tool === "split" ||
        tool === "merge" ||
        tool === "add-ring" ||
        tool === "delete-ring" ||
        tool === "add-part" ||
        tool === "delete-part" ||
        tool === "simplify" ||
        tool === "offset") && (
        <ModifyPanel
          tool={tool}
          selectionCount={props.selectionCount}
          onRotate={props.modify.onRotate}
          onMerge={props.modify.onMerge}
          onSimplify={props.modify.onSimplify}
          onOffset={props.modify.onOffset}
        />
      )}

      {tool === "measure" && <MeasurePanel {...props.measure} />}

      {showRowParams && (
        <RowParamsPanel
          params={props.rowParams}
          onChange={props.onRowParams}
          mode={
            tool === "row-size" || regenerateMode === "row-size"
              ? "size"
              : "count"
          }
          canMatchSelected={props.selection.layer === "graves"}
        />
      )}

      {showGridParams && (
        <GridParamsPanel
          params={props.gridParams}
          onChange={props.onGridParams}
        />
      )}

      {tool === "batch-row" && (
        <div className="batch-summary">
          <strong>
            {props.batch.count} centre-line
            {props.batch.count === 1 ? "" : "s"} captured
          </strong>
          <span>
            {props.batch.count
              ? `Ready to create about ${(
                  props.batch.count * props.rowParams.count
                ).toLocaleString()} graves.`
              : "Finish each centre-line with Enter, double-click or right-click."}
          </span>
          <div className="button-row">
            <button
              type="button"
              className="primary-action"
              disabled={!props.batch.count}
              onClick={props.batch.onCreate}
            >
              Create batch
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={!props.batch.count}
              onClick={props.batch.onClear}
            >
              Clear lines
            </button>
          </div>
        </div>
      )}

      {tool === "regenerate" && (
        <div className="tool-options__form action-card">
          <p>
            Rebuilds every grave in the selected layout from the centre-line or
            boundary stored when it was first created.
          </p>
          <button
            type="button"
            className="primary-action"
            disabled={!regenerateMode}
            onClick={props.regenerate.onRegenerate}
          >
            Regenerate selected layout
          </button>
          {!regenerateMode ? (
            <p className="tool-options__assign-empty">
              Select a grave that a row or grid tool created first.
            </p>
          ) : null}
        </div>
      )}

      {(tool === "number-freehand" || tool === "number-line") && (
        <div className="tool-options__form">
          <div className="tool-options__inline-fields">
            <label>
              Field
              <input
                type="text"
                value={props.numberParams.field}
                onChange={(event) =>
                  props.onNumberParams({
                    ...props.numberParams,
                    field: event.target.value || "Grave",
                  })
                }
              />
            </label>
            <label>
              Start number
              <input
                type="number"
                value={props.numberParams.start}
                onChange={(event) =>
                  props.onNumberParams({
                    ...props.numberParams,
                    start: Number(event.target.value) || 1,
                  })
                }
              />
            </label>
          </div>
        </div>
      )}

      {tool === "references" && (
        <ReferencePanel
          summary={props.references.summary}
          selectionCount={props.selectionCount}
          lastRun={props.references.lastRun}
          labelMode={props.references.labelMode}
          onGenerate={props.references.onGenerate}
          onShowChanged={props.references.onShowChanged}
          onLabelMode={props.references.onLabelMode}
        />
      )}

      {(tool === "duplicates" || tool === "quality") && (
        <ReviewPanel
          mode={tool === "quality" ? "quality" : "duplicates"}
          issues={props.review.issues}
          hasRun={props.review.hasRun}
          flaggedCount={props.review.flaggedCount}
          onRun={props.review.onRun}
          onSelectIssue={props.review.onSelectIssue}
          onSelectAllFlagged={props.review.onSelectAllFlagged}
          onClear={props.review.onClear}
        />
      )}
    </section>
  );
}
