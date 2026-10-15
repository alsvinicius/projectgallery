# Contributing

Contributions that improve the local project catalogue, integration contract, reliability, accessibility, or documentation are welcome.

## Development setup

Install Node.js 24 or later and GNU Make. The application uses Node's built-in HTTP and SQLite modules and does not require runtime npm packages.

```sh
make start
```

Open <http://127.0.0.1:4173>. The gallery stores local state outside the repository, under `~/.local/share/project-gallery/` by default. Set `GALLERY_DATA_DIR` to use an isolated data directory.

## Before submitting a change

```sh
npm run check
npm test
git diff --check
```

Tests use a temporary local data directory. Use disposable fixtures when changing discovery, registration, process management, or port assignment. Do not test against real projects unless the test requires it and their owners have agreed.

## Documentation

Keep documentation aligned with the user's need:

- Tutorials guide a first successful run.
- How-to guides solve a concrete operating task.
- Reference pages state exact contracts and behaviour.
- Explanations describe design choices and their trade-offs.

Update the relevant Diataxis page when behaviour or the integration contract changes. Keep examples generic; never commit local tokens, personal directory paths, private project inventories, or machine-specific configuration.

## Pull requests

Describe the user-visible change, its verification, and any compatibility impact. Include focused screenshots for interface changes when useful. Keep each change small enough to review.
