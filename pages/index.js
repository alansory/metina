export default function WelcomePage() {
  return (
    <div className="page">
      <div className="bg" aria-hidden="true" />

      <main className="center">
        <p className="badge">Welcome</p>

        <h1 className="title">
          <span className="gradient-text">Metina</span> Launch Monitor
        </h1>

        <p className="subtitle">
          Pantau pool token secara real-time. Mulai dengan membuka halaman monitor.
        </p>

        <a href="/monitor" className="button">
          Buka Monitor
        </a>
      </main>

      <div className="glow" aria-hidden="true" />

      <style jsx global>{`
  html, body, #__next { height: 100%; }
  body { margin: 0; background: #0b1020; color: #eef2ff; }
`}</style>

<style jsx>{`
  .page {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, 'Helvetica Neue', Arial;
  }

  /* Dusk sky: deep navy -> aubergine + warm orange glow kanan-atas */
  .bg {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(1200px 800px at 85% 0%, rgba(255, 120, 40, 0.20), transparent 60%),
      radial-gradient(1000px 700px at 15% 15%, rgba(204, 80, 255, 0.14), transparent 60%),
      linear-gradient(180deg, #0b1020 0%, #151430 40%, #241634 70%, #2d1630 100%);
    background-size: 140% 140%;
    animation: flow 22s ease-in-out infinite alternate;
    filter: saturate(110%) contrast(108%);
    z-index: -2;
  }

  @keyframes flow {
    0%   { background-position: 0% 50%, 100% 50%, 50% 0%; }
    50%  { background-position: 50% 0%, 50% 100%, 50% 50%; }
    100% { background-position: 100% 50%, 0% 50%, 50% 100%; }
  }

  .center {
    position: relative;
    min-height: 100vh;
    display: grid;
    place-items: center;
    text-align: center;
    padding: 24px;
  }

  /* Badge ungu-magentanya lembut */
  .badge {
    display: inline-block;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #f0e3ff;
    background: rgba(214, 107, 255, 0.12);
    border: 1px solid rgba(214, 107, 255, 0.28);
    border-radius: 999px;
    padding: 8px 12px;
    margin-bottom: 16px;
    backdrop-filter: blur(6px);
  }

  .title {
    margin: 0 0 10px 0;
    font-size: clamp(36px, 7vw, 72px);
    line-height: 1.05;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #ffffff;
  }

  /* Judul "Meteora" bisa diberi gradasi ungu -> oranye seperti di hero */
  .gradient-text {
    background: linear-gradient(90deg, #c26bff, #ff7a45, #ff5a1f);
    background-size: 300% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: hueShift 7s ease-in-out infinite;
  }

  @keyframes hueShift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  .subtitle {
    margin: 10px auto 24px;
    max-width: 720px;
    color: #d7dcff;
    opacity: 0.92;
    font-size: clamp(14px, 2.4vw, 18px);
  }

  /* Tombol oranye terang seperti screenshot */
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 18px;
    border-radius: 12px;
    background: linear-gradient(90deg, #ff6a00, #ff3d00);
    color: #ffffff;
    text-decoration: none;
    font-weight: 700;
    border: 1px solid rgba(255, 255, 255, 0.10);
    box-shadow:
      0 10px 28px rgba(255, 98, 0, 0.28),
      0 6px 20px rgba(255, 61, 0, 0.18);
    transition: transform 0.18s ease, box-shadow 0.2s ease, filter 0.2s ease;
  }
  .button:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
    box-shadow:
      0 14px 36px rgba(255, 98, 0, 0.36),
      0 10px 30px rgba(255, 61, 0, 0.24);
  }

  /* Glow hangat di bawah horizon */
  .glow {
    position: fixed;
    inset: auto 0 0 0;
    height: 140px;
    background: radial-gradient(60% 80% at 50% 0%, rgba(255, 120, 40, 0.22), transparent 70%);
    z-index: -1;
  }
`}</style>
    </div>
  );
}