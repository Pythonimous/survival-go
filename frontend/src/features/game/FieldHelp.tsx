import { useId, useState } from "react";

type FieldHelpProps = {
  fieldName: string;
  hint: string;
  detail: string;
};

export default function FieldHelp({ fieldName, hint, detail }: FieldHelpProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <div className="field-help">
      <p className="field-help__hint">{hint}</p>
      <button
        type="button"
        className="field-help__trigger"
        aria-label={`More information about ${fieldName}`}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <div className="field-help__overlay" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="field-help__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={titleId}>{fieldName}</h3>
            <p>{detail}</p>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
