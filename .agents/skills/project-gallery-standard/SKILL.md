---
name: project-gallery-standard
description: Use when creating, adapting, or integrating a local project managed by Project Gallery. Defines the version 1 manifest, required `make start` and `make stop` lifecycle, per-service port environment variables, and safe registration through the local gallery CLI.
---

# Project Gallery Standard

Use this skill when adding a project to the local Project Gallery or when establishing its run conventions. The gallery controls a project as one instance with one or more services, reserves a stable port for each service, and calls the declared Make targets only when the operator asks it to start or stop.

## Project contract

1. Keep a `project-gallery.json` file at the project root.
2. Provide `make start` to start every declared service and `make stop` to stop every service for this project instance. Both targets must be repeatable. Start must return control after services are launched, while those services continue running after the gallery server closes.
3. Read each service port from the exact environment variable declared in the manifest in both `make start` and `make stop`. Bind local development services to `127.0.0.1` unless the project's local networking needs require otherwise.
4. Declare every service that uses a TCP port, including frontend, backend, workers with HTTP endpoints, and local infrastructure. Give each service a stable ID and a distinct port environment variable.
5. Declare an interface URL only for a browser interface. The gallery adjusts its port to the assigned value when opening it.
6. Do not put credentials, gallery tokens, or machine-specific absolute paths in the manifest.

## Manifest version 1

Copy and edit [the example manifest](assets/project-gallery.example.json). Use [the Makefile example](assets/Makefile.example) as the target shape, then implement the project-specific scripts that start and stop every declared service:

```json
{
  "version": 1,
  "project": {
    "name": "Example app",
    "familyName": "Example app",
    "source": "https://example.test/example/app",
    "path": "."
  },
  "services": [
    {
      "id": "web",
      "name": "Web",
      "portEnv": "WEB_PORT",
      "interfaceUrl": "http://127.0.0.1:3000"
    },
    {
      "id": "api",
      "name": "API",
      "portEnv": "API_PORT",
      "healthPath": "/health"
    }
  ]
}
```

`project.source` is optional. Matching Git origins group checkouts under one family. `project.path` is relative to the current directory; omit it to use the project root. Each service requires `id`, `name`, and `portEnv`; `interfaceUrl` and `healthPath` are optional.

## Register

Start the gallery once, then run the client from the project root:

```sh
node /path/to/project-gallery/src/cli.ts register
```

Replace `/path/to/project-gallery` with the directory where Project Gallery is installed.

The client reads the local token file itself and does not print or copy the token. A successful registration appears directly in the catalog. Invalid manifests are rejected without a partial catalog entry.

## Verify before handoff

- Run `make start` and confirm each declared port is accepting connections.
- Confirm each service reads the assigned environment variable rather than hard-coding a port.
- Run `make stop`; confirm all services for this instance stop.
- Register the project and confirm each service has a different stable port in the gallery.
- Keep `README.md`, `CONTRIBUTING.md`, `.gitignore`, and `AGENTS.md` at the project root, with setup and commands that are actually supported by that project.

For the full manifest/API contract and local security behavior, read [the gallery integration reference](references/contract-v1.md).
