import { useEffect, useState } from 'react';
import {
  ApiError,
  sendMessage,
  type PopupVaultItem,
} from '../shared/messages';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { VaultList } from './pages/VaultList';
import { AddItem } from './pages/AddItem';
import { ChangePassword } from './pages/ChangePassword';

type View =
  | 'login'
  | 'register'
  | 'vault'
  | 'addItem'
  | 'editItem'
  | 'changePassword';

export function App() {
  const [view, setView] = useState<View>('login');
  const [items, setItems] = useState<PopupVaultItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  // On popup open, ask the SW whether the vault is already unlocked. If
  // it is (e.g. user closed the popup and reopened it within the same
  // browser session), skip straight to the vault.
  useEffect(() => {
    let cancelled = false;
    void sendMessage({ type: 'getStatus' }).then(
      (res) => {
        if (cancelled) return;
        if (!res.locked) setView('vault');
        setBootstrapped(true);
      },
      () => {
        if (!cancelled) setBootstrapped(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Whenever we (re)enter the vault view, load items from the SW.
  useEffect(() => {
    if (view !== 'vault') {
      setItemsLoaded(false);
      return;
    }
    let cancelled = false;
    setVaultError(null);
    void sendMessage({ type: 'vault/list' }).then(
      (res) => {
        if (cancelled) return;
        setItems(res.items);
        setItemsLoaded(true);
      },
      (e) => {
        if (cancelled) return;
        if (
          e instanceof ApiError &&
          (e.code === 'UNAUTHORIZED' || e.code === 'LOCKED')
        ) {
          setItems([]);
          setView('login');
          return;
        }
        setVaultError(
          e instanceof Error ? e.message : 'Failed to load your vault.',
        );
        setItemsLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [view]);

  const editingItem =
    editingId !== null ? items.find((i) => i.id === editingId) : undefined;

  async function handleLock() {
    try {
      await sendMessage({ type: 'auth/lock' });
    } catch {
      // Failure here is not catastrophic — falling through to login is
      // the safe default even if the SW didn't acknowledge.
    }
    setItems([]);
    setView('login');
  }

  async function handleDelete(id: string) {
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await sendMessage({ type: 'vault/delete', id });
    } catch (e) {
      setItems(previous);
      if (
        e instanceof ApiError &&
        (e.code === 'UNAUTHORIZED' || e.code === 'LOCKED')
      ) {
        setView('login');
        return;
      }
      setVaultError(
        e instanceof ApiError ? e.message : 'Failed to delete the entry.',
      );
    }
  }

  if (!bootstrapped) {
    return (
      <main
        style={{
          width: 320,
          padding: 16,
          fontFamily: 'system-ui, sans-serif',
          color: '#555',
          fontSize: 13,
        }}
      >
        Loading…
      </main>
    );
  }

  if (view === 'login') {
    return (
      <Login
        onAuthenticated={() => setView('vault')}
        onSwitchToRegister={() => setView('register')}
      />
    );
  }

  if (view === 'register') {
    return (
      <Register
        onRegistered={() => setView('login')}
        onSwitchToLogin={() => setView('login')}
      />
    );
  }

  if (view === 'addItem' || view === 'editItem') {
    const isEdit = view === 'editItem';
    return (
      <AddItem
        mode={isEdit ? 'edit' : 'add'}
        initialItem={isEdit ? editingItem : undefined}
        onSaved={(item) => {
          setItems((prev) =>
            isEdit
              ? prev.map((existing) =>
                  existing.id === item.id ? item : existing,
                )
              : [...prev, item],
          );
          setEditingId(null);
          setView('vault');
        }}
        onCancel={() => {
          setEditingId(null);
          setView('vault');
        }}
      />
    );
  }

  if (view === 'changePassword') {
    return (
      <ChangePassword
        // SW locks the vault on success, so route to login afterwards.
        onChanged={() => {
          setItems([]);
          setView('login');
        }}
        onCancel={() => setView('vault')}
      />
    );
  }

  if (!itemsLoaded) {
    return (
      <main
        style={{
          width: 320,
          padding: 16,
          fontFamily: 'system-ui, sans-serif',
          color: '#555',
          fontSize: 13,
        }}
      >
        Loading vault…
      </main>
    );
  }

  return (
    <VaultList
      items={items}
      loadError={vaultError}
      onAdd={() => setView('addItem')}
      onEdit={(item) => {
        setEditingId(item.id);
        setView('editItem');
      }}
      onDelete={handleDelete}
      onLock={handleLock}
      onChangePassword={() => setView('changePassword')}
    />
  );
}
