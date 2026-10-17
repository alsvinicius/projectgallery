# How to operate Project Gallery

Use this guide to discover directories, review candidates, and manage registered project instances.

## Start the gallery

From the Project Gallery repository, run:

```sh
make start
```

Open <http://127.0.0.1:4173>. To stop the gallery process, run `make stop` from the repository. Managed project services continue running until you stop each instance in the gallery.

## Choose a visual theme

Use **Tema** in the header to choose **Chalk**, **Graphite**, or **Workshop**. The browser remembers your choice across routes and reloads.

## Keep a review draft while browsing

Expand a candidate to edit its configuration. Unsaved fields and open details remain available during automatic updates and when you filter a candidate out and back in. These drafts last only on the current page: navigating to another route or reloading discards them. A candidate removed from the review queue also loses its draft.

When changing a service port or frontend access, correct any error shown inside the dialog and submit again. **Cancelar** or Escape closes the dialog without saving.

## Configure discovery roots

On first run, the gallery checks direct child directories of `~/Workspace`. To use different roots, stop the gallery, edit `workspaces` in `~/.local/share/project-gallery/config.json`, and start it again. A root contains the project directories to review; discovery does not recurse into subdirectories.

For example, to scan two directories, use an absolute path for each root:

```json
{
  "workspaces": ["/path/to/Code", "/path/to/client-projects"]
}
```

Keep the other keys already present in `config.json`, especially `token`, `portMin`, `portMax`, and `serverPort`; replace only the `workspaces` value. Discovery runs when the gallery starts and whenever you choose **Refresh discovery**. Each direct child directory becomes a review candidate, whether or not it looks like an application.

## Review discovered directories

Open **Approvals**. Use **Add** or **Ignore** on a candidate without expanding it. To correct its name, family, Make targets, or service definitions, expand the candidate and edit its details before adding it. Select several candidates to apply **Add selected** or **Ignore selected** in a batch.

Adding a candidate does not start it. Quick add creates a basic `PORT` service definition; edit the instance later if the project uses multiple services or a different port variable. Use **Refresh discovery** to scan the configured roots again.

For a reliable start, make sure the project's `make start` and `make stop` targets manage all of its services and read the assigned port variables. In the expanded review form, replace the default service with every service that listens on a TCP port. For each service, use a distinct `portEnv` such as `WEB_PORT` or `API_PORT`. The gallery passes the allocated values to both Make targets. See the [version 1 contract](../reference/integration-contract-v1.md) and the [example Makefile](../../../.agents/skills/project-gallery-standard/assets/Makefile.example).

The gallery writes the assigned values to `.project-gallery.mk` in the project root. Include that file from the project's Makefile and add it to `.gitignore`; then `make start` and `make stop` use the catalogue ports whether you run them in this terminal or start the project in the gallery. Reassign a port in the gallery while the project is stopped; the generated file updates with the catalogue.

Starting a project returns the page right away. Its card shows the current startup stage, elapsed time, each service's assigned port and readiness, and the command output. You can continue using the gallery, cancel the startup, or reload the page while it runs. Open command output and its reading position remain stable during automatic status updates.

## Start, access, and stop an instance

Open **Gallery**, select an instance within its family card, and choose **Start**. For a registered browser interface, choose **Open frontend** to open it in a new tab. Use **Configure access** to set a local interface URL for a declared service. The gallery applies the service's assigned port.

If you start the project directly with its Make target, the gallery detects services responding on all of its assigned ports. It then enables frontend access and **Stop**; stopping still runs the project's declared stop command.

Use the star on a project card to add or remove it from **Favorites** in the sidebar. Favorites are saved for the project family and remain available after restarting the gallery.

Choose **Stop** on the instance to run its declared stop command. To stop only the gallery, use `make stop` in the gallery repository; project services remain active.

## Register a project outside the discovery roots

For a new project or one outside the configured roots, add the [example manifest](../../../.agents/skills/project-gallery-standard/assets/project-gallery.example.json) to its root and adapt it to list every service. Implement `make start` and `make stop` so they use each manifest `portEnv`. The [Project Gallery Standard](../../../.agents/skills/project-gallery-standard/SKILL.md) gives the full checklist.

Start Project Gallery and run its CLI from the project directory:

```sh
node /path/to/project-gallery/src/cli.ts register
```

Replace `/path/to/project-gallery` with the location where you cloned Project Gallery. The client reads the local token from the gallery's private data directory. A valid registration appears directly in the catalogue.

The CLI and gallery must run under the same operating-system user because the CLI reads that user's local token. Registration enters the catalogue directly; workspace discovery candidates still require review.
