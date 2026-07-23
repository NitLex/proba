import { currencyOptions } from '../currencies';

const currencyOptionsCached = currencyOptions();

export function Metric({ label, value, tone }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${tone || ''}`}>{value}</div>
    </div>
  );
}

export function Modal({ title, children, onClose, className = '' }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${className}`.trim()} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

/** Circle with «?» — hover/focus shows tooltip text. */
export function HelpTip({ text }) {
  if (!text) return null;
  return (
    <span className="help-tip" tabIndex={0} aria-label={text}>
      <span className="help-tip-mark" aria-hidden="true">
        ?
      </span>
      <span className="help-tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

export function LabelWithHint({ children, hint }) {
  return (
    <span className="label-with-hint">
      {children}
      <HelpTip text={hint} />
    </span>
  );
}

export function CurrencySelect({ value, onChange, className = 'select', id }) {
  const { popular, rest } = currencyOptionsCached;
  const current = value || 'USD';
  const known = new Set([...popular, ...rest].map((c) => c.code));

  return (
    <select
      id={id}
      className={className}
      value={current}
      onChange={(e) => onChange(e.target.value)}
    >
      {!known.has(current) ? <option value={current}>{current} (текущая)</option> : null}
      <optgroup label="Популярные">
        {popular.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Все валюты">
        {rest.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
