Browser inference. My go club teammate suggested browser inference, and it's extremely elegant and solves ALL my problems. This was originally a planning note for an MIT project; the current decision is to relicense Survival Go to AGPL-3.0-or-later and adopt Kaya's AGPL ONNX engine with attribution.

---

Oh. Yeah. That is not just elegant — that may be the **correct endgame architecture** for this project.

Because it attacks the real problem directly:

```text
Server-side KataGo:
  your server pays for every move

Browser inference:
  user’s machine pays for every move
```

For an open-source, shareable Go toy/trainer, that is *massive*.

And the precedents are real enough to de-risk the concept. The `kaya-go/katago-onnx` repo explicitly says it converts KataGo PyTorch checkpoints to ONNX “for web and cross-platform deployment,” and that the converted ONNX models power Kaya, a web-based Go app with AI-powered game analysis. Survival Go now adopts the AGPL path directly instead of treating Kaya only as a precedent. ([GitHub][1])

## Why browser inference solves your exact pain

It gets rid of almost every nasty deployment constraint:

```text
No GPU EC2.
No $12/day goban goblin.
No async server queue.
No multi-user inference scaling.
No server-side KataGo process lifecycle.
No “what instance should I buy?”
No public abuse problem from people hammering your engine.
```

Your hosted app becomes basically:

```text
static frontend
+ model files
+ maybe tiny optional backend
```

That means you can plausibly deploy on:

```text
GitHub Pages
Cloudflare Pages
Netlify
Vercel static hosting
S3 + CloudFront
```

For the open-source story, this is also beautiful:

```text
Clone repo → run frontend → browser downloads model → play locally
```

No one has to provision EC2 just to test the project.

## New architecture

The old architecture was:

```text
React UI
  ↓
FastAPI backend
  ↓
KataGo subprocess
  ↓
CPU/GPU instance
```

The browser-inference architecture is:

```text
React UI
  ↓
Go rules / game state in browser
  ↓
ONNX Runtime Web / WebGPU inference
  ↓
Survival-Go move selector
```

Optionally:

```text
Static model files served from CDN / release assets
```

The backend can disappear from MVP unless you want analytics, shared game links, or preset hosting.

## The cleanest implementation direction

I would now split the project into two engines:

```text
EngineProvider
  ├── ServerKataGoProvider     # current / fallback / development reference
  └── BrowserOnnxProvider      # real deployment target
```

Even if you eventually delete the server engine, this abstraction will save you.

Something like:

```ts
interface AnalysisProvider {
  analyzePosition(position: Position, options: AnalysisOptions): Promise<AnalysisResult>;
}
```

Where:

```ts
type AnalysisResult = {
  policy: number[];      // 362, including pass
  pBlack: number[];      // 361
  scoreLead?: number;
  winrate?: number;
};
```

Then your Survival-Go code does **not care** whether the result came from:

```text
KataGo subprocess
ONNX Runtime Web
WebGPU
WASM
a mock test provider
```

That’s the key.

## The legal/licensing shape

Your instinct on AGPL was correct: copying AGPL code is incompatible with keeping this repository MIT. The project decision has changed to adopt AGPL-3.0-or-later and port Kaya with attribution. ([GitHub][1])

The old permissive-license-compatible path would have been:

```text
1. Use original KataGo model/checkpoint artifacts subject to their own license/terms.
2. Write your own converter or export script.
3. Use ONNX Runtime Web or another permissively licensed runtime.
4. Keep your application code under the chosen permissive license.
5. Clearly document model licensing separately from app code.
```

You’ll want a `LICENSES.md` or `MODEL_LICENSE.md`, because app code license and model/data licenses are not necessarily the same thing.

## Runtime choice

The obvious first target is:

```text
ONNX Runtime Web
```

Specifically:

```text
onnxruntime-web
```

with execution providers roughly in this order:

```text
webgpu → wasm fallback
```

WebGPU is the interesting path because it exposes GPU compute in the browser and is intended for graphics and compute/ML-style workloads. ([Wikipedia][2]) ONNX browser inference is also a known pattern now; the Kaya ONNX repo is specifically doing KataGo-to-ONNX for web/cross-platform deployment. ([GitHub][1])

The pragmatic fallback path:

```text
If WebGPU available:
  use WebGPU
else:
  use WASM
else:
  disable AI and show setup error
```

But don’t expect mobile to be great. Browser inference papers consistently show that browser inference has meaningful overhead versus native inference, especially on CPU/mobile, so the UX should degrade gracefully. ([arXiv][3])

