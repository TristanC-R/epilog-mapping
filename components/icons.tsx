type IconProps = {
  className?: string;
};

const defaults = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function IconPan(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />
    </svg>
  );
}

export function IconSelect(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M5 3l6.5 17 2.2-6.3L20 11.5 5 3z" />
    </svg>
  );
}

export function IconMove(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M12 2v20M8 6l4-4 4 4M8 18l4 4 4-4M2 12h20M6 8l-4 4 4 4M18 8l4 4-4 4" />
    </svg>
  );
}

export function IconDrawGrave(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <rect x="6" y="5" width="12" height="14" rx="1" />
      <path d="M9 9h6M9 12h6M9 15h4" />
    </svg>
  );
}

export function IconDrawBase(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M4 18L8 6l5 8 3-5 4 9H4z" />
    </svg>
  );
}

export function IconRowCount(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M4 17c4-8 12-8 16 0" />
      <rect x="5" y="9" width="3.2" height="5" />
      <rect x="10.4" y="8" width="3.2" height="5" />
      <rect x="15.8" y="9" width="3.2" height="5" />
    </svg>
  );
}

export function IconRowSize(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 16c5-6 13-6 18 0" />
      <path d="M6 11v5M12 9v7M18 11v5" />
    </svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M4 12h16M12 4v16" />
    </svg>
  );
}

export function IconNumber(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M5 19V5M5 5h5.5a3 3 0 010 6H5" />
      <path d="M14 19l3.5-14L21 19M15.2 14h4.6" />
    </svg>
  );
}

export function IconFreehand(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 17c3-8 5 3 8-5s4 6 10-4" />
      <path d="M17 5h4v4" />
    </svg>
  );
}

export function IconContinue(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 15c5-6 10-6 15-1" />
      <path d="M15 10l4 4-4 4" />
      <rect x="4" y="8" width="3" height="5" />
      <rect x="9" y="7" width="3" height="5" />
    </svg>
  );
}

export function IconRegenerate(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M20 7V3l-3 3a8 8 0 10 2 9" />
      <path d="M8 9h8v7H8z" />
    </svg>
  );
}

export function IconBatch(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <path d="M7 4v6M12 9v6M17 14v6" />
    </svg>
  );
}

export function IconReference(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M9 7H7a5 5 0 000 10h3M15 7h2a5 5 0 010 10h-3M8 12h8" />
    </svg>
  );
}

export function IconDuplicates(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <rect x="4" y="4" width="11" height="11" />
      <rect x="9" y="9" width="11" height="11" />
    </svg>
  );
}

export function IconQuality(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M12 3l8 3v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3z" />
      <path d="M8.5 12l2.2 2.2 4.8-5" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  );
}

export function IconExport(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M12 4v10M8 8l4-4 4 4M5 15v4h14v-4" />
    </svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M9 7L4 12l5 5" />
      <path d="M5 12h8a6 6 0 016 6" />
    </svg>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M15 7l5 5-5 5" />
      <path d="M19 12h-8a6 6 0 00-6 6" />
    </svg>
  );
}

export function IconMeasure(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 14.5L14.5 3l6.5 6.5L9.5 21 3 14.5z" />
      <path d="M8 9.5l2 2M11 6.5l2 2M14.5 12l2 2M11.5 15l2 2" />
    </svg>
  );
}

export function IconBox(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path
        d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"
        strokeDasharray="0"
      />
      <rect x="9" y="9" width="6" height="6" />
    </svg>
  );
}

export function IconRect(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <rect x="3.5" y="6.5" width="17" height="11" />
      <path d="M3.5 6.5h3M17.5 17.5h3" />
    </svg>
  );
}

export function IconCircle(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12l5.6 5.6" />
    </svg>
  );
}

export function IconRotate(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M4 12a8 8 0 108-8" />
      <path d="M12 1l3 3-3 3" />
      <rect x="9" y="9" width="6" height="6" />
    </svg>
  );
}

export function IconSplit(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 21L21 3" />
      <path d="M5 6h6v6H5zM13 13h6v6h-6z" />
    </svg>
  );
}

export function IconMerge(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M4 6h7v12H4zM13 6h7v12h-7z" />
      <path d="M11 12h2" />
    </svg>
  );
}

export function IconVertices(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M5 6l13 3-4 10L5 6z" />
      <circle cx="5" cy="6" r="1.8" />
      <circle cx="18" cy="9" r="1.8" />
      <circle cx="14" cy="19" r="1.8" />
    </svg>
  );
}

export function IconAddFeature(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M4 18l3-11 7 2 4 9H4z" />
      <path d="M18 3v8M14 7h8" />
    </svg>
  );
}

export function IconAddRing(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 18L6 5l12 2 3 11H3z" />
      <path d="M9 14a3 3 0 116 0 3 3 0 01-6 0z" />
      <path d="M18 2v5M15.5 4.5h5" />
    </svg>
  );
}

export function IconDeleteRing(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 18L6 5l12 2 3 11H3z" />
      <path d="M9 14a3 3 0 116 0 3 3 0 01-6 0z" />
      <path d="M16 3l5 5M21 3l-5 5" />
    </svg>
  );
}

export function IconAddPart(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 17l3-8 7 2 2 6H3zM15 13l2-5 4 1v4h-6z" />
      <path d="M18 2v6M15 5h6" />
    </svg>
  );
}

export function IconDeletePart(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 17l3-8 7 2 2 6H3zM15 13l2-5 4 1v4h-6z" />
      <path d="M16 2l5 5M21 2l-5 5" />
    </svg>
  );
}

export function IconSimplify(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 17l3-9 3 5 3-8 4 9 5-7" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconOffset(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <path d="M3 8c5-5 13-5 18 0M3 16c5-5 13-5 18 0" />
      <path d="M17 12h4M19 10v4" />
    </svg>
  );
}

export function IconDuplicate(props: IconProps) {
  return (
    <svg {...defaults} className={props.className}>
      <rect x="5" y="5" width="10" height="12" />
      <path d="M9 3h10v12M10 11h5M12.5 8.5v5" />
    </svg>
  );
}
