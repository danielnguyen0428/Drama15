type DraftControlsConfig = {
  intensity: number;
  dialogueRatio: number;
  hookDensity: number;
};

type Props = {
  open: boolean;
  config: DraftControlsConfig;
  onClose: () => void;
  onChange: <K extends keyof DraftControlsConfig>(key: K, value: DraftControlsConfig[K]) => void;
  t: (key: string) => string;
};

export function DraftControlsModal({ open, config, onClose, onChange, t }: Props): JSX.Element | null {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="settings-modal draft-controls-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-controls-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-head">
          <div>
            <p className="eyebrow">{t('setup.heading_label')}</p>
            <h2 id="draft-controls-title">{t('setup.draft_controls_title')}</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            {t('setup.draft_controls_close')}
          </button>
        </div>

        <Range
          label={t('setup.intensity')}
          value={config.intensity}
          onChange={(value) => onChange('intensity', value)}
        />
        <Range
          label={t('setup.dialogue_ratio')}
          value={config.dialogueRatio}
          min={0.2}
          max={0.85}
          onChange={(value) => onChange('dialogueRatio', value)}
        />
        <Range
          label={t('setup.hook_density')}
          value={config.hookDensity}
          onChange={(value) => onChange('hookDensity', value)}
        />
      </section>
    </div>
  );
}

function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="range-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{Math.round(value * 100)}</strong>
    </label>
  );
}
