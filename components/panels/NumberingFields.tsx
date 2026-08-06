"use client";

import type { NumberPattern } from "@/lib/tools";

type NumberingShape = {
  autoNumber: boolean;
  numberField: string;
  numberStart: number;
  numberPattern: NumberPattern;
  attributes: string;
};

type NumberingFieldsProps = NumberingShape & {
  onChange: (patch: Partial<NumberingShape>) => void;
};

/** Shared numbering + attribute preset block for the row and grid tools. */
export default function NumberingFields({
  autoNumber,
  numberField,
  numberStart,
  numberPattern,
  attributes,
  onChange,
}: NumberingFieldsProps) {
  return (
    <div className="tool-options__subsection">
      <p className="eyebrow">Numbering &amp; attributes</p>
      <label className="tool-options__check">
        <input
          type="checkbox"
          checked={autoNumber}
          onChange={(event) => onChange({ autoNumber: event.target.checked })}
        />
        Number graves as they are created
      </label>

      {autoNumber ? (
        <>
          <div className="tool-options__inline-fields">
            <label>
              Field
              <input
                value={numberField}
                onChange={(event) =>
                  onChange({ numberField: event.target.value || "Grave" })
                }
              />
            </label>
            <label>
              Start
              <input
                type="number"
                min={0}
                value={numberStart}
                onChange={(event) =>
                  onChange({ numberStart: Number(event.target.value) || 0 })
                }
              />
            </label>
          </div>
          <label>
            Numbering pattern
            <select
              value={numberPattern}
              onChange={(event) =>
                onChange({
                  numberPattern: event.target.value as NumberPattern,
                })
              }
            >
              <option value="forward">Drawing order</option>
              <option value="reverse">Reverse drawing order</option>
              <option value="snake">Snake / serpentine rows</option>
              <option value="columns">Column-major</option>
              <option value="column_snake">Column snake</option>
            </select>
          </label>
        </>
      ) : null}

      <label>
        Attribute preset
        <textarea
          rows={4}
          value={attributes}
          placeholder={"Sect=A\ngrave_type=Adult\nstatus=Available"}
          onChange={(event) => onChange({ attributes: event.target.value })}
        />
      </label>
    </div>
  );
}
