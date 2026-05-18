import { FormEvent, useState } from 'react';
import { ApiError, sendMessage } from '../../shared/messages';
import { Field } from '../components/Field';
import {
  validateConfirmPassword,
  validateMasterPassword,
} from '../validation';

interface ChangePasswordProps {
  onChanged: () => void;
  onCancel: () => void;
}

export function ChangePassword({ onChanged, onCancel }: ChangePasswordProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const currentError =
    touched.current && current.length === 0
      ? 'Current master password is required.'
      : null;
  const nextError = touched.next ? validateMasterPassword(next) : null;
  const confirmError = touched.confirm
    ? validateConfirmPassword(next, confirm)
    : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ current: true, next: true, confirm: true });
    setFormError(null);
    if (
      current.length === 0 ||
      validateMasterPassword(next) ||
      validateConfirmPassword(next, confirm)
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await sendMessage({ type: 'auth/changePassword', current, next });
      onChanged();
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ width: 320, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>Change master password</h1>
      <p style={{ marginTop: 4, marginBottom: 16, fontSize: 13, color: '#555' }}>
        Your vault key is re-wrapped under the new master password. Existing
        items stay encrypted under the same vault key.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Current master password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={current}
          disabled={submitting}
          onChange={(e) => setCurrent(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, current: true }))}
          error={currentError}
        />
        <Field
          label="New master password"
          type="password"
          autoComplete="new-password"
          value={next}
          disabled={submitting}
          onChange={(e) => setNext(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, next: true }))}
          error={nextError}
        />
        <Field
          label="Confirm new master password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          disabled={submitting}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={confirmError}
        />

        {formError ? (
          <p
            role="alert"
            style={{
              marginTop: 0,
              marginBottom: 12,
              padding: '8px 10px',
              fontSize: 13,
              color: '#b00',
              background: '#fdecec',
              border: '1px solid #f3c2c2',
              borderRadius: 4,
            }}
          >
            {formError}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              flex: 1,
              padding: '10px 12px',
              fontSize: 14,
              background: '#fff',
              border: '1px solid #ccc',
              borderRadius: 4,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 2,
              padding: '10px 12px',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: submitting ? '#7a7a7a' : '#2c5fb3',
              border: 'none',
              borderRadius: 4,
              cursor: submitting ? 'progress' : 'pointer',
            }}
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </main>
  );
}
