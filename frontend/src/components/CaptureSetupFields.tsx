import type { SetupDraft } from '../types/comparison';

export default function CaptureSetupFields({ id, setup, onChange, disabled = false }: {
  id: string; setup: SetupDraft; onChange: (value: SetupDraft) => void; disabled?: boolean;
}) {
  return (
    <fieldset className="capture-setup" disabled={disabled}>
      <legend>Condiciones de grabación</legend>
      <div className="setup-grid">
        <label htmlFor={`${id}-handedness`}>Mano dominante
          <select id={`${id}-handedness`} value={setup.handedness}
            onChange={event => onChange({ ...setup, handedness: event.target.value as SetupDraft['handedness'] })}>
            <option value="">Selecciona…</option><option value="right">Derecha</option><option value="left">Izquierda</option>
          </select>
        </label>
        <label htmlFor={`${id}-view`}>Perspectiva
          <select id={`${id}-view`} value={setup.view}
            onChange={event => onChange({ ...setup, view: event.target.value as SetupDraft['view'] })}>
            <option value="">Selecciona…</option><option value="face_on">Frontal</option>
            <option value="down_the_line">Desde atrás</option>
          </select>
        </label>
        <label htmlFor={`${id}-club`}>Palo (opcional)
          <input id={`${id}-club`} maxLength={60} value={setup.club} placeholder="Ej.: hierro 7"
            onChange={event => onChange({ ...setup, club: event.target.value })} />
        </label>
      </div>
    </fieldset>
  );
}
