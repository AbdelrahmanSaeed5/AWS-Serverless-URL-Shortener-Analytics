import { useEffect, useRef, useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { QRCodeCanvas } from 'qrcode.react';
import './App.css';

const API = import.meta.env.VITE_API_BASE_URL;

async function apiRequest(path, options = {}) {
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new Error('Your session expired. Please sign in again.');

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
  return data;
}

function Dashboard({ user, signOut }) {
  const [url, setUrl] = useState('');
  const [links, setLinks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [busyCode, setBusyCode] = useState(null);
  const [latest, setLatest] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const qrRef = useRef(null);

  const active = links.find((link) => link.shortCode === selected) || latest;
  const shortUrl = active ? `${API}/r/${active.shortCode}` : '';
  const totalClicks = links.reduce((sum, link) => sum + Number(link.totalClicks || 0), 0);
  const activeCount = links.filter((link) => link.isActive).length;

  async function loadLinks() {
    try {
      setError('');
      const data = await apiRequest('/links');
      setLinks(data.links || []);
      setHasMore(!!data.hasMore);
      setSelected((current) => current || data.links?.[0]?.shortCode || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLinks();
  }, []);

  async function loadStats(code) {
    if (!code) return;
    setLoadingStats(true);
    try {
      const data = await apiRequest(`/links/${encodeURIComponent(code)}/stats`);
      setStats(data);
      setLinks((old) => old.map((item) => item.shortCode === code ? data.link : item));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    setStats(null);
    if (selected) loadStats(selected);
  }, [selected]);

  async function createLink(event) {
    event.preventDefault();
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const link = await apiRequest('/links', {
        method: 'POST',
        body: JSON.stringify({ originalUrl: url.trim() }),
      });
      setLinks((old) => [link, ...old.filter((x) => x.shortCode !== link.shortCode)]);
      setLatest(link);
      setSelected(link.shortCode);
      setUrl('');
      setNotice('Your new short link is ready!');
      if (selected === link.shortCode) loadStats(link.shortCode);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copied to clipboard!');
    } catch {
      setError('Copy failed. Please copy the URL manually.');
    }
  }

  async function toggle(link) {
    setBusyCode(link.shortCode);
    setError('');
    try {
      const data = await apiRequest(`/links/${encodeURIComponent(link.shortCode)}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !link.isActive }),
      });
      setLinks((old) => old.map((x) => x.shortCode === link.shortCode ? data.link : x));
      if (selected === link.shortCode) setStats((old) => old ? { ...old, link: data.link } : old);
      setNotice(data.link.isActive ? 'Link activated.' : 'Link deactivated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyCode(null);
    }
  }

  function downloadQr() {
    const canvas = qrRef.current;
    if (!canvas || !active) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `linkforge-${active.shortCode}.png`;
    a.click();
  }

  const daily = stats?.link?.shortCode === selected ? stats.dailyClicks || [] : [];
  const peak = Math.max(1, ...daily.map((d) => Number(d.clicks || 0)));

  return (
    <div className="page">
      <header className="header">
        <div className="logo"><span className="logo-icon">↗</span> LinkForge <span className="logo-pill">CLOUD</span></div>
        <div className="header-user"><span className="user-name">{user?.signInDetails?.loginId || user?.username}</span><button className="btn ghost small" onClick={signOut}>Sign out</button></div>
      </header>

      <main className="shell">
        <section className="welcome">
          <span className="eyebrow">SERVERLESS LINK INTELLIGENCE</span>
          <h1>Every link. One dashboard.</h1>
          <p>Create, manage, and measure your short links with AWS.</p>
        </section>

        <section className="create-card">
          <div className="section-header"><div><h2>Create a short link</h2><p>Paste a long URL and we'll handle the rest.</p></div><span className="card-mark">⚡</span></div>
          <form onSubmit={createLink} className="create-form">
            <input type="url" aria-label="Long URL" placeholder="https://example.com/your-long-url" value={url} onChange={(event) => setUrl(event.target.value)} required />
            <button className="btn primary" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Shorten URL →'}</button>
          </form>
          {notice && <div className="notice" role="status">✓ {notice}</div>}
          {error && <div className="error" role="alert">{error}</div>}
        </section>

        <section className="stat-grid" aria-label="Dashboard summary">
          <div className="metric"><span className="metric-label">TOTAL LINKS</span><strong>{links.length}{hasMore ? '+' : ''}</strong><span className="metric-hint">Created in your account</span></div>
          <div className="metric"><span className="metric-label">TOTAL CLICKS</span><strong>{totalClicks.toLocaleString()}{hasMore ? '+' : ''}</strong><span className="metric-hint">Across loaded links</span></div>
          <div className="metric"><span className="metric-label">ACTIVE LINKS</span><strong>{activeCount}{hasMore ? '+' : ''}</strong><span className="metric-hint">Currently enabled</span></div>
        </section>

        <section className="dashboard-grid">
          <div className="card links-card">
            <div className="section-header"><div><h2>Your links</h2><p>Choose a link to view analytics.</p></div><button className="btn ghost small" onClick={loadLinks}>↻ Refresh</button></div>
            {loading ? <p className="empty">Loading your links...</p> : links.length === 0 ? <p className="empty">No links yet. Create your first one above!</p> : (
              <div className="links-list">
                {links.map((link) => (
                  <div key={link.shortCode} className={`link-entry ${selected === link.shortCode ? 'chosen' : ''}`}>
                    <button className="link-select" onClick={() => { setSelected(link.shortCode); setNotice(''); }}>
                      <span className="link-code">↗ /r/{link.shortCode}</span>
                      <span className="link-destination" title={link.originalUrl}>{link.originalUrl}</span>
                      <span className="link-meta"><span className={link.isActive ? 'dot live' : 'dot'}></span>{link.isActive ? 'Active' : 'Inactive'} · {Number(link.totalClicks).toLocaleString()} clicks</span>
                    </button>
                    <div className="link-actions">
                      <button className="btn ghost small" onClick={() => copy(`${API}/r/${link.shortCode}`)}>Copy</button>
                      <button className="btn ghost small" disabled={busyCode === link.shortCode} onClick={() => toggle(link)}>{link.isActive ? 'Disable' : 'Enable'}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {hasMore && <p className="more-hint">Showing the newest 100 links. Pagination will be added in a future update.</p>}
          </div>

          <div className="side-column">
            <div className="card analytics-card">
              <div className="section-header"><div><h2>Link analytics</h2><p>Last seven days (UTC)</p></div><button className="btn ghost small" disabled={!selected || loadingStats} onClick={() => loadStats(selected)}>↻</button></div>
              {!active ? <p className="empty">Select a link to see statistics.</p> : <>
                <div className="selected-link"><a href={shortUrl} target="_blank" rel="noreferrer">{shortUrl}</a><span className="status">{active.isActive ? '● Active' : '○ Disabled'}</span></div>
                <div className="analytics-total"><strong>{(stats?.link?.shortCode === selected ? stats.link.totalClicks : active.totalClicks).toLocaleString()}</strong><span>total clicks</span></div>
                <div className="bar-chart" aria-label="Daily clicks chart">
                  {daily.map((d) => <div className="bar-column" key={d.date} title={`${d.date}: ${d.clicks} clicks`}><span className="bar-num">{d.clicks}</span><div className="bar-track"><div className="bar" style={{ height: `${Number(d.clicks) ? Math.max(8, Number(d.clicks) / peak * 100) : 0}%` }} /></div><span className="bar-day">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })}</span></div>)}
                </div>
                {loadingStats && <p className="small-muted">Updating statistics…</p>}
                <p className="small-muted">Daily history starts recording after this update is deployed. Earlier clicks remain in the total.</p>
              </>}
            </div>
            <div className="card qr-card">
              <div><h2>QR code</h2><p>Scan or download your short link.</p></div>
              {active ? <><div className="qr-wrap"><QRCodeCanvas ref={qrRef} value={shortUrl} size={176} marginSize={2} level="M" /></div><button className="btn primary full" onClick={downloadQr}>↓ Download PNG</button></> : <p className="empty">Choose a link to generate its QR code.</p>}
            </div>
          </div>
        </section>
        <footer>Built with AWS Lambda · API Gateway · DynamoDB · Cognito · React</footer>
      </main>
    </div>
  );
}

export default function App() {
  return <Authenticator loginMechanisms={['email']}>
    {({ signOut, user }) => <Dashboard signOut={signOut} user={user} />}
  </Authenticator>;
}
