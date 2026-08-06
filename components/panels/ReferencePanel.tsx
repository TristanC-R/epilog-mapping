"use client";

import type { ReferenceSummary } from "@/lib/cemetery-operations";
import type { GraveLabelMode } from "@/lib/cemetery-layers";

export type ReferenceRunResult = {
  changed: number;
  unchanged: number;
  skipped: number;
  samples: string[];
  scope: "all" | "selection";
};

type ReferencePanelProps = {
  summary: ReferenceSummary;
  selectionCount: number;
  lastRun: ReferenceRunResult | null;
  labelMode: GraveLabelMode;
  onGenerate: (scope: "all" | "selection") => void;
  onShowChanged: () => void;
  onLabelMode: (mode: GraveLabelMode) => void;
};

export default function ReferencePanel({
  summary,
  selectionCount,
  lastRun,
  labelMode,
  onGenerate,
  onShowChanged,
  onLabelMode,
}: ReferencePanelProps) {
  return (
    <div className="tool-options__form action-card">
      <p>
        The reference is the key that ties a plot on the map to its record in
        Epic Cloud: <code>Cem~Sect~SubSect~Grave~SubGrave</code>. Plots with
        no grave number are left alone.
      </p>

      <dl className="stat-grid">
        <div>
          <dt>Graves</dt>
          <dd>{summary.total.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Referenced</dt>
          <dd>{summary.withReference.toLocaleString()}</dd>
        </div>
        <div className={summary.outOfDate ? "is-warning" : undefined}>
          <dt>Out of date</dt>
          <dd>{summary.outOfDate.toLocaleString()}</dd>
        </div>
        <div className={summary.duplicated ? "is-error" : undefined}>
          <dt>Duplicated</dt>
          <dd>{summary.duplicated.toLocaleString()}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="primary-action"
        disabled={summary.outOfDate === 0}
        onClick={() => onGenerate("all")}
      >
        {summary.outOfDate
          ? `Write ${summary.outOfDate.toLocaleString()} references`
          : "All references are current"}
      </button>
      <button
        type="button"
        className="secondary-action"
        disabled={selectionCount === 0}
        onClick={() => onGenerate("selection")}
      >
        Write for {selectionCount.toLocaleString()} selected
      </button>

      {lastRun ? (
        <div className="result-card">
          <p className="eyebrow">Last run</p>
          <strong>
            {lastRun.changed.toLocaleString()} updated ·{" "}
            {lastRun.unchanged.toLocaleString()} already correct ·{" "}
            {lastRun.skipped.toLocaleString()} without a number
          </strong>
          {lastRun.samples.length ? (
            <ul className="result-card__samples">
              {lastRun.samples.map((sample) => (
                <li key={sample}>
                  <code>{sample}</code>
                </li>
              ))}
            </ul>
          ) : null}
          {lastRun.changed ? (
            <button
              type="button"
              className="secondary-action secondary-action--inline"
              onClick={onShowChanged}
            >
              Show updated graves on the map
            </button>
          ) : null}
        </div>
      ) : null}

      <label>
        Show labels on the map
        <select
          value={labelMode}
          onChange={(event) =>
            onLabelMode(event.target.value as GraveLabelMode)
          }
        >
          <option value="none">Off</option>
          <option value="number">Grave number</option>
          <option value="reference">Grave reference</option>
        </select>
      </label>
    </div>
  );
}
