"""Propuestas revisables de eventos; nunca certifica el contacto palo-bola."""
import numpy as np

from app.schemas.swing import PoseFrame, SuggestedAnchors
from app.services.equipment_detection import body_context, visible_point


def settled_finish(frames, width, height, impact_ms):
    """Respaldo cuando las manos se ocultan tras la cabeza al finalizar."""
    rows = []
    for frame in frames:
        points = [visible_point(frame, i, width, height) for i in (23, 24, 27, 28)]
        if all(point is not None for point in points):
            rows.append((frame.timestamp_ms, np.concatenate(points) / height, frame))
    for index, (timestamp, _, _) in enumerate(rows):
        if not impact_ms + 1000 <= timestamp <= impact_ms + 4000:
            continue
        window = [row for row in rows[index:] if row[0] <= timestamp + 550]
        if len(window) < 5 or window[-1][0] - timestamp < 450:
            continue
        if any(b[0] - a[0] > 180 for a, b in zip(window, window[1:])):
            continue
        coordinates = np.array([row[1] for row in window])
        spread = np.sqrt(np.mean((coordinates - np.mean(coordinates, axis=0)) ** 2))
        arm_spreads = []
        for joint in (13, 14, 15, 16):
            points = [visible_point(row[2], joint, width, height) for row in window]
            visible = np.array([point / height for point in points if point is not None])
            if len(visible) >= max(4, len(window) * 0.7):
                arm_spreads.append(float(np.sqrt(np.mean((visible - np.mean(visible, axis=0)) ** 2))))
        if spread < 0.012 and len(arm_spreads) >= 2 and max(arm_spreads) < 0.015:
            return int(timestamp)
    return None


def suggest_anchors(frames: list[PoseFrame], width: int, height: int) -> SuggestedAnchors:
    rows = []
    for frame in frames:
        context = body_context(frame, width, height)
        if context is not None:
            _, hands, hips, torso = context
            rows.append((frame.timestamp_ms, (hands - hips) / torso))
    unavailable = SuggestedAnchors(notes=["No hay una secuencia corporal suficiente para proponer las cuatro marcas. Puedes completarlas manualmente."])
    if len(rows) < 12:
        return unavailable
    # Se analiza cada secuencia continua por separado, sin atravesar oclusiones.
    groups = []
    first = 0
    for i in range(1, len(rows)):
        if rows[i][0] - rows[i - 1][0] > 180:
            groups.append(rows[first:i])
            first = i
    groups.append(rows[first:])
    candidates = []
    for group in groups:
        if len(group) < 12:
            continue
        times = np.array([item[0] for item in group], dtype=int)
        raw = np.array([item[1] for item in group])
        smooth = np.array([np.median(raw[max(0, i - 2):i + 3], axis=0) for i in range(len(raw))])
        y = smooth[:, 1]
        speed = np.zeros(len(raw))
        speed[1:] = np.linalg.norm(np.diff(smooth, axis=0), axis=1) / (np.diff(times) / 1000)
        for top in range(3, len(group) - 5):
            if y[top] > np.min(y[top - 2:top + 3]) + 0.015:
                continue
            before = np.flatnonzero((times < times[top] - 180) & (times >= times[top] - 6000))
            after = np.flatnonzero((times > times[top] + 120) & (times <= times[top] + 2200))
            if len(before) < 4 or len(after) < 4:
                continue
            impact = int(after[np.argmax(y[after])])
            if y[impact] - y[top] < 0.65 or np.max(y[before]) - y[top] < 0.65:
                continue
            # Exige que las manos vuelvan a elevarse tras el paso por la zona baja.
            follow = np.flatnonzero((times >= times[impact] + 200) & (times <= times[impact] + 3000))
            if len(follow) < 3 or y[impact] - np.min(y[follow]) < 0.45:
                continue
            rests = []
            for i in before:
                window = np.flatnonzero((times >= times[i] - 200) & (times <= times[i]))
                if len(window) >= 3 and y[i] > y[top] + 0.6 and np.mean(speed[window]) < 0.45:
                    rests.append(int(i))
            if not rests:
                continue
            start = rests[-1]
            finish = None
            for i in follow:
                window = np.flatnonzero((times >= times[i]) & (times <= times[i] + 500))
                dispersion = float(np.sqrt(np.mean(np.sum((smooth[window] - np.mean(smooth[window], axis=0)) ** 2, axis=1)))) if len(window) else float("inf")
                if (len(window) >= 4 and times[window[-1]] - times[i] >= 400
                        and times[i] - times[impact] >= 700 and y[i] < y[impact] - 0.45 and dispersion < 0.10):
                    finish = int(i)
                    break
            strength = float((y[impact] - y[top]) + (y[start] - y[top]))
            if finish is not None:
                strength += 0.2
            candidates.append((strength, times[start], times[top], times[impact], None if finish is None else times[finish]))
    if not candidates:
        return unavailable
    _, start, top, impact, end = max(candidates, key=lambda item: item[0])
    notes = ["Marcas propuestas por la trayectoria de las manos respecto a la cadera. Revísalas con el vídeo.",
             "El impacto corporal es una aproximación a la zona baja del swing; no demuestra contacto con la bola."]
    if end is None:
        end = settled_finish(frames, width, height, int(impact))
        if end is not None:
            notes.append("Final aproximado por estabilización de caderas, pies y brazos visibles tras el follow-through; revisa esta marca, sobre todo si las manos están ocultas.")
    if end is None:
        notes.append("No se ha localizado una finalización estable: completa la marca Final.")
    return SuggestedAnchors(start_ms=int(start), top_ms=int(top), impact_ms=int(impact),
                            end_ms=None if end is None else int(end), notes=notes)
