# Integration contract v1

This page describes the version 1 project manifest and the local registration API.

## Manifest

The project root contains a UTF-8 JSON file named `project-gallery.json`.

```json
{
  "version": 1,
  "project": {
    "name": "Example application",
    "familyName": "Example application",
    "source": "https://example.test/group/example",
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

| Field | Requirement | Description |
|---|---|---|
| `version` | Required | Integer `1`. |
| `project.name` | Required | Display name of this checkout. |
| `project.familyName` | Optional | Display name for the project family; defaults to `project.name`. |
| `project.source` | Optional | Git origin used to group checkouts into a family. |
| `project.path` | Optional | Checkout path; defaults to the current directory. Relative paths resolve from the CLI working directory. |
| `services` | Required | Non-empty list of services using TCP ports. |
| `services[].id` | Required | Stable service identifier. |
| `services[].name` | Required | Display name. |
| `services[].portEnv` | Required | Environment variable containing the allocated port. |
| `services[].interfaceUrl` | Optional | Local HTTP(S) browser interface URL. The gallery substitutes the allocated port when opening it. |
| `services[].healthPath` | Optional | HTTP path polled to detect readiness. |

The gallery allocates a stable, unique local port to every service. It exports each allocated value using the service's `portEnv` when invoking both `make start` and `make stop`. Every declared service must use that variable instead of a hard-coded port.

The lifecycle commands are `make start` and `make stop`. Start must launch every declared service and return control while they remain active. Stop must stop all services for the checkout and be safe to repeat. Gallery shutdown does not stop managed services.

Do not include credentials, gallery tokens, or machine-specific absolute paths in a manifest.

## Local API

Base URL: `http://127.0.0.1:<configured-gallery-port>`.

| Method | Route | Authentication | Behaviour |
|---|---|---|---|
| `GET` | `/api/v1/health` | None | Liveness response. |
| `GET` | `/api/v1/catalog` | Bearer token | Returns registered families, instances, and services. |
| `POST` | `/api/v1/register` | Bearer token | Registers a version 1 manifest. |

Registration uses the complete version 1 manifest as its JSON request body. Valid registrations are idempotent by canonical checkout path. A valid request enters the catalogue directly. Invalid input does not create a partial family, instance, or service.

The API listener binds to loopback. The token is generated in `~/.local/share/project-gallery/config.json`; the official CLI reads it without printing it. Mutating API calls require `Authorization: Bearer <local-token>`.
