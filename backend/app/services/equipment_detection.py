"""Detectores geométricos experimentales. Se omiten candidatos ambiguos.

No son clasificadores entrenados de golf: buscan un segmento próximo a las
manos y una pequeña forma clara y circular, apoyados por coherencia temporal.
"""
from dataclasses import dataclass, field

import cv2
import numpy as np

from app.schemas.swing import ClubSegment, EquipmentFrame, ImagePoint, PoseFrame


def visible_point(pose: PoseFrame, index: int, width: int, height: int):
    if len(pose.landmarks) != 33:
        return None
    point = pose.landmarks[index]
    if min(point.visibility, point.presence) < 0.5 or not (0 <= point.x <= 1 and 0 <= point.y <= 1):
        return None
    return np.array([point.x * width, point.y * height], dtype=float)


def body_context(pose: PoseFrame, width: int, height: int):
    joints = {i: visible_point(pose, i, width, height) for i in (11, 12, 13, 14, 15, 16, 23, 24, 27, 28, 31, 32)}
    if any(joints[i] is None for i in (11, 12, 23, 24)):
        return None
    hands = [joints[i] for i in (15, 16) if joints[i] is not None]
    if not hands:
        return None
    hips = (joints[23] + joints[24]) / 2
    shoulders = (joints[11] + joints[12]) / 2
    torso = float(np.linalg.norm(shoulders - hips))
    if torso < 12:
        return None
    return joints, np.mean(hands, axis=0), hips, torso


def _image_point(point, width, height):
    return ImagePoint(x=float(np.clip(point[0] / width, 0, 1)), y=float(np.clip(point[1] / height, 0, 1)))


@dataclass
class EquipmentObservation:
    timestamp_ms: int
    club: ClubSegment | None = None
    candidates: list = field(default_factory=list)
    torso: float = 0
    width: int = 1
    height: int = 1
    preview_jpeg: str | None = None


def detect_equipment(image, pose: PoseFrame, timestamp_ms: int) -> EquipmentObservation:
    height, width = image.shape[:2]
    observation = EquipmentObservation(timestamp_ms, width=width, height=height)
    context = body_context(pose, width, height)
    if context is None:
        return observation
    joints, hands, hips, torso = context
    observation.torso = torso
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 55, 145)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 360, threshold=max(15, round(torso * 0.15)),
                            minLineLength=max(20, torso * 0.55), maxLineGap=max(3, torso * 0.04))
    candidates = []
    if lines is not None:
        for line in lines.reshape(-1, 4)[:500]:
            a, b = np.array(line[:2], dtype=float), np.array(line[2:], dtype=float)
            if np.linalg.norm(b - hands) < np.linalg.norm(a - hands):
                a, b = b, a
            length = float(np.linalg.norm(b - a))
            if not 0.55 * torso <= length <= 3.0 * torso:
                continue
            near = float(np.linalg.norm(a - hands)) / torso
            if near > 0.48:
                continue
            # El extremo distal no debe ser otra articulación del propio cuerpo.
            if any(np.linalg.norm(b - joint) < torso * 0.18 for joint in joints.values() if joint is not None):
                continue
            direction = (b - a) / length
            offset = hands - a
            line_distance = abs(float(direction[0] * offset[1] - direction[1] * offset[0]))
            if line_distance > max(7, torso * 0.11):
                continue
            score = min(length / torso, 1.6) - near * 1.6 - line_distance / torso
            candidates.append((score, a, b))
    if candidates:
        candidates.sort(key=lambda item: item[0], reverse=True)
        score, a, b = candidates[0]
        ambiguous = False
        for other_score, c, d in candidates[1:]:
            if score - other_score > 0.12:
                break
            cosine = abs(float(np.dot((b - a) / np.linalg.norm(b - a), (d - c) / np.linalg.norm(d - c))))
            if cosine < 0.93:
                ambiguous = True
        if score > 0.35 and not ambiguous:
            observation.club = ClubSegment(start=_image_point(a, width, height), end=_image_point(b, width, height))

    feet = [joints[i] for i in (27, 28, 31, 32) if joints[i] is not None]
    if len(feet) < 2:
        return observation
    left = max(0, round(hips[0] - 2.2 * torso))
    right = min(width, round(hips[0] + 2.2 * torso))
    top = max(0, round(hips[1] + 0.35 * torso))
    bottom = min(height, round(max(point[1] for point in feet) + torso * 0.3))
    if right <= left or bottom <= top:
        return observation
    roi = image[top:bottom, left:right]
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, (0, 0, 165), (180, 115, 255))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)
        if area < 3 or perimeter == 0:
            continue
        (x, y), radius = cv2.minEnclosingCircle(contour)
        if not 1.0 <= radius <= max(3, torso * 0.065):
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)
        fill = area / (np.pi * radius * radius)
        if circularity < 0.68 or fill < 0.62:
            continue
        center = np.array([x + left, y + top])
        if any(np.linalg.norm(center - foot) < max(6, radius * 3) for foot in feet):
            continue
        x0, y0 = round(center[0]), round(center[1])
        ring_size = max(4, round(radius * 2.5))
        patch = gray[max(0, y0 - ring_size):min(height, y0 + ring_size + 1),
                     max(0, x0 - ring_size):min(width, x0 + ring_size + 1)]
        if patch.size == 0 or float(gray[min(height - 1, y0), min(width - 1, x0)]) - float(np.median(patch)) < 30:
            continue
        club_support = False
        if observation.club:
            tip = np.array([observation.club.end.x * width, observation.club.end.y * height])
            club_support = np.linalg.norm(tip - center) < max(radius * 5, torso * 0.3)
        observation.candidates.append((center, radius, float(circularity), bool(club_support)))
    observation.candidates = sorted(observation.candidates, key=lambda item: (item[3], item[2]), reverse=True)[:8]
    return observation


