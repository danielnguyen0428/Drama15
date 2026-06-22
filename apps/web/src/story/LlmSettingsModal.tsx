import { useEffect, useState } from 'react';

import { httpFetch } from '../api/httpClient';

type LlmProvider = 'c' | 's' | 'other';

export type LlmSettings = {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  updatedAt: string;
  apiKeySet: boolean;
  apiKeyFingerprint: string;
  configured: boolean;
};

type LlmPreset = {
  id: string;
  label: string;
  provider: LlmProvider;
  baseUrl: string;
};

type LlmCatalog = {
  tabs: Array<{ id: LlmProvider; label: string }>;
  presets: LlmPreset[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (settings: LlmSettings) => void;
};

export function LlmSettingsModal({ open, onClose, onSaved }: Props): JSX.Element | null {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [catalog, setCatalog] = useState<LlmCatalog | null>(null);
  const [provider, setProvider] = useState<LlmProvider>('other');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMessage('');
    void (async () => {
      try {
        const [settingsResponse, catalogResponse] = await Promise.all([
          httpFetch('/llm/settings'),
          httpFetch('/llm/providers'),
        ]);
        if (!settingsResponse.ok) throw new Error(await readApiError(settingsResponse));
        if (!catalogResponse.ok) throw new Error(await readApiError(catalogResponse));
        const nextSettings = (await settingsResponse.json()) as LlmSettings;
        const nextCatalog = (await catalogResponse.json()) as LlmCatalog;
        if (cancelled) return;
        setSettings(nextSettings);
        setCatalog(nextCatalog);
        setProvider(nextSettings.provider);
        setBaseUrl(nextSettings.baseUrl);
        setModel(nextSettings.model);
        setApiKey('');
        setClearApiKey(false);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Không tải được cấu hình LLM.');
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const presets = catalog?.presets.filter((preset) => preset.provider === provider) ?? [];

  async function saveSettings() {
    setBusy(true);
    setMessage('');
    try {
      const body = buildRequestBody();
      const response = await httpFetch('/llm/settings', jsonRequest('PUT', body));
      if (!response.ok) throw new Error(await readApiError(response));
      const nextSettings = (await response.json()) as LlmSettings;
      setSettings(nextSettings);
      setApiKey('');
      setClearApiKey(false);
      onSaved(nextSettings);
      setMessage('Đã lưu cấu hình LLM cho tài khoản này.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không lưu được cấu hình LLM.');
    } finally {
      setBusy(false);
    }
  }

  async function testSettings() {
    setBusy(true);
    setMessage('Đang test connection...');
    try {
      const response = await httpFetch('/llm/settings/test', jsonRequest('POST', buildRequestBody()));
      if (!response.ok) throw new Error(await readApiError(response));
      const result = (await response.json()) as { ok: boolean; detail: string };
      setMessage(result.ok ? `Kết nối OK: ${result.detail}` : `Kết nối chưa ổn: ${result.detail}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không test được connection.');
    } finally {
      setBusy(false);
    }
  }

  function buildRequestBody() {
    return {
      provider,
      baseUrl,
      model,
      clearApiKey,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };
  }

  function applyPreset(preset: LlmPreset) {
    setProvider(preset.provider);
    setBaseUrl(preset.baseUrl);
    setClearApiKey(Boolean(settings?.apiKeySet && preset.baseUrl !== settings.baseUrl));
  }

  function closeAndClearSecret() {
    setApiKey('');
    setClearApiKey(false);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="llm-settings-title">
        <div className="settings-modal-head">
          <div>
            <p className="eyebrow">LLM Provider</p>
            <h2 id="llm-settings-title">Cấu hình model riêng</h2>
          </div>
          <button type="button" className="secondary-button" onClick={closeAndClearSecret}>Đóng</button>
        </div>

        <div className="provider-tabs" role="tablist" aria-label="LLM provider">
          {(catalog?.tabs ?? [
            { id: 'c', label: 'C-PROVIDER' },
            { id: 's', label: 'S-PROVIDER' },
            { id: 'other', label: 'OTHER' },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={provider === tab.id ? 'active' : ''}
              onClick={() => {
                const firstPreset = catalog?.presets.find((preset) => preset.provider === tab.id);
                if (firstPreset) applyPreset(firstPreset);
                else setProvider(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="provider-presets">
          {presets.map((preset) => (
            <button key={preset.id} type="button" onClick={() => applyPreset(preset)}>
              {preset.label}
            </button>
          ))}
        </div>

        <label>Base URL
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" />
        </label>
        <label>Model
          <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4o-mini" />
        </label>
        <label>API key {settings?.apiKeySet && <span className="muted-inline">đã đặt: {settings.apiKeyFingerprint}</span>}
          <input
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              if (event.target.value.trim()) setClearApiKey(false);
            }}
            placeholder={settings?.apiKeySet ? 'Để trống để giữ key cũ' : 'Nhập API key'}
          />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={clearApiKey} onChange={(event) => setClearApiKey(event.target.checked)} />
          Xóa API key đang lưu cho tài khoản này
        </label>

        <div className="settings-modal-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void testSettings()}>Test connection</button>
          <button type="button" className="primary-button" disabled={busy || !baseUrl.trim() || !model.trim()} onClick={() => void saveSettings()}>Save</button>
        </div>
        {message && <p className="settings-message">{message}</p>}
      </section>
    </div>
  );
}

function jsonRequest(method: 'POST' | 'PUT', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}
