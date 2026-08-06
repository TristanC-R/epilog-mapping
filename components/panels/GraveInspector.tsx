"use client";

import { useMemo, useState } from "react";

import { makeGraveReference } from "@/lib/cemetery-operations";
import {
  demoCloudRecordForGrave,
  formatDemoDate,
  type DemoCloudRecord,
} from "@/lib/demo-records";
import {
  inspectionRecordForFeature,
  inspectionStatusLabel,
  inspectionSummaryForFeature,
} from "@/lib/erasmus-inspections";
import type { GraveRecordRow } from "@/lib/grave-records";

const EDIT_FIELDS = [
  { key: "Cem", label: "Cemetery", type: "text" },
  { key: "Sect", label: "Section", type: "text" },
  { key: "SubSect", label: "Sub-section", type: "text" },
  { key: "Grave", label: "Grave number", type: "number" },
  { key: "SubGrave", label: "Sub-grave", type: "text" },
  { key: "status", label: "Plot status", type: "text" },
  { key: "epilog_record_id", label: "Epic Cloud record", type: "text" },
] as const;

type GraveInspectorProps = {
  title: string | null;
  properties: Record<string, unknown>;
  rows: GraveRecordRow[];
  featureId?: string | number | null;
  onSave: (patch: Record<string, unknown>) => void;
  onGenerateReference: () => void;
};

function cloudRecordFor(
  featureId: string | number | null | undefined,
  properties: Record<string, unknown>,
): DemoCloudRecord | null {
  const fromProps = properties.epilog_id;
  const id =
    featureId ??
    (typeof fromProps === "string" || typeof fromProps === "number"
      ? fromProps
      : null);
  if (id == null || String(id).trim() === "") {
    return null;
  }
  return demoCloudRecordForGrave(id);
}

