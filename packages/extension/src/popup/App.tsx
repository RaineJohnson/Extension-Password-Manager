import { useEffect, useState } from 'react';
import { sendMessage } from '../shared/messages';

export function App() {
  const [pong, setPong] = useState<number | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const ping = await sendMessage({ type: 'ping' });
        setPong(ping.receivedAt);
        const status = await sendMessage({ type: 'getStatus' });
        setLocked(status.locked);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <main style={{ width: 320, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>Password Manager</h1>
      {error ? (
        <p style={{ marginTop: 8, fontSize: 13, color: '#b00' }}>Error: {error}</p>
      ) : (
        <p style={{ marginTop: 8, fontSize: 13, color: '#555' }}>
          {pong === null ? 'Pinging background…' : `Background pong @ ${pong}`}
          <br />
          {locked === null ? '' : `Vault: ${locked ? 'locked' : 'unlocked'}`}
        </p>
      )}
    </main>
  );
}
