# Project Gallery integration contract v1

## Manifest

The project root contains `project-gallery.json`, encoded as UTF-8 JSON. The top-level `version` is the integer `1`. `project.name` and `services` are required. `project.path` defaults to the current directory; relative paths resolve from the working directory used by the CLI. `project.familyName` defaults to the project name. `project.source` is an optional Git origin used for family grouping.

Each service has a stable `id`, display `name`, and `portEnv`. Optional fields are `interfaceUrl` and `healthPath`. The gallery allocates one stable, unique local port to each registered service and exports it under `portEnv` when running `make start`. The assigned port is shown in the local gallery and returned by the registration API.

The gallery currently stores lifecycle commands as `make start` and `make stop`. Both targets must operate on all services belonging to the checkout. `make stop` must be safe to repeat. The gallery invokes fixed argument vectors from the registered manifest/configuration without shell interpolation.

## Local API

- Base URL: `http://127.0.0.1:<configured-gallery-port>`
- Registration: `POST /api/v1/register`
- Catalog: `GET /api/v1/catalog`
- Liveness: `GET /api/v1/health`
- Mutating requests: `Authorization: Bearer <local-token>`
- JSON registration body: the version 1 manifest. The server applies the standard `make start` and `make stop` targets.
- A valid registration is idempotent by canonical project path and goes directly into the catalog. Invalid input does not create a partial family, instance, or service.

The token is generated in the user's private data directory at `~/.local/share/project-gallery/config.json`. Do not copy it into project files, shell history, version control, or logs. The CLI reads it directly. The HTTP listener is bound to loopback only.
