# Contributors

Survival Go builds on a long-standing Go exercise: Black tries to prevent White from making even the smallest living shape, while White tries to survive with minimal space.

This project turns that idea into a playable AI-assisted training tool.

## [Kirill Nikolaev](https://github.com/Pythonimous)

- Primary developer, maintainer, and infrastructure sponsor.
- Built the playable Survival Go web prototype, including game flow, presets, board integration, KataGo/ONNX integration, difficulty controls, and deployment pipeline.
- Designed and implemented the initial ownership-based engine approach for total-board-control play: Black raises the weakest point of Black ownership, while White preserves at least one unresolved point.
- Continues to lead product design, implementation, testing, deployment, hosting, and maintenance.

## [Renan Cruz](https://github.com/renanpablocruz)

- Contributed key architectural and scoring insights that shaped the browser-compatible version of the project.
- Suggested moving inference toward a browser/device-side architecture rather than relying only on paid cloud inference, improving accessibility and scalability.
- Proposed the extreme-komi reformulation of the Survival Go objective. Under Chinese area scoring, the smallest unconditionally alive group is 8 points (6 stones making 2 eyes in the corner); on 19x19, this means Black must hold White to 7 points or fewer, which corresponds to komi of 345.5.
- This made it possible to use standard KataGo/ONNX score optimization to encode the Survival objective more directly, reducing reliance on expensive ownership-based candidate reranking in the browser path.
