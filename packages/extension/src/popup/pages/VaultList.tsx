import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { PopupVaultItem } from '../../shared/messages';

interface VaultListProps {
  items: PopupVaultItem[];
  loadError?: string | null;
  onAdd: () => void;
  onEdit: (item: PopupVaultItem) => void;
  onDelete: (id: string) => void;
  onLock: () => void;
  onChangePassword: () => void;
}

function ensureUrl(site: string): string {
  if (/^https?:\/\//i.test(site)) return site;
  return `https://${site}`;
}

export function VaultList({
  items,
  loadError,
  onAdd,
  onEdit,
  onDelete,
  onLock,
  onChangePassword,
}: VaultListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const filtered =
    needle.length === 0
      ? items
      : items.filter(
          (i) =>
            i.site.toLowerCase().includes(needle) ||
            i.username.toLowerCase().includes(needle),
        );

  async function handleCopy(item: PopupVaultItem) {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(item.password);
      setCopiedId(item.id);
      window.setTimeout(() => {
        setCopiedId((id) => (id === item.id ? null : id));
      }, 1500);
    } catch {
      setCopyError('Clipboard is unavailable.');
    }
  }

  function handleOpen(item: PopupVaultItem) {
    window.open(ensureUrl(item.site), '_blank', 'noopener,noreferrer');
  }

  function handleDelete(item: PopupVaultItem) {
    if (window.confirm(`Delete the entry for ${item.site}?`)) {
      onDelete(item.id);
    }
  }

  return (
    <main style={{ width: 360, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>Vault</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={onChangePassword} style={subtleBtn}>
            Change password
          </button>
          <button type="button" onClick={onLock} style={subtleBtn}>
            Lock
          </button>
        </div>
      </header>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by site or username"
        aria-label="Search vault"
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 14,
          border: '1px solid #ccc',
          borderRadius: 4,
          boxSizing: 'border-box',
          marginBottom: 12,
        }}
      />

      {loadError ? (
        <p
          role="alert"
          style={{
            margin: '0 0 8px',
            padding: '6px 8px',
            fontSize: 12,
            color: '#b00',
            background: '#fdecec',
            border: '1px solid #f3c2c2',
            borderRadius: 4,
          }}
        >
          {loadError}
        </p>
      ) : null}

      {copyError ? (
        <p
          role="alert"
          style={{
            margin: '0 0 8px',
            padding: '6px 8px',
            fontSize: 12,
            color: '#b00',
            background: '#fdecec',
            border: '1px solid #f3c2c2',
            borderRadius: 4,
          }}
        >
          {copyError}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: '#666',
            textAlign: 'center',
            margin: '24px 0',
          }}
        >
          {items.length === 0
            ? 'Your vault is empty. Add your first entry below.'
            : 'No matches.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {filtered.map((item) => (
            <li
              key={item.id}
              style={{
                padding: '10px 12px',
                marginBottom: 8,
                border: '1px solid #e5e5e5',
                borderRadius: 4,
                background: '#fafafa',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#222',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.site}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#666',
                  marginBottom: 8,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.username}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleCopy(item)}
                  aria-label={`Copy password for ${item.site}`}
                  style={actionBtn}
                >
                  {copiedId === item.id ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpen(item)}
                  aria-label={`Open ${item.site}`}
                  style={actionBtn}
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  aria-label={`Edit ${item.site}`}
                  style={actionBtn}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  aria-label={`Delete ${item.site}`}
                  style={{ ...actionBtn, color: '#b00', borderColor: '#f3c2c2' }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onAdd}
        style={{
          width: '100%',
          marginTop: 8,
          padding: '10px 12px',
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          background: '#2c5fb3',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Add item
      </button>
    </main>
  );
}

const subtleBtn: CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  border: '1px solid #ccc',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
};

const actionBtn: CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid #ccc',
  borderRadius: 3,
  background: '#fff',
  cursor: 'pointer',
};
