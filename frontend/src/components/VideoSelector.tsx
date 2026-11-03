import { useRef, useState } from 'react';
import { validateVideoFile } from '../services/upload';

interface Props {
  id?: string;
  title?: string;
  step?: string;
  file: File | null;
  disabled: boolean;
  onSelect: (file: File | null) => void;
  variant?: 'default' | 'studio';
}

export default function VideoSelector({ file, disabled, onSelect, id = 'video', title = 'Todo empieza con un swing.', step = '01 / TU VÍDEO', variant = 'default' }: Props) {
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  function select(selected: File | null) {
    if (!selected || disabled) return;
    const message = validateVideoFile(selected);
    setError(message);
    onSelect(message ? null : selected);
  }
  const triggerContent = <><span className="upload-symbol" aria-hidden="true">
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 23V5m-6 6 6-6 6 6M6 21v6h20v-6" /></svg>
  </span><span><strong>{dragging ? 'Suelta el vídeo aquí' : file ? 'Vídeo seleccionado' : variant === 'studio' ? 'Arrastra aquí tu vídeo' : 'Arrastra aquí tu swing'}</strong>
    <span>{file ? 'Seleccionar otro vídeo' : 'o selecciona un vídeo de tu equipo'} <i aria-hidden="true">↗</i></span></span></>;
  return (
    <section className={`card video-selector${file ? ' has-file' : ''}${variant === 'studio' ? ' studio-video-selector' : ''}`} aria-labelledby={`${id}-title`}>
      <span className="step">{step}</span>
      <h2 id={`${id}-title`}>{title}</h2>
      <p>Graba a una persona de cuerpo entero, con cámara fija y buena luz.</p>
      <div className={`upload${dragging ? ' is-dragging' : ''}`} aria-disabled={disabled}
        onDragEnter={event => { event.preventDefault(); if (!disabled) { dragDepth.current++; setDragging(true); } }}
        onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
        onDragLeave={event => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
        onDrop={event => {
          event.preventDefault(); dragDepth.current = 0; setDragging(false);
          if (disabled) return;
          if (event.dataTransfer.files.length > 1) { setError('Selecciona un único vídeo.'); return; }
          select(event.dataTransfer.files[0] ?? null);
        }}>
        {variant === 'studio' ? <button type="button" className="upload-trigger" disabled={disabled}
          aria-label={file ? 'Seleccionar otro vídeo' : 'Seleccionar vídeo'} onClick={() => input.current?.click()}>{triggerContent}</button>
          : <label className="upload-trigger" htmlFor={id}>{triggerContent}</label>}
        <input ref={input} className="upload-input sr-only" id={id} type="file" accept=".mp4,.mov,.webm,.avi,video/mp4,video/quicktime,video/webm,video/x-msvideo"
          disabled={disabled} tabIndex={variant === 'studio' ? -1 : undefined} aria-describedby={`${id}-help`} onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            if (!selected) return;
            select(selected);
            event.target.value = '';
          }} />
        <p className="file-info" role="status">{file
          ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`
          : 'MP4 / MOV / WEBM / AVI · HASTA 50 MB'}</p>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <p id={`${id}-help`} className="note">{variant === 'studio'
        ? 'Hasta 15 segundos. Cuerpo entero, cámara fija y buena luz.'
        : 'Hasta 50 MB y 15 segundos. Recomendado: MP4 H.264 a 1080p. El vídeo se procesa en tu ordenador y su copia temporal se elimina al terminar.'}</p>
    </section>
  );
}
