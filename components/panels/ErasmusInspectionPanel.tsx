"use client";

import type { ErasmusInspectionController } from "@/hooks/useErasmusInspections";

type ErasmusInspectionPanelProps = ErasmusInspectionController & {
  selectionCount: number;
};

export default function ErasmusInspectionPanel({
  section,
  setSection,
  sections,
  summary,
  highlightedIds,
  selectStatuses,
  selectRisks,
  selectFlagged,
  flagSelected,
  clearSelectedFlags,
  clearHighlights,
  selectionCount,
}: ErasmusInspectionPanelProps) {
  return (
    <div className="panel-stack erasmus-panel">
      <section className="erasmus-panel__intro">
        <p className="eyebrow">Erasmus</p>
        <h2>Memorial safety inspections</h2>
        <p>
          Inspections cover above-ground memorials and are due every two years.
          Plots with no headstone or monument are marked separately — there is
          nothing to measure. Work section by section, then queue selected
          memorials for a site visit.
        </p>
      </section>

      <label className="erasmus-panel__section">
        Cemetery section
        <select
          value={section ?? ""}
          onChange={(event) => setSection(event.target.value || null)}
        >
          <option value="">All sections</option>
          {sections.map((candidate) => (
            <option key={candidate} value={candidate}>
              Section {candidate}
            </option>
          ))}
        </select>
      </label>

      <dl className="stat-grid erasmus-stat-grid">
        <div>
          <dt>Total</dt>
          <dd>{summary.total.toLocaleString()}</dd>
        </div>
        <div className="is-good">
          <dt>Current</dt>
          <dd>{summary.current.toLocaleString()}</dd>
        </div>
        <div className="is-warning">
          <dt>Due soon</dt>
          <dd>{summary.due.toLocaleString()}</dd>
        </div>
        <div className="is-error">
          <dt>Overdue</dt>
          <dd>{summary.overdue.toLocaleString()}</dd>
        </div>
        <div>
          <dt>No monument</dt>
          <dd>{summary.no_monument.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Queued</dt>
          <dd>{summary.flagged.toLocaleString()}</dd>
        </div>
      </dl>

      <section className="result-card">
        <p className="tool-options__assign-label">Find memorials</p>
        <div className="button-row">
          <button
            type="button"
            className="primary-action"
            onClick={() => selectStatuses(["due", "overdue"])}
          >
            Select due / overdue
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => selectStatuses(["no_monument"])}
          >
            Select no monument
          </button>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="secondary-action"
            onClick={() => selectRisks(["High", "Critical"])}
          >
            High-risk memorials
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={selectFlagged}
          >
            Show inspection queue
          </button>
        </div>
      </section>

      <section className="result-card">
        <p className="tool-options__assign-label">
          Selected graves · {selectionCount.toLocaleString()}
        </p>
        <div className="button-row">
          <button
            type="button"
            className="primary-action"
            disabled={!selectionCount}
            onClick={flagSelected}
          >
            Flag for inspection
          </button>
          <button
            type="button"
            className="secondary-action"
            disabled={!selectionCount}
            onClick={clearSelectedFlags}
          >
            Remove flag
          </button>
        </div>
        {highlightedIds.length ? (
          <button
            type="button"
            className="secondary-action"
            onClick={clearHighlights}
          >
            Clear {highlightedIds.length.toLocaleString()} highlights
          </button>
        ) : null}
      </section>

      <ul className="inspection-legend" aria-label="Inspection status legend">
        <li><span className="is-current" /> Current</li>
        <li><span className="is-due" /> Due within 90 days</li>
        <li><span className="is-overdue" /> Overdue</li>
        <li><span className="is-no-monument" /> No above-ground monument</li>
        <li><span className="is-queued" /> Flagged for inspection</li>
      </ul>
    </div>
  );
}
