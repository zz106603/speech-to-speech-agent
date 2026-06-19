const SESSION_SUMMARY_URL = 'http://10.0.2.2:8080/api/sessions/summary';

export type SessionMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SessionSummary = {
  title: string;
  summary: string;
  tasks: string[];
};

export async function requestSessionSummary(
  messages: SessionMessage[],
  tasks: string[],
): Promise<SessionSummary> {
  const response = await fetch(SESSION_SUMMARY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      tasks,
    }),
  });

  if (!response.ok) {
    throw new Error('Session summary request failed');
  }

  const data = (await response.json()) as Partial<SessionSummary>;
  if (!data.title || !data.summary || !Array.isArray(data.tasks)) {
    throw new Error('Session summary response is invalid');
  }

  return {
    title: data.title,
    summary: data.summary,
    tasks: data.tasks.filter(task => typeof task === 'string'),
  };
}