## The big missing piece

KataGo the program is not just a neural net.

Full KataGo strength comes from:

```text
neural net inference
+ MCTS/search
+ rules logic
+ batching
+ tree reuse
+ lots of engine engineering
```

Browser inference gives you the neural net heads:

```text
policy
ownership
value/score
```

But probably not full KataGo search unless you implement a small search layer yourself.

For your project, though, that might be okay — because your current wrapper strategy already works as:

```text
candidate generation
+ ownership evaluation
+ survival objective reranking
```

A browser version can start with:

```text
1. Run model once on current position.
2. Get policy top candidates.
3. For top N candidates:
   - apply candidate locally
   - run model again
   - compute min p_black
4. choose move.
```

That is basically your server architecture, but client-side.

## What changes in difficulty?

Browser inference actually makes your difficulty system even more important.

Because now strength is constrained by local hardware, so “difficulty” should mostly be:

```text
variant awareness
candidate count
temperature
policy anchoring
```

not giant visits.

In browser terms, I’d rename:

```text
Max visits
```

to something like:

```text
Lookahead budget
```

Because you are no longer necessarily running KataGo MCTS visits.

For browser MVP:

```text
Easy:
  top_n = 4
  variant_awareness = 0.35
  temperature = 0.8

Normal:
  top_n = 6
  variant_awareness = 0.6
  temperature = 0.45

Hard:
  top_n = 10
  variant_awareness = 0.85
  temperature = 0.15

Impossible:
  top_n = 16
  variant_awareness = 1.0
  temperature = 0
```

The cost is user latency, not server money.

## New MVP roadmap

I would not rewrite everything immediately. I’d do a spike.

### Spike 1 — Can we run a KataGo-like ONNX model in browser?

Goal:

```text
Load ONNX model in browser and get policy + ownership tensors for one position.
```

Acceptance criteria:

```text
- static page loads model
- position tensor is constructed
- ONNX inference runs
- output tensor shapes are understood
- ownership is visualized as heatmap
```

### Spike 2 — Can we reproduce your current evaluator?

Goal:

```text
Use p_black ownership output to compute min Black ownership.
```

Acceptance criteria:

```text
- Black can choose candidate maximizing min p_black
- White can choose candidate minimizing min p_black
- top candidate list is inspectable
```

### Spike 3 — Can it run acceptably on normal laptops?

Benchmark:

```text
Desktop Chrome / Edge
Mac Safari
Android Chrome if you care
older laptop if available
```

Measure:

```text
model load time
single inference time
top-4 move decision time
top-8 move decision time
memory usage vibes
```

## Updated architecture recommendation

I’d now aim for this as the eventual public project:

```text
survival-go/
  apps/
    web/
      React + TypeScript
      goban UI
      browser inference
  packages/
    survival-engine/
      board representation
      move generation
      survival evaluator
      difficulty policy
    katago-onnx-runtime/
      model loading
      tensor encoding
      output decoding
  docs/
    model-format.md
    browser-inference.md
    licensing.md
```

The Python/FastAPI version can become:

```text
reference-server/
```

or simply:

```text
legacy prototype
```

## One huge product benefit

Browser inference makes the project much more acceptable to share with people:

```text
“Open this page. It runs locally in your browser.”
```

is psychologically very different from:

```text
“I have a GPU server running KataGo, please don’t overload it.”
```

For a Go club / Nihon Ki-in feedback loop, that’s almost perfect.

## Main cautions

The caution list is real but manageable:

```text
1. Model conversion is the hard part.
2. Tensor input/output format must be understood exactly.
3. Browser memory may be annoying.
4. WebGPU support varies by browser/device.
5. Mobile may be slow.
6. You need to keep licensing clean.
7. You are probably using NN eval, not full KataGo search.
```

But strategically? This is a big upgrade.

I’d reframe the project now as:

```text
Survival Go is a browser-native Go variant trainer that uses local neural-network ownership inference to play a total-board-control variant.
```

That’s honestly much stronger than “FastAPI wrapper around KataGo.”

[1]: https://github.com/kaya-go/katago-onnx "GitHub - kaya-go/katago-onnx: Convert KataGo models to ONNX · GitHub"
[2]: https://en.wikipedia.org/wiki/WebGPU?utm_source=chatgpt.com "WebGPU"
[3]: https://arxiv.org/abs/2402.05981?utm_source=chatgpt.com "Anatomizing Deep Learning Inference in Web Browsers"
