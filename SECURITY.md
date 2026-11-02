# Security policy

## Supported versions

Security fixes go into the latest release and the `main` branch.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**
(or go to `https://github.com/mustafazeya/cineflix-webos/security/advisories/new`).

Please include what you found, the steps to reproduce it, the affected version or commit, and the impact you expect.
You can expect an acknowledgement within a few days and a fix or an explanation as soon as it can be prepared.
Please give a reasonable time to fix the issue before you disclose it publicly. Credit is given in the release notes unless you prefer not.

## Scope

In scope: the app code in this repository, the reference media server in `tools/`, and the page bridge.
Out of scope: vulnerabilities in webOS, TMDB, SubDL, YouTube or your own media server.

## Notes for users

- Anything you put in `js/config.local.js` is bundled into the `.ipk` and can be read by whoever has the file. Do not share packages you built with your keys.
- The reference media server is a development tool. It is not hardened for the open internet. Put a real server behind HTTPS and authentication.
- Treat TMDB and SubDL keys as secrets. If one leaks, revoke it in the provider's dashboard and create a new one.
