# Architecture and design

Project Gallery is a local control plane for project checkouts. Its main job is to make local projects visible and operable through one catalogue while keeping each project's own start and stop behaviour in that project.

## Families and instances

A family represents a project identity, usually derived from a normalised Git origin. An instance represents one checkout of that project, such as a clone or worktree. This distinction lets multiple checkouts share a gallery card while keeping their paths, service ports, and process state independent. Projects without a shared Git origin can be grouped manually.

## Discovery and review

Discovery examines direct child directories of configured roots. It records candidates and signals such as Git metadata or common project files. Those signals are evidence for the operator; they do not reliably prove that a directory is runnable. Requiring review avoids silently adding or starting unrelated folders. Projects outside discovery roots can register through the local API.

## Port ownership

The gallery owns a local allocation table for declared services. It assigns a stable, unique port to each service and passes that port through the manifest's environment variable to both lifecycle commands. This allows separate project instances to run side by side without changing their own command interface. A process outside the gallery can still claim a reserved port, so the gallery checks availability when starting an instance and reports conflicts.

## Process lifetime

Project Gallery invokes project-owned lifecycle commands. A gallery process restart must not stop those services: the operator chooses when an instance stops. Keeping lifecycle ownership in each project means the gallery does not need to understand each framework's process manager, containers, or scripts.

## Local boundary

The web server binds to loopback and keeps its catalogue and token in a private user data directory. The registration API uses a generated bearer token. The browser interface and local project integrations can therefore share one machine-local service without exposing the catalogue as a network service by default.

The boundary is intentionally local and single-user. Multi-user access, remote hosting, and distributed port coordination require a different trust and allocation model.

## Interface material and state

The interface uses three material themes: Chalk, Graphite and Workshop. Shared constructions give the shell a matte body, actions raised keys and information areas recessed readouts. Theme values supply surface and ink pairs; action colour is an explicit role shared by links and buttons. A running instance highlights frontend access when available, while an instance that can start highlights its start action.

The browser reconciles collection records by stable family or candidate identity. Unchanged records retain their native DOM nodes, so periodic status checks preserve keyboard focus and open details. When a record changes, the replacement retains local form fields, disclosures, text selection and the command log reading position. Temporarily filtering a record hides its view without discarding its draft; removing the record from the server state discards that local view. Drafts are not saved to storage and do not survive page navigation or reload.

Port and frontend edits use native modal dialogs and form submission. Browser validation runs before port requests; asynchronous failures stay inside the modal with the entered value available for retry.
