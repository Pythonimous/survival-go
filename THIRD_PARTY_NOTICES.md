# Third-party notices

Survival Go is licensed under the GNU Affero General Public License v3.0 or later (see [LICENSE](LICENSE)). The application also depends on, ports, and/or distributes components from other projects. This file summarizes required attribution and where to find full license text.

## Kaya AI engine (ported ONNX inference and MCTS modules)

- **Project:** [kaya-go/kaya](https://github.com/kaya-go/kaya)
- **License:** GNU Affero General Public License v3.0 (see upstream [LICENSE](https://github.com/kaya-go/kaya/blob/main/LICENSE))
- **Pinned upstream commit for porting:** [`8fafeac0fedde020c447d931c0b1afdf283edf2a`](https://github.com/kaya-go/kaya/commit/8fafeac0fedde020c447d931c0b1afdf283edf2a)
- **How we use it:** Survival Go is adopting Kaya's browser ONNX engine stack, including batched inference, MCTS, GPU/session helpers, and analysis queue behavior. Ported source files must keep SPDX and upstream attribution headers.

Planned/ported files from `packages/ai-engine/src/` at the pinned commit:

| Survival Go file | Upstream path |
|------------------|---------------|
| `onnx-session.ts` | `packages/ai-engine/src/onnx-session.ts` |
| `onnx-engine.ts` | `packages/ai-engine/src/onnx-engine.ts` |
| `onnx-mcts.ts` | `packages/ai-engine/src/onnx-mcts.ts` |
| `onnx-utils.ts` | `packages/ai-engine/src/onnx-utils.ts` |
| `onnx-gpu.ts` | `packages/ai-engine/src/onnx-gpu.ts` |
| `onnx-featurization.ts` | `packages/ai-engine/src/onnx-featurization.ts` |
| `onnx-types.ts` | `packages/ai-engine/src/onnx-types.ts` |
| `queue.ts` | `packages/ai-engine/src/queue.ts` |
| `auto-config.ts` | `packages/ai-engine/src/auto-config.ts` |
| `base-engine.ts` | `packages/ai-engine/src/base-engine.ts` |
| `types.ts` | `packages/ai-engine/src/types.ts` |
| `analysis-utils.ts` | `packages/ai-engine/src/analysis-utils.ts` |
| `analysis-utils.test.ts` | `packages/ai-engine/tests/analysis-utils.test.ts` |

Supporting local board adapter files ported from `packages/goboard/src/` at the pinned commit:

| Survival Go file | Upstream path |
|------------------|---------------|
| `goboard/index.ts` | `packages/goboard/src/index.ts` |
| `goboard/types.ts` | `packages/goboard/src/types.ts` |
| `goboard/handicap.ts` | `packages/goboard/src/handicap.ts` |

## KataGo (feature layout / ONNX export family)

- **Project:** [lightvector/KataGo](https://github.com/lightvector/KataGo)
- **License:** MIT License (see upstream [LICENSE](https://github.com/lightvector/KataGo/blob/master/LICENSE))
- **How we use it:** The browser ONNX encoder and tensor layout follow KataGo NN feature conventions. We do **not** ship or run the KataGo analysis binary in the backend.

## Python dependencies (runtime)

| Component | License | Home |
|-----------|---------|------|
| [FastAPI](https://github.com/fastapi/fastapi) | MIT | https://github.com/fastapi/fastapi |
| [Uvicorn](https://github.com/encode/uvicorn) | BSD-3-Clause | https://github.com/encode/uvicorn |
| [Pydantic](https://github.com/pydantic/pydantic) | MIT | https://github.com/pydantic/pydantic |
| [sgfmill](https://github.com/mattheww/sgfmill) | MIT | https://github.com/mattheww/sgfmill |

Full dependency versions are listed in [`requirements.txt`](requirements.txt). Install-time licenses for all installed packages are available in your virtual environment (for example `pip show <package>` or the package’s site-packages metadata).

## Frontend dependencies (runtime)

| Component | License | Home |
|-----------|---------|------|
| [React](https://github.com/facebook/react) | MIT | https://react.dev/ |
| [@sabaki/shudan](https://github.com/Sabaki/shudan) | MIT | https://github.com/Sabaki/shudan |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | MIT | https://www.npmjs.com/package/onnxruntime-web |

Full dependency versions and transitive licenses are recorded in [`frontend/package-lock.json`](frontend/package-lock.json). After `npm install`, run `npm ls` or inspect `node_modules/<package>/LICENSE` for complete text.

## Browser ONNX model weights (Kaya / KataGo export family)

The frontend loads static **ONNX neural network files** (for example `kaya.fp32.onnx` and `kaya.uint8.onnx` under `frontend/public/models/`, served as `/models/...`). These are **not** application source code; they are binary exports compatible with the KataGo feature layout consumed by this project’s encoder and backend raw-output mapping.

- **Upstream weights and ONNX releases:** Public ONNX builds are distributed with the **[kaya-go/kaya](https://huggingface.co/kaya-go/kaya)** model collection on Hugging Face (KataGo checkpoints converted for web and cross-platform use). The Hugging Face model card states **MIT License** for the original KataGo neural network weights and for the ONNX conversion as published there; always confirm the license text on the **exact revision** you download.
- **Conversion tooling:** The **[kaya-go/katago-onnx](https://github.com/kaya-go/katago-onnx)** repository documents the PyTorch-to-ONNX conversion workflow. That GitHub repository’s `README` states **AGPL-3.0** for the **converter source code** in that repo; Survival Go does not need to ship that tooling in production, only compatible `.onnx` artifacts obtained under terms you accept.
- **Original network training:** See KataGo’s project and training data terms ([lightvector/KataGo](https://github.com/lightvector/KataGo), [katagotraining.org](https://katagotraining.org/)) as referenced on the Hugging Face model card.

If you replace these files with weights from another channel, update this notice and your compliance review accordingly.

## Favicon graphics (Twitter Twemoji)

- **Graphics:** Cherry blossom emoji (`1f338.svg`) from [Twitter Twemoji](https://github.com/twitter/twemoji)
- **License:** [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **How we use it:** Static favicon and PWA icon assets under `frontend/public/` (see `docs/development/favicon-attribution.txt` for the exact upstream SVG path).

## Development and test tools

Development dependencies (pytest, flake8, mypy, Vitest, Testing Library, etc.) are listed in [`requirements.txt`](requirements.txt) and [`frontend/package.json`](frontend/package.json). They are not required to run the deployed application but are used to build and verify this repository.

## MIT License text (KataGo)

The following is the MIT License for KataGo’s own code (as stated in the upstream repository; nested third-party libraries are excluded):

```
Copyright 2025 David J. Wu ("lightvector") and/or other authors of the content in that repository.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

For the authoritative and complete notice (including disclaimers and bundled-library references), always refer to the [KataGo LICENSE](https://github.com/lightvector/KataGo/blob/master/LICENSE) in the version you install.
