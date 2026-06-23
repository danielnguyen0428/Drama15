import { useEffect, useState } from 'react';

import { httpFetch } from '../api/httpClient';

type LlmProvider = 'c' | 's' | 'other';

export type LlmSettings = {
  provider: LlmProvider;
  baseUrl?: string;
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
  baseUrl?: string;
  model?: string;
};

type LlmCatalog = {
  presets: LlmPreset[];
};

const FALLBACK_PRESETS: LlmPreset[] = [
  { id: 'c', label: 'C-PROVIDER', provider: 'c', model: 'mainnewnol/deepseek-v4-flash' },
  { id: 's', label: 'S-PROVIDER', provider: 's' },
  { id: 'openai', label: 'OpenAI', provider: 'other', baseUrl: 'https://api.openai.com/v1' },
  { id: 'openrouter', label: 'OpenRouter', provider: 'other', baseUrl: 'https://openrouter.ai/api/v1' },
  {
    id: 'gemini-openai',
    label: 'Gemini',
    provider: 'other',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (settings: LlmSettings) => void;
};

export function LlmSettingsModal({ open, onClose, onSaved }: Props): JSX.Element | null {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [catalog, setCatalog] = useState<LlmCatalog | null>(null);
  const [provider, setProvider] = useState<LlmProvider>('c');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('mainnewnol/deepseek-v4-flash');
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
        setBaseUrl(nextSettings.baseUrl ?? '');
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

  const providerOptions = catalog?.presets.length ? catalog.presets : FALLBACK_PRESETS;
  const activePresetId = providerOptions.find((preset) =>
    preset.provider === provider
      && (provider !== 'other' || normalizeBaseUrl(preset.baseUrl ?? '') === normalizeBaseUrl(baseUrl)),
  )?.id ?? 'custom';

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
      model,
      clearApiKey,
      ...(provider === 'other' ? { baseUrl } : {}),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };
  }

  function applyPreset(preset: LlmPreset) {
    const nextBaseUrl = preset.baseUrl ?? '';
    setProvider(preset.provider);
    setBaseUrl(nextBaseUrl);
    if (preset.model) setModel(preset.model);
    setClearApiKey(Boolean(
      settings?.apiKeySet
        && (preset.provider !== settings.provider
          || (preset.provider === 'other'
            && normalizeBaseUrl(nextBaseUrl) !== normalizeBaseUrl(settings.baseUrl ?? ''))),
    ));
  }

  function useCustomProvider() {
    if (activePresetId !== 'custom') {
      setBaseUrl('');
      setClearApiKey(Boolean(settings?.apiKeySet));
    }
    setProvider('other');
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

        <div className="settings-field">
          <div className="settings-field-heading">
            <span>Provider</span>
            <small>Chọn dịch vụ có sẵn hoặc dùng endpoint OpenAI-compatible riêng.</small>
          </div>
          <div className="provider-tabbar" role="tablist" aria-label="LLM provider">
            {providerOptions.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="tab"
                aria-selected={activePresetId === preset.id}
                className={activePresetId === preset.id ? 'active' : ''}
                onClick={() => applyPreset(preset)}
              >
                {providerTabLabel(preset)}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={activePresetId === 'custom'}
              className={activePresetId === 'custom' ? 'active' : ''}
              onClick={useCustomProvider}
            >
              Tùy chỉnh
            </button>
          </div>
        </div>

        {provider === 'other' && (
          <label className="settings-field">Base URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" />
            <small>Endpoint API tương thích chuẩn OpenAI.</small>
          </label>
        )}
        <label className="settings-field">Model
          <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="mainnewnol/deepseek-v4-flash" />
          <small>Nhập chính xác model ID do provider cung cấp.</small>
        </label>
        <label className="settings-field">API key {settings?.apiKeySet && <span className="muted-inline">đã đặt: {settings.apiKeyFingerprint}</span>}
          <input
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              if (event.target.value.trim()) setClearApiKey(false);
            }}
            placeholder={
              provider === 'c' && !settings?.apiKeySet
                ? 'Để trống để dùng model miễn phí Deepseek 4 Flash'
                : settings?.apiKeySet
                  ? 'Để trống để giữ key cũ'
                  : 'Nhập API key'
            }
          />
          {provider === 'c' && !settings?.apiKeySet && (
            <small>C-PROVIDER mặc định dùng model miễn phí; bạn có thể nhập key riêng nếu muốn.</small>
          )}
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={clearApiKey} onChange={(event) => setClearApiKey(event.target.checked)} />
          Xóa API key đang lưu cho tài khoản này
        </label>

        <div className="settings-modal-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void testSettings()}>Test connection</button>
          <button type="button" className="primary-button" disabled={busy || !model.trim() || (provider === 'other' && !baseUrl.trim())} onClick={() => void saveSettings()}>Save</button>
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

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function providerTabLabel(preset: LlmPreset) {
  return preset.id === 'gemini-openai' ? 'Gemini' : preset.label;
}

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}
