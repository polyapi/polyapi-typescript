import React from 'react';
import { Button } from './Button';
import { deletePolySession, getPolySession, PolySession } from './polySession';

export const AuthenticatedApp = () => {
  const [session, setSession] = React.useState<PolySession | null>(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    getPolySession()
      .then((next) => {
        if (!cancelled) setSession(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not read session');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#eef6f2',
        background:
          'radial-gradient(900px 600px at 80% -10%, rgba(126, 224, 176, 0.2), transparent 50%), linear-gradient(165deg, #0b1814 0%, #10231c 55%, #163528 100%)',
      }}
    >
      <main
        style={{
          width: 'min(640px, 100%)',
          padding: '48px 44px',
          borderRadius: 28,
          background: 'rgba(8, 22, 18, 0.78)',
          border: '1px solid rgba(126, 224, 176, 0.22)',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.35)',
        }}
      >
        <style>{buttonCss}</style>
        <p
          style={{
            margin: '0 0 14px',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            fontSize: 12,
            color: '#7ee0b0',
          }}
        >
          Authenticated root
        </p>
        <h1
          style={{
            margin: '0 0 16px',
            fontSize: 'clamp(32px, 5vw, 48px)',
            lineHeight: 1.1,
            fontFamily:
              '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
          }}
        >
          You are authenticated.
        </h1>
        <p
          style={{
            margin: '0 0 24px',
            fontSize: 17,
            lineHeight: 1.6,
            color: 'rgba(238, 246, 242, 0.78)',
          }}
        >
          This shell is the ENVIRONMENT root. Poly-alpha lazy-loaded it after
          the HttpOnly <code style={codeStyle}>poly_session</code> cookie was
          set. The API key never needed to live in localStorage.
        </p>
        {session ? (
          <dl style={{ margin: '0 0 32px', fontSize: 14, lineHeight: 1.7 }}>
            <dt style={dtStyle}>API key</dt>
            <dd style={ddStyle}>{session.apiKeyName || session.apiKeyId}</dd>
            <dt style={dtStyle}>Session</dt>
            <dd style={ddStyle}>{session.id}</dd>
            <dt style={dtStyle}>Expires</dt>
            <dd style={ddStyle}>
              {new Date(session.expiresAt).toLocaleString()}
            </dd>
          </dl>
        ) : (
          <p style={{ margin: '0 0 32px', color: error ? '#ff8a5b' : '#7ee0b0' }}>
            {error || 'Reading session…'}
          </p>
        )}
        <Button label="SIGN OUT" onClick={() => void deletePolySession()} />
      </main>
    </div>
  );
};

const buttonCss = `
  button.updated {
    appearance: none;
    border: 0;
    cursor: pointer;
    padding: 14px 28px;
    font-size: 14px;
    letter-spacing: 0.16em;
    font-weight: 700;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #10231c;
    background: linear-gradient(180deg, #9aefc4 0%, #7ee0b0 100%);
    border-radius: 999px;
  }
`;

const codeStyle: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  color: '#7ee0b0',
};

const dtStyle: React.CSSProperties = {
  margin: 0,
  color: 'rgba(238, 246, 242, 0.55)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontSize: 11,
};

const ddStyle: React.CSSProperties = {
  margin: '0 0 12px',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};
