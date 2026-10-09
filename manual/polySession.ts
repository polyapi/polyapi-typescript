export type PolySession = {
  id: string;
  apiKeyId: string;
  apiKeyName: string;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  expiresAt: string;
};

const readError = async (res: Response) => {
  try {
    const body = await res.json();
    if (typeof body?.message === 'string') return body.message;
    if (Array.isArray(body?.message)) return body.message.join(', ');
  } catch {
    // ignore
  }
  return `Request failed (${res.status})`;
};

export const createPolySession = async (apiKey: string): Promise<PolySession> => {
  const res = await fetch('/auth/session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const session = (await res.json()) as PolySession;
  window.dispatchEvent(new Event('poly-session'));
  return session;
};

export const getPolySession = async (): Promise<PolySession | null> => {
  const res = await fetch('/auth/session', { credentials: 'include' });
  if (!res.ok) return null;
  return (await res.json()) as PolySession;
};

export const deletePolySession = async () => {
  await fetch('/auth/session', {
    method: 'DELETE',
    credentials: 'include',
  });
  window.location.reload();
};
