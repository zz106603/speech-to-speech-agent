const REALTIME_TOKEN_URL = 'http://10.0.2.2:8080/api/realtime/token';

type RealtimeTokenResponse = {
  token: string;
};

export async function requestRealtimeToken(): Promise<string> {
  const response = await fetch(REALTIME_TOKEN_URL, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Realtime token request failed');
  }

  const data = (await response.json()) as Partial<RealtimeTokenResponse>;
  if (!data.token) {
    throw new Error('Realtime token response is missing token');
  }

  return data.token;
}

export function maskToken(token: string): string {
  if (token.length <= 8) {
    return '****';
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
