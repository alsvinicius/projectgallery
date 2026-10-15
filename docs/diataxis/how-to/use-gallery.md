# How to operate Project Gallery

Use this guide to discover directories, review candidates, and manage registered project instances.

## Start the gallery

From the Project Gallery repository, run:

```sh
make start
```

Open <http://127.0.0.1:4173>. To stop the gallery process, run `make stop` from the repository. Managed project services continue running until you stop each instance in the gallery.

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

## Start, access, and stop an instance

Open **Gallery**, select an instance within its family card, and choose **Start**. For a registered browser interface, choose **Open frontend** to open it in a new tab. Use **Configure access** to set a local interface URL for a declared service. The gallery applies the service's assigned port.

Choose **Stop** on the instance to run its declared stop command. To stop only the gallery, use `make stop` in the gallery repository; project services remain active.

## Register a project outside the discovery roots

For a new project or one outside the configured roots, add the [example manifest](../../../.agents/skills/project-gallery-standard/assets/project-gallery.example.json) to its root and adapt it to list every service. Implement `make start` and `make stop` so they use each manifest `portEnv`. The [Project Gallery Standard](../../../.agents/skills/project-gallery-standard/SKILL.md) gives the full checklist.

Start Project Gallery and run its CLI from the project directory:

```sh
node /path/to/project-gallery/src/cli.ts register
```

Replace `/path/to/project-gallery` with the location where you cloned Project Gallery. The client reads the local token from the gallery's private data directory. A valid registration appears directly in the catalogue.

The CLI and gallery must run under the same operating-system user because the CLI reads that user's local token. Registration enters the catalogue directly; workspace discovery candidates still require review.
