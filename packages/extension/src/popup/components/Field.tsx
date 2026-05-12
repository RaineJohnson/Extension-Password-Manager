import { InputHTMLAttributes, useId } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string;
}

export function Field({ label, error, hint, id, ...input }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  const invalid = Boolean(error);

  return (
    <label htmlFor={inputId} style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 4 }}>
        {label}
      </span>
      <input
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...input}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 14,
          border: `1px solid ${invalid ? '#b00' : '#ccc'}`,
          borderRadius: 4,
          boxSizing: 'border-box',
          ...input.style,
        }}
      />
      {error ? (
        <span
          id={`${inputId}-error`}
          role="alert"
          style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#b00' }}
        >
          {error}
        </span>
      ) : hint ? (
        <span
          id={`${inputId}-hint`}
          style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#666' }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}
