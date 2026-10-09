import React from 'react';
import Confetti from 'react-confetti';
import { Button } from './Button';
import { createPolySession } from './polySession';
import _ from 'lodash';

export const App2 = () => {
  const [celebrate, setCelebrate] = React.useState(false);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [apiKey, setApiKey] = React.useState('');
  const [signingIn, setSigningIn] = React.useState(false);
  const [error, setError] = React.useState('');
  const label = React.useMemo(() => _.toUpper('launch confetti'), []);

  React.useEffect(() => {
    const update = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSigningIn(true);
    try {
      await createPolySession(apiKey.trim());
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setSigningIn(false);
    }
  };

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
          '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
        color: '#f4efe4',
        background:
          'radial-gradient(1200px 700px at 18% -10%, rgba(232, 196, 92, 0.28), transparent 55%), radial-gradient(900px 600px at 110% 10%, rgba(86, 196, 154, 0.22), transparent 50%), linear-gradient(165deg, #10231c 0%, #163528 42%, #0b1814 100%)',
      }}
    >
      {celebrate && (
        <Confetti
          width={size.width}
          height={size.height}
          recycle={false}
          numberOfPieces={420}
          gravity={0.18}
          colors={['#e8c45c', '#7ee0b0', '#f4efe4', '#3aa87a', '#ff8a5b']}
          onConfettiComplete={() => setCelebrate(false)}
        />
      )}

      <main
        style={{
          width: 'min(720px, 100%)',
          padding: '48px 44px',
          borderRadius: 28,
          background: 'rgba(12, 28, 23, 0.72)',
          border: '1px solid rgba(244, 239, 228, 0.14)',
          boxShadow:
            '0 30px 80px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <style>{`
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
            background: linear-gradient(180deg, #f3d67a 0%, #e8c45c 100%);
            border-radius: 999px;
          }
          button.updated:hover { filter: brightness(1.06); }
          button.updated:active { transform: translateY(1px); }
          button.updated:disabled { opacity: 0.6; cursor: wait; }
        `}</style>
        <p
          style={{
            margin: '0 0 14px',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            fontSize: 12,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            color: '#e8c45c',
          }}
        >
          Canopy v2
        </p>
        <h1
          style={{
            margin: '0 0 18px',
            fontSize: 'clamp(36px, 6vw, 58px)',
            lineHeight: 1.05,
            fontWeight: 600,
          }}
        >
          A composed React app, hosted as one root.
        </h1>
        <p
          style={{
            margin: '0 0 18px',
            fontSize: 18,
            lineHeight: 1.65,
            color: 'rgba(244, 239, 228, 0.82)',
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          This is the public unauthenticated root. Sign in with an API key to
          set the HttpOnly <code style={codeStyle}>poly_session</code> cookie.
          The host then fires <code style={codeStyle}>poly-session</code> and
          lazy-loads the authenticated shell.
        </p>
        <div
          style={{
            display: 'inline-flex',
            marginBottom: 36,
          }}
        >
          <Button label={label} onClick={() => setCelebrate(true)} />
        </div>

        <form onSubmit={signIn} style={formStyle}>
          <p
            style={{
              margin: '0 0 12px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontSize: 11,
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              color: '#7ee0b0',
            }}
          >
            Sign in
          </p>
          <label
            style={{
              display: 'block',
              marginBottom: 10,
              fontSize: 14,
              color: 'rgba(244, 239, 228, 0.72)',
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            Poly API key
            <input
              type="password"
              name="apiKey"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste your API key"
              style={inputStyle}
            />
          </label>
          {error ? (
            <p
              style={{
                margin: '0 0 12px',
                color: '#ff8a5b',
                fontSize: 14,
                fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              {error}
            </p>
          ) : (
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 13,
                color: 'rgba(244, 239, 228, 0.55)',
                fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              The key is POSTed to <code style={codeStyle}>/auth/session</code>{' '}
              with credentials and is not written to localStorage.
            </p>
          )}
          <Button
            label={signingIn ? 'SIGNING IN' : 'SIGN IN'}
            type="submit"
          />
        </form>
      </main>
    </div>
  );
};

const codeStyle: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: '0.92em',
  color: '#7ee0b0',
};

const formStyle: React.CSSProperties = {
  marginTop: 8,
  paddingTop: 28,
  borderTop: '1px solid rgba(244, 239, 228, 0.12)',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 8,
  marginBottom: 14,
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgba(244, 239, 228, 0.18)',
  background: 'rgba(8, 20, 16, 0.65)',
  color: '#f4efe4',
  fontSize: 14,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};
