# Third-party notices

Survival Go is licensed under the MIT License (see [LICENSE](LICENSE)). The application also depends on and/or distributes components from other projects. This file summarizes required attribution and where to find full license text.

## KataGo (engine)

- **Project:** [lightvector/KataGo](https://github.com/lightvector/KataGo)
- **License:** MIT License (Copyright David J. Wu and other contributors; see upstream [LICENSE](https://github.com/lightvector/KataGo/blob/master/LICENSE))
- **How we use it:** The backend runs the `katago analysis` subprocess for ownership and candidate moves. The binary and neural net are **not** committed to this repository; they are downloaded at setup or image build time via [`scripts/setup_katago.sh`](scripts/setup_katago.sh) (default: KataGo **v1.16.4** release build).
- **Config files:** Files under [`third_party/katago/`](third_party/katago/) (for example `analysis.cfg`, `analysis.docker.cfg`) are derived from or aligned with KataGo’s example configs and are used under the same upstream terms.
- **Nested libraries:** Prebuilt KataGo binaries may bundle additional libraries (OpenCL, Eigen, etc.). See KataGo’s `cpp/external/` tree and upstream LICENSE for those components.

### Neural network weights

Weights (`.bin.gz` files) are downloaded separately (for example from [katagotraining.org](https://katagotraining.org/) or [KataGo releases](https://github.com/lightvector/KataGo/releases)). They are not part of Survival Go’s source code. Use them according to the terms stated by the model distributor.

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

Full dependency versions and transitive licenses are recorded in [`frontend/package-lock.json`](frontend/package-lock.json). After `npm install`, run `npm ls` or inspect `node_modules/<package>/LICENSE` for complete text.

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
