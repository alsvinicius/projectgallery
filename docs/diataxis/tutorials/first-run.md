# First run with Project Gallery

This tutorial starts Project Gallery and guides you through reviewing one discovered directory. You will finish with a local catalogue entry that you can start from the browser.

## 1. Start the gallery

From the repository root, run:

```sh
make start
```

Open <http://127.0.0.1:4173>. On first run, the gallery creates its configuration and database under `~/.local/share/project-gallery/` and scans direct child directories of `~/Workspace`.

## 2. Review a candidate

Open **Approvals**. Choose a directory that contains a project you recognise. The evidence shown on the card helps you identify it; every discovered directory still requires your decision.

Choose **Add**. The candidate moves to the gallery as an instance in a project family. Adding it does not start any processes.

## 3. Start the instance

Open **Gallery**, select the instance on its family card, and choose **Start**. The gallery runs the instance's configured start command and shows its state. If a browser interface is configured, choose **Open frontend** to see it in a new tab.

## 4. Stop the instance

Choose **Stop** on the instance card. This runs the project's configured stop command. The gallery process itself can be stopped with `make stop` from the Project Gallery repository; doing so leaves project services running.

You have reviewed, catalogued, started, and stopped one project instance. For detailed manifest fields and API behaviour, see the [integration contract](../reference/integration-contract-v1.md).