export default function GraveInspector({
  title,
  properties,
  rows,
  featureId = null,
  onSave,
  onGenerateReference,
}: GraveInspectorProps) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      EDIT_FIELDS.map((field) => [
        field.key,
        properties[field.key] == null ? "" : String(properties[field.key]),
      ]),
    ),
  );

  const cloud = useMemo(
    () => cloudRecordFor(featureId, properties),
    [featureId, properties],
  );

  const linkedId = String(
    properties.epilog_record_id ?? cloud?.recordId ?? "",
  ).trim();
  const storedReference = String(properties.GraveRef ?? "").trim();
  const expectedReference = makeGraveReference(properties);
  const referenceStale =
    expectedReference != null && expectedReference !== storedReference;
  const latest = cloud?.interments.at(-1) ?? null;
  const owner = cloud?.owner ?? null;
  const inspectionFeature = useMemo(
    () => ({
      id: featureId ?? String(properties.epilog_id ?? "unknown"),
      properties,
    }),
    [featureId, properties],
  );
  const inspection = useMemo(
    () => inspectionRecordForFeature(inspectionFeature),
    [inspectionFeature],
  );
  const inspectionSummary = useMemo(
    () => inspectionSummaryForFeature(inspectionFeature),
    [inspectionFeature],
  );

  return (
    <div className="record-inspector">
      <div className="record-inspector__heading">
        <div>
          <p className="eyebrow">Grave record</p>
          <h3>{title ?? "Unnumbered plot"}</h3>
        </div>
        <span className={`pill${linkedId ? " is-good" : ""}`}>
          {cloud?.status ?? (linkedId ? "Cloud linked" : "Not linked")}
        </span>
      </div>

      <div className="reference-readout">
        <div>
          <p className="eyebrow">Grave reference</p>
          <code>{storedReference || "Not set"}</code>
        </div>
        {referenceStale ? (
          <button
            type="button"
            className="secondary-action secondary-action--inline"
            onClick={onGenerateReference}
            title={`Write ${expectedReference}`}
          >
            {storedReference ? "Update" : "Generate"}
          </button>
        ) : (
          <span className="pill is-good">Current</span>
        )}
      </div>

      <div className="cloud-record-card">
        <div className="cloud-record-card__head">
          <div>
            <p className="eyebrow">Epic Cloud · demo</p>
            <strong>{linkedId || "No legitimate record linked"}</strong>
          </div>
          <span className="pill">
            {cloud
              ? `${cloud.interments.length} burials`
              : "Unlinked"}
          </span>
        </div>

        {cloud ? (
          <>
            <section className="cloud-people">
              <p className="cloud-people__label">Interments</p>
              {cloud.interments.length === 0 ? (
                <p className="cloud-people__empty">
                  No burials recorded. This plot is {cloud.status.toLowerCase()}.
                </p>
              ) : (
                <ul className="cloud-people__list">
                  {[...cloud.interments].reverse().map((person, index) => {
                    const isLatest = index === 0;
                    return (
                      <li
                        key={person.id}
                        className={`cloud-people__item${isLatest ? " is-latest" : ""}`}
                      >
                        <div>
                          <strong>
                            {person.forename} {person.surname}
                          </strong>
                          <span>
                            Buried {formatDemoDate(person.burialDate)}
                            {person.ageAtDeath != null
                              ? ` · aged ${person.ageAtDeath}`
                              : ""}
                          </span>
                        </div>
                        {isLatest ? (
                          <span className="pill is-good">Latest</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="cloud-people">
              <p className="cloud-people__label">Owner</p>
              {owner && latest ? (
                <div className="cloud-owner">
                  <strong>
                    {owner.forename} {owner.surname}
                  </strong>
                  <span>
                    {owner.relationship} of {latest.forename} {latest.surname}
                  </span>
                  <span>{owner.email}</span>
                  <span>
                    {owner.addressLine}, {owner.postcode}
                  </span>
                </div>
              ) : (
                <p className="cloud-people__empty">
                  No owner — ownership is only held against the most recent
                  burial.
                </p>
              )}
            </section>
          </>
        ) : (
          <p>
            Ownership and interments are managed in Epic Cloud; this map keeps
            the record link.
          </p>
        )}
      </div>

      <div className="cloud-record-card erasmus-record-card">
        <div className="cloud-record-card__head">
          <div>
            <p className="eyebrow">Erasmus · safety inspection</p>
            <strong>
              {inspection?.id ?? "No above-ground monument"}
            </strong>
          </div>
          <span
            className={`pill${
              inspectionSummary.status === "current" ? " is-good" : ""
            }`}
          >
            {inspectionStatusLabel(inspectionSummary.status)}
          </span>
        </div>
        {inspection ? (
          <dl className="inspection-record-grid">
            <div>
              <dt>Last inspected</dt>
              <dd>{formatDemoDate(inspection.inspectedAt)}</dd>
            </div>
            <div>
              <dt>Next due</dt>
              <dd>{formatDemoDate(inspection.nextDueAt)}</dd>
            </div>
            <div>
              <dt>Inspector</dt>
              <dd>{inspection.inspector}</dd>
            </div>
            <div>
              <dt>Outcome / risk</dt>
              <dd>{inspection.outcome} · {inspection.risk}</dd>
            </div>
            <div className="inspection-record-grid__notes">
              <dt>Notes</dt>
              <dd>{inspection.notes}</dd>
            </div>
          </dl>
        ) : (
          <p className="cloud-people__empty">
            This plot has no headstone or other above-ground memorial, so there
            is nothing for Erasmus to measure.
          </p>
        )}
      </div>

      <details className="record-inspector__details record-inspector__editor">
        <summary>Edit mapped details</summary>
        <div className="record-inspector__form">
          {EDIT_FIELDS.map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type={field.type}
                value={draft[field.key] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={() =>
            onSave({
              ...draft,
              Grave: draft.Grave ? Number(draft.Grave) : null,
            })
          }
        >
          Save plot details
        </button>
      </details>

      <details className="record-inspector__details">
        <summary>All mapped attributes</summary>
        <dl className="tool-options__record-list">
          {rows.map((row) => (
            <div key={row.key} className="tool-options__record-row">
              <dt>{row.label}</dt>
              <dd className={row.empty ? "is-empty" : undefined}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
