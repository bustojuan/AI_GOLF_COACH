"""Descarga reproducible del modelo oficial; ejecutar una vez desde backend."""
import hashlib
from pathlib import Path
from urllib.request import urlopen

URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
SHA256 = "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1"
DESTINATION = Path(__file__).resolve().parents[1] / "models" / "pose_landmarker_full.task"


def download_model():
    if DESTINATION.is_file() and hashlib.sha256(DESTINATION.read_bytes()).hexdigest() == SHA256:
        print("Modelo disponible y SHA256 correcto.")
        return
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    partial = DESTINATION.with_suffix(".part")
    try:
        digest = hashlib.sha256()
        with urlopen(URL, timeout=60) as response, partial.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                digest.update(chunk)
        if digest.hexdigest() != SHA256:
            raise RuntimeError("SHA256 del modelo incorrecto; no se utilizará esta descarga.")
        partial.replace(DESTINATION)
        print(f"Modelo descargado: {DESTINATION}")
    finally:
        partial.unlink(missing_ok=True)


if __name__ == "__main__":
    download_model()