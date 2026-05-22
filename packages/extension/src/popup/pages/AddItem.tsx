import { FormEvent, useState } from 'react';
import type { CSSProperties } from 'react';
import { ApiError, sendMessage, type PopupVaultItem } from '../../shared/messages';
import { Field } from '../components/Field';

interface AddItemProps {
  mode: 'add' | 'edit';
  initialItem?: PopupVaultItem;
  onSaved: (item: PopupVaultItem) => void;
  onCancel: () => void;
}

const PASSWORD_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';

function generatePassword(length: number): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    out += PASSWORD_ALPHABET.charAt(byte % PASSWORD_ALPHABET.length);
  }
  return out;
}

export function AddItem({ mode, initialItem, onSaved, onCancel }: AddItemProps) {
  const [site, setSite] = useState(initialItem?.site ?? '');
  const [username, setUsername] = useState(initialItem?.username ?? '');
  const [password, setPassword] = useState(initialItem?.password ?? '');
  const [notes, setNotes] = useState(initialItem?.notes ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({
    site: false,
    username: false,
    password: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const siteError =
    touched.site && site.trim().length === 0 ? 'Site is required.' : null;
  const usernameError =
    touched.username && username.trim().length === 0
      ? 'Username is required.'
      : null;
  const passwordError =
    touched.password && password.length === 0 ? 'Password is required.' : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ site: true, username: true, password: true });
    setFormError(null);
    if (
      site.trim().length === 0 ||
      username.trim().length === 0 ||
      password.length === 0
    ) {
      return;
    }

    const trimmedNotes = notes.trim();
    const payload = {
      site: site.trim(),
      username: username.trim(),
      password,
      ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
    };

    setSubmitting(true);
    try {
      const res =
        mode === 'edit' && initialItem !== undefined
          ? await sendMessage({ type: 'vault/update', id: initialItem.id, ...payload })
          : await sendMessage({ type: 'vault/create', ...payload });
      onSaved(res.item);
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
    <main style={{ width: 360, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>
        {mode === 'edit' ? 'Edit item' : 'Add item'}
      </h1>
      <p style={{ marginTop: 4, marginBottom: 16, fontSize: 13, color: '#555' }}>
        Username, password, and notes are encrypted on this device before saving.
        Only the site is sent in the clear.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Site"
          autoFocus
          autoComplete="off"
          value={site}
          disabled={submitting}
          onChange={(e) => setSite(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, site: true }))}
          error={siteError}
          hint="e.g. github.com"
        />

        <Field
          label="Username"
          autoComplete="off"
          value={username}
          disabled={submitting}
          onChange={(e) => setUsername(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, username: true }))}
          error={usernameError}
        />

        <Field
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="off"
          value={password}
          disabled={submitting}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: -4, marginBottom: 12 }}>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setPassword(generatePassword(20));
              setShowPassword(true);
              setTouched((t) => ({ ...t, password: true }));
            }}
            style={inlineBtn}
          >
            Generate
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setShowPassword((v) => !v)}
            style={inlineBtn}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span
            style={{
              display: 'block',
              fontSize: 12,
              color: '#444',
              marginBottom: 4,
            }}
          >
            Notes
          </span>
          <textarea
            value={notes}
            disabled={submitting}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 14,
              border: '1px solid #ccc',
              borderRadius: 4,
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </label>

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
            {submitting
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save changes'
                : 'Save item'}
          </button>
        </div>
      </form>
    </main>
  );
}

const inlineBtn: CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid #ccc',
  borderRadius: 3,
  background: '#fff',
  cursor: 'pointer',
};
