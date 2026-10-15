# Repository guidance

## Project shape

Project Gallery is a local TypeScript application that runs on Node.js 24 or later. The web interface and API share one process, and SQLite stores the local catalogue. Keep user data outside the repository.

## Commands

- `make start` starts the gallery on loopback.
- `make stop` stops only the gallery process; it must not stop managed project services.
- `npm run check` checks the TypeScript modules and embedded UI script.
- `npm test` runs automated tests with an isolated database.

## Implementation and documentation

- Follow the versioned API and manifest contract in `docs/diataxis/reference/integration-contract-v1.md`.
- Preserve loopback-only access and keep registration tokens out of logs and project files.
- Do not automatically approve discovered directories. Discovery creates review candidates; an operator decides what enters the catalogue.
- Starting and stopping managed services must use the commands declared for that instance. Gallery shutdown must leave those services running.
- Update the relevant tutorial, how-to, reference, or explanation when behaviour changes. Keep public examples generic and free of personal paths, secrets, and private project data.
- Run `npm run check`, `npm test`, and `git diff --check` before handing over implementation changes.
