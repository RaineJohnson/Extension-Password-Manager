import { FormEvent, useState } from 'react';
import { ApiError, sendMessage } from '../../shared/messages';
import { Field } from '../components/Field';
import {
  scorePassword,
  validateConfirmPassword,
  validateEmail,
  validateMasterPassword,
} from '../validation';

interface RegisterProps {
  onRegistered: () => void;
  onSwitchToLogin: () => void;
}

const STRENGTH_COPY = {
  weak: { label: 'Weak', color: '#b00', width: '33%' },
  fair: { label: 'Fair', color: '#c87a00', width: '66%' },
  strong: { label: 'Strong', color: '#1f7a1f', width: '100%' },
} as const;

export function Register({ onRegistered, onSwitchToLogin }: RegisterProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({
    email: false,
    password: false,
    confirm: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailError = touched.email ? validateEmail(email) : null;
  const passwordError = touched.password ? validateMasterPassword(password) : null;
  const confirmError = touched.confirm
    ? validateConfirmPassword(password, confirm)
    : null;
  const strength = scorePassword(password);
  const strengthCopy = STRENGTH_COPY[strength];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ email: true, password: true, confirm: true });
    setFormError(null);

    if (
      validateEmail(email) ||
      validateMasterPassword(password) ||
      validateConfirmPassword(password, confirm)
    ) {
      return;
    }

    setSubmitting(true);
    try {
      await sendMessage({ type: 'auth/register', email, password });
      onRegistered();
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
      <h1 style={{ margin: 0, fontSize: 18 }}>Create your vault</h1>
      <p style={{ marginTop: 4, marginBottom: 16, fontSize: 13, color: '#555' }}>
        Your master password is never sent to the server. If you forget it,
        your data is gone — there's no recovery.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          disabled={submitting}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={emailError}
        />

        <Field
          label="Master password"
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={submitting}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
          hint="At least 12 characters. Use a passphrase you can remember."
        />

        {password.length > 0 ? (
          <div style={{ marginTop: -4, marginBottom: 12 }}>
            <div
              style={{
                height: 4,
                background: '#eee',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                role="progressbar"
                aria-label="Password strength"
                aria-valuetext={strengthCopy.label}
                style={{
                  width: strengthCopy.width,
                  height: '100%',
                  background: strengthCopy.color,
                  transition: 'width 120ms ease',
                }}
              />
            </div>
            <span
              style={{
                display: 'block',
                marginTop: 4,
                fontSize: 12,
                color: strengthCopy.color,
              }}
            >
              {strengthCopy.label}
            </span>
          </div>
        ) : null}

        <Field
          label="Confirm master password"
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

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
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
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p style={{ marginTop: 16, fontSize: 13, color: '#555', textAlign: 'center' }}>
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          disabled={submitting}
          style={{
            background: 'none',
            border: 'none',
            color: '#2c5fb3',
            textDecoration: 'underline',
            cursor: 'pointer',
            font: 'inherit',
            padding: 0,
          }}
        >
          Sign in
        </button>
      </p>
    </main>
  );
}
