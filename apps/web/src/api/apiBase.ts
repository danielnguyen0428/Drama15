export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  return configured ? configured.replace(/\/$/, '') : '';
}
