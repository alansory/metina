import { useState } from 'react';

export default function HomePage() {
  const [mint, setMint] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [monitoringStatus, setMonitoringStatus] = useState('');

async function handleSubmit(e) {
  e.preventDefault();
  setLoading(true);
  setError('');
  setResult(null);
  
  try {
    console.log('Starting real-time monitoring...');
    const res = await fetch('/api/meteora/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        mint, 
        waitUntilLaunched: true, // Enable real-time monitoring
        timeoutSeconds: 300, // 5 minutes
        intervalMs: 2000, // Check every 2 seconds
        solAmount: 0.1, // 0.1 SOL
        tokenAmount: 0.1 // 0.1 token
      }),
      cache: 'no-store'
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    
    setResult(data);
    
    if (data.success) {
      console.log('🎉 Success! Pool found and position opened!');
    } else {
      console.log('⏳ Monitoring completed but no pool found');
    }
  } catch (err) {
    setError(err.message || 'Unknown error');
  } finally {
    setLoading(false);
  }
}

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1>Meteora DAMM v2 Real-time Launcher</h1>
      <p>Monitor token launch secara real-time dan otomatis buka posisi dengan 0.1 SOL saat pool tersedia.</p>
      
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Token Mint (Solana):
          <input
            type="text"
            value={mint}
            onChange={(e) => setMint(e.target.value.trim())}
            placeholder="Contoh: LYLikzBQtpa9ZgVrJsqYGQpR3cC1WMJrBHaXGrQmeta"
            style={{ width: '100%', padding: 10 }}
            required
          />
        </label>
        <button type="submit" disabled={loading} style={{ padding: '10px 16px' }}>
          {loading ? 'Monitoring Real-time...' : 'Start Real-time Monitoring'}
        </button>
      </form>

      {monitoringStatus && (
        <div style={{ marginTop: 16, padding: 12, background: '#f3f4f6', borderRadius: 8 }}>
          <strong>Status:</strong> {monitoringStatus}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 16, color: '#b91c1c' }}>Error: {error}</div>
      )}

      {result && (
        <div style={{ marginTop: 16 }}>
          <h3>Hasil Monitoring</h3>
          <div style={{ marginBottom: 8 }}>
            <strong>Status:</strong> {result.success ? '✅ Berhasil' : '⏳ Tidak ditemukan'}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Attempts:</strong> {result.attempts}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Monitoring Time:</strong> {result.monitoringTime}
          </div>
          <pre style={{ background: '#111827', color: 'white', padding: 12, overflow: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}