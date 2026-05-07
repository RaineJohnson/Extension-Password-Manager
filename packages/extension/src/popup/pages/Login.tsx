import { FormEvent, useState } from 'react';
import { ApiError, getApiClient } from '../../api';
import { Field } from '../components/Field';
import { validateEmail, validateMasterPassword } from '../validation';

interface LoginProps {
  onAuthenticated: () => void;
  onSwitchToRegister: () => void;
}

export function Login({ onAuthenticated, onSwitchToRegister }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailError = touched.email ? validateEmail(email) : null;
  const passwordError = touched.password ? validateMasterPassword(password) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    setFormError(null);

    if (validateEmail(email) || validateMasterPassword(password)) return;

    setSubmitting(true);
    try {
      await getApiClient().login(email, password);
      onAuthenticated();
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
      <h1 style={{ margin: 0, fontSize: 18 }}>Unlock vault</h1>
      <p style={{ marginTop: 4, marginBottom: 16, fontSize: 13, color: '#555' }}>
        Sign in with your email and master password.
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
          autoComplete="current-password"
          value={password}
          disabled={submitting}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
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
          {submitting ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>

      <p style={{ marginTop: 16, fontSize: 13, color: '#555', textAlign: 'center' }}>
        New here?{' '}
        <button
          type="button"
          onClick={onSwitchToRegister}
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
          Create an account
        </button>
      </p>
    </main>
  );
}
