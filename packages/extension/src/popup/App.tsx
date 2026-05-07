import { useState } from 'react';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

type View = 'login' | 'register' | 'authenticated';

export function App() {
  const [view, setView] = useState<View>('login');

  if (view === 'register') {
    return (
      <Register
        onRegistered={() => setView('login')}
        onSwitchToLogin={() => setView('login')}
      />
    );
  }

  if (view === 'authenticated') {
    return (
      <main style={{ width: 320, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Vault</h1>
        <p style={{ marginTop: 8, fontSize: 13, color: '#555' }}>
          Signed in. Vault list lands here next.
        </p>
        <button
          type="button"
          onClick={() => setView('login')}
          style={{
            marginTop: 12,
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid #ccc',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Lock
        </button>
      </main>
    );
  }

  return (
    <Login
      onAuthenticated={() => setView('authenticated')}
      onSwitchToRegister={() => setView('register')}
    />
  );
}
