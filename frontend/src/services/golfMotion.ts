export type GolfTransition = 'swing-impact' | 'ball-flight' | 'radar-scan' | 'swing-replay' | 'landing-impact' | 'final-putt';

const families: GolfTransition[] = ['swing-impact', 'ball-flight', 'radar-scan', 'swing-replay', 'landing-impact', 'final-putt'];
export function golfTransition(from: number, to: number): GolfTransition {
  return families[Math.max(0, Math.min(5, to > from ? to - 1 : to))];
}

// Frame 16/49 of the approved 16 fps I2V take: visual strike-through near the ground.
// This is an editorial cue, not a measured ball contact (no real ball is visible).
export const STUDIO_IMPACT_SECONDS = 1;
export const GOLF_RELEASE_EASING = 'cubic-bezier(.16,1,.3,1)';

export interface StudioImpact { reason: 'frame' | 'timeupdate' | 'unavailable' | 'blocked' | 'stalled'; mediaTime: number }

/** Only a presented media frame launches the normal transition; the timer is a failure watchdog. */
export function replayUntilStudioImpact(video: HTMLVideoElement, signal: AbortSignal): Promise<StudioImpact> {
  return new Promise((resolve, reject) => {
    let callback = 0, watchdog = 0, settled = false;
    function clean() {
      if (callback) video.cancelVideoFrameCallback(callback);
      window.clearTimeout(watchdog);
      signal.removeEventListener('abort', abort);
      video.removeEventListener('timeupdate', timeupdate);
      video.removeEventListener('error', error);
    }
    function complete(reason: StudioImpact['reason'], mediaTime = video.currentTime) {
      if (settled) return;
      settled = true; clean(); resolve({ reason, mediaTime });
    }
    function abort() {
      if (settled) return;
      settled = true; clean(); video.pause(); reject(new DOMException('Navigation changed', 'AbortError'));
    }
    function error() { complete('unavailable'); }
    function timeupdate() { if (!video.seeking && video.currentTime >= STUDIO_IMPACT_SECONDS) complete('timeupdate'); }
    function presented(_now: number, metadata: VideoFrameCallbackMetadata) {
      callback = 0;
      if (settled) return;
      if (!video.seeking && metadata.mediaTime >= STUDIO_IMPACT_SECONDS) complete('frame', metadata.mediaTime);
      else callback = video.requestVideoFrameCallback(presented);
    }
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    if (video.error || video.readyState < 2) { complete('unavailable'); return; }
    video.addEventListener('error', error, { once: true });
    video.pause(); video.currentTime = 0; video.muted = true;
    if (typeof video.requestVideoFrameCallback === 'function') callback = video.requestVideoFrameCallback(presented);
    else video.addEventListener('timeupdate', timeupdate);
    watchdog = window.setTimeout(() => complete('stalled'), 3200);
    try { void video.play().catch(() => complete('blocked')); } catch { complete('blocked'); }
  });
}
