export type UploadProgress = { phase: 'uploading'; loaded: number; total: number | null } | { phase: 'processing' };

export function validateVideoFile(file: Pick<File, 'name' | 'size'>): string {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return !extension || !['mp4', 'mov', 'webm', 'avi'].includes(extension)
    ? 'Selecciona un vídeo MP4, MOV, WebM o AVI.'
    : file.size === 0 ? 'El vídeo está vacío.'
    : file.size > 50 * 1024 * 1024 ? 'El vídeo supera los 50 MB.' : '';
}

/** La transferencia usa eventos reales. El análisis permanece indeterminado hasta la respuesta. */
export function uploadVideo(file: File, onProgress: (value: UploadProgress) => void): Promise<{ ok: boolean; status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.upload.addEventListener('progress', event => onProgress({ phase: 'uploading', loaded: event.loaded,
      total: event.lengthComputable && event.total > 0 ? event.total : null }));
    request.upload.addEventListener('load', () => onProgress({ phase: 'processing' }));
    request.addEventListener('load', () => {
      let data = null;
      try { data = JSON.parse(request.responseText); } catch { /* Se valida en processSwing. */ }
      resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, data });
    });
    request.addEventListener('error', () => reject(new Error('No se puede conectar. Comprueba que el backend esté iniciado en el puerto 8000.')));
    request.addEventListener('timeout', () => reject(new Error('La espera ha terminado. Prueba un vídeo más corto; el backend puede seguir terminando la petición anterior.')));
    request.addEventListener('abort', () => reject(new Error('Se ha interrumpido el envío del vídeo.')));
    request.open('POST', '/api/swings');
    request.timeout = 300_000;
    const form = new FormData();
    form.append('file', file);
    onProgress({ phase: 'uploading', loaded: 0, total: null });
    request.send(form);
  });
}
