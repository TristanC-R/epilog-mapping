"use client";

import { useState } from "react";

import type { QualityIssue } from "@/lib/cemetery-operations";

const LIST_LIMIT = 250;

type ReviewPanelProps = {
  mode: "duplicates" | "quality";
  issues: QualityIssue[];
  hasRun: boolean;
  flaggedCount: number;
  onRun: (minimumGap: number) => void;
  onSelectIssue: (issue: QualityIssue) => void;
  onSelectAllFlagged: () => void;
  onClear: () => void;
};

export default function ReviewPanel({
  mode,
  issues,
  hasRun,
  flaggedCount,
  onRun,
  onSelectIssue,
  onSelectAllFlagged,
  onClear,
}: ReviewPanelProps) {
  const [minimumGap, setMinimumGap] = useState(0);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;

  return (
    <div className="tool-options__form action-card">
      <p>
        {mode === "quality"
          ? "Checks polygons, grave numbers, references, overlaps and spacing. Everything found is highlighted in red on the map."
          : "Finds graves sharing the same non-empty reference — the usual cause of records attaching to the wrong plot."}
      </p>

      {mode === "quality" ? (
        <label>
          Minimum gap between graves (m)
          <input
            type="number"
            min={0}
            step={0.05}
            value={minimumGap}
            onChange={(event) =>
              setMinimumGap(Math.max(0, Number(event.target.value) || 0))
            }
          />
        </label>
      ) : null}

      <button
        type="button"
        className="primary-action"
        onClick={() => onRun(minimumGap)}
      >
        {mode === "quality" ? "Run quality control" : "Find duplicates"}
      </button>

      {hasRun ? (
        <div className="result-card">
          <p className="eyebrow">Results</p>
          <strong>
            {issues.length
              ? `${errors.toLocaleString()} errors · ${warnings.toLocaleString()} warnings`
              : "No issues found"}
          </strong>
          {flaggedCount ? (
            <>
              <span className="result-card__note">
                {flaggedCount.toLocaleString()} graves highlighted on the map.
              </span>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={onSelectAllFlagged}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={onClear}
                >
                  Clear highlight
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {issues.length ? (
        <div className="issue-list" aria-label="Review results">
          {issues.slice(0, LIST_LIMIT).map((issue) => (
            <button
              key={issue.id}
              type="button"
              className={`issue-list__item is-${issue.severity}`}
              onClick={() => onSelectIssue(issue)}
            >
              <span>{issue.title}</span>
              <small>{issue.detail}</small>
            </button>
          ))}
          {issues.length > LIST_LIMIT ? (
            <p className="issue-list__empty">
              Showing the first {LIST_LIMIT}. Fix these and run the check again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
