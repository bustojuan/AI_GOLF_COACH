# Asset provenance

| Asset | Source / status | Use in this distribution |
| --- | --- | --- |
| `frontend/public/motion/golf-course/limpopo_golf_course_4k.jpg` | [Limpopo Golf Course](https://polyhaven.com/a/limpopo_golf_course), Poly Haven, [CC0](https://polyhaven.com/license/) | Runtime environment texture |
| `frontend/public/motion/golf-course/grass_ground_*.jpg` | [Grass Ground](https://polyhaven.com/a/grass_ground), Poly Haven, [CC0](https://polyhaven.com/license/) | Runtime material maps |
| `frontend/public/studio-dark/parkland-*` | Ryan Parkland, [Pexels video 38025632](https://www.pexels.com/video/golfer-teeing-off-at-scenic-golf-course-38025632/), [Pexels License](https://www.pexels.com/legal-pages/license/) | Derived clips/posters/tracking in the app's optional demo; no endorsement implied. Do not repackage as standalone stock footage. |
| `frontend/public/studio-dark/golfer.webp`, `studio-swing-*` | Studio Dark concept generated for this project from its own image, followed by a Wan 2.2 image-to-video render ([Wan model card, Apache-2.0](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B)) | Core landing-media dependency. The golfer is synthetic, not analysis of a real person. |
| `docs/screenshots/*.png`, `demo/product-demo-thumbnail.png` | Browser captures of the standalone app using [Taryn Elliott's Pexels clip](https://www.pexels.com/video/slow-motion-footage-of-a-man-playing-golf-3780018/) and [Ryan Parkland's Pexels clip](https://www.pexels.com/video/golfer-teeing-off-at-scenic-golf-course-38025632/), plus the Studio Dark landing | Documentation and preview only. These are app screenshots, not standalone stock video files. |
| `demo/product-demo.mp4`, `demo/product-demo.srt` | Product Demo V2 and its Spanish subtitle transcript | 88-second demo with an illustrative AI report; subtitles are also burned into the MP4. |

The [Pexels License](https://www.pexels.com/legal-pages/license/) permits use in apps and promotion, while prohibiting standalone stock redistribution and implied endorsement. The [Poly Haven License](https://polyhaven.com/license/) identifies its assets as CC0. Original model files are **not** bundled; the downloader fetches a specified MediaPipe asset and verifies its hash.

The demo's generated AI report is an illustrative example, not evidence of an active provider.

The code itself has no selected open-source license. Add a license only after the owner decides its terms.
