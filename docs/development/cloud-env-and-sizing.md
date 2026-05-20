# Cloud environment and sizing (ECS / Fargate)

Backend tasks run **API-only** (no server-side KataGo). Inference runs in users’ browsers via ONNX; deploy model files with the **frontend** static bundle.

Related docs:

- Topology: [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md)
- Backend image: [cloud-backend-container.md](cloud-backend-container.md)
- Frontend static: [cloud-frontend-static.md](cloud-frontend-static.md)
- Browser inference: [browser-inference-design.md](browser-inference-design.md)

## ECS task environment (backend)

| Variable | Example | Notes |
|----------|---------|-------|
| `SURVIVAL_THRESHOLD` | `0.95` | Survival scoring / resign heuristics |
| `DEFAULT_TOP_N` | `8` | Default engine shortlist for new games |
| `CORS_ALLOW_ORIGINS` | `https://your-cdn.example` | Must include the site origin |

No `KATAGO_*` variables are used.

## Starting sizing (MVP)

| Resource | Starting point | Notes |
|----------|----------------|-------|
| CPU | `0.5`–`1` vCPU | Lightweight JSON API |
| Memory | `512 MB`–`1 GB` | In-memory games only |
| `desiredCount` | `1` | Scale out only after measuring |

Heavy work is client-side ONNX inference; backend CPU scales with concurrent HTTP requests, not neural net size.

## Frontend (build-time)

| Variable | When | Notes |
|----------|------|-------|
| `VITE_API_BASE_URL` | `npm run build` | Public API URL for browser fetches |

See [cloud-frontend-static.md](cloud-frontend-static.md).

## Example ECS env JSON (backend)

```json
[
  { "name": "SURVIVAL_THRESHOLD", "value": "0.95" },
  { "name": "DEFAULT_TOP_N", "value": "8" },
  { "name": "CORS_ALLOW_ORIGINS", "value": "https://app.example.com" }
]
```

## Sessions

Games live in backend memory. Task restarts end in-progress sessions. Users closing the browser leave idle games until `DELETE` or server restart.

## See also

- [cloud-deploy-automation.md](cloud-deploy-automation.md)
- [onnx-model-artifacts.md](onnx-model-artifacts.md)
