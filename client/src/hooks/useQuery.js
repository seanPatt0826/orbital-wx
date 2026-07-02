import { useState } from 'react';

export function useQuery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function postQuery(text) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'request failed');
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { postQuery, loading, error };
}
