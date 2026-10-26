# Security policy

[Leer en español](SECURITY.es.md)

## Reporting a vulnerability

Please report a vulnerability **privately**. Never open a public issue, pull request or discussion about it.

Use GitHub's private vulnerability reporting: open the **Security** tab of the repository and choose **Report a vulnerability**. Describe what you found, how to reproduce it, and what it lets an attacker do. Please do not include real keys, tokens or personal data in the report.

You will get an answer as soon as the maintainers can read it. Please give us reasonable time to fix the problem before you tell anyone else.

## What counts as a vulnerability

Report anything that breaks one of the protections below, for example:

- A device, or a stranger without a device certificate, gets anything from the server other than an empty 404.
- A key, token, secret address or private file is written to a log, an image, an error message, or a place that git can see.
- The server or a local service listens on an address other than `127.0.0.1`, or a document or tool tells people to do so.
- A view, a block or an integration makes a network request it should not make, or reads an answer without a size limit.
- Input from the network, a file or another program is parsed before its size is limited.
- A tool or a document leads people to weaken security (HTTP without TLS, open file permissions, turning off certificate checks, turning off the list of devices).

Bugs that only affect the owner's own, already trusted configuration (for example, a typo in a views file that makes the server refuse to start) are normal bugs, not vulnerabilities.

## Threat model in five lines

1. **mTLS per display:** every display has its own client certificate, and only the devices on the server's list are served.
2. **Silence toward strangers:** a request without a valid, listed certificate gets an empty 404 that reveals nothing.
3. **Keys stay out of the repository:** keys, tokens and calendar addresses live in files with mode 600 outside the repository, and git refuses them.
4. **Views have no network:** the browser that draws the images runs without network access, with no scripts and no outside requests.
5. **Local only:** the server and its local services listen on `127.0.0.1`; TLS ends at the server, and the internet only sees raw TCP passed through (for example, Tailscale Funnel).

The full guide is in [`docs/guide/en/exposure.md`](docs/guide/en/exposure.md). The detailed rules are in [`docs/seguridad.md`](docs/seguridad.md) (in Spanish).