def finalise_equipment(observations: list[EquipmentObservation]) -> list[EquipmentFrame]:
    """Solo dibuja lo observado; no prolonga objetos después de perderlos."""
    frames = []
    previous_ball = None
    previous_ball_time = -10000
    for index, observation in enumerate(observations):
        ball = None
        possible = []
        for center, radius, circularity, support in observation.candidates:
            matches = 1
            supported = support
            for neighbor in observations[max(0, index - 3):index] + observations[index + 1:index + 4]:
                if abs(neighbor.timestamp_ms - observation.timestamp_ms) > 250:
                    continue
                for other, other_radius, _, other_support in neighbor.candidates:
                    if np.linalg.norm(center / [observation.width, observation.height] - other / [neighbor.width, neighbor.height]) < max(0.005, radius / observation.width * 2):
                        matches += 1
                        supported = supported or other_support
                        break
            normalized_center = center / [observation.width, observation.height]
            tracked = (previous_ball is not None and observation.timestamp_ms - previous_ball_time <= 150
                       and np.linalg.norm(normalized_center - previous_ball) < max(0.006, radius / observation.width * 2))
            if (matches >= 3 and supported) or tracked:
                possible.append((center, circularity))
        if len(possible) == 1:
            ball = _image_point(possible[0][0], observation.width, observation.height)
            previous_ball = np.array([ball.x, ball.y])
            previous_ball_time = observation.timestamp_ms
        club = observation.club
        if club:
            vector = np.array([club.end.x - club.start.x, club.end.y - club.start.y]) * [observation.width, observation.height]
            supported = False
            for neighbor in observations[max(0, index - 2):index] + observations[index + 1:index + 3]:
                if not neighbor.club or abs(neighbor.timestamp_ms - observation.timestamp_ms) > 150:
                    continue
                other = np.array([neighbor.club.end.x - neighbor.club.start.x, neighbor.club.end.y - neighbor.club.start.y]) * [neighbor.width, neighbor.height]
                cosine = float(np.dot(vector, other) / (np.linalg.norm(vector) * np.linalg.norm(other)))
                if cosine > 0.6:
                    supported = True
            if not supported:
                club = None
        frames.append(EquipmentFrame(timestamp_ms=observation.timestamp_ms, ball=ball, club=club,
                                     preview_jpeg=observation.preview_jpeg))
    return frames
