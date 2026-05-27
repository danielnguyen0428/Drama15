export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, '');
  }

  if (import.meta.env.DEV) {
    return '';
  }

  return '';
}
