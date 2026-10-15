# Project Gallery

Project Gallery is a local web app for discovering project directories, reviewing them before adding them to a catalogue, assigning unique ports to their services, and starting or stopping project instances.

It also provides a versioned integration contract and a reusable project standard for `make start`, `make stop`, and per-service port variables.

## Requirements

- Linux
- Node.js 24 or later
- GNU Make

## Run locally

```sh
make start
```

Open <http://127.0.0.1:4173>. The first run creates a local configuration and SQLite database under `~/.local/share/project-gallery/`. By default, discovery checks direct child directories of `~/Workspace`; the configured roots can be changed in `config.json`.

Stop the gallery with `make stop`. Managed project services keep running until you stop them from the gallery.

## Documentation

- [First run tutorial](docs/diataxis/tutorials/first-run.md)
- [Operate the gallery](docs/diataxis/how-to/use-gallery.md)
- [Integration contract v1](docs/diataxis/reference/integration-contract-v1.md)
- [Architecture and design](docs/diataxis/explanation/architecture.md)
- [Project Gallery Standard skill](skills/project-gallery-standard/SKILL.md)
- [Documentation index](docs/README.md)

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development environment and contribution checks.
