# Contributing

Thanks for helping to improve CineFlix. Bug reports, ideas, documentation fixes and code are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## What this project is, and is not

CineFlix is a client for a media server that **you** run, with content **you** have the rights to. Contributions that locate, scrape,
index or link to unlicensed content, that bypass access controls or DRM, or that add advertising or tracking will not be accepted.

## Before you start

- Search [existing issues](https://github.com/mustafazeya/cineflix-webos/issues) first.
- For anything bigger than a small fix, open an issue to discuss it before writing code. This avoids wasted work.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Reporting a bug

Use the bug report form and include your TV model and webOS version, how you installed the app, the steps to reproduce, and what you expected.
Never paste API keys or tokens. Remove them from screenshots and logs.

## Development setup

See [docs/development.md](docs/development.md). In short: run `node tools/media-server.js`, serve the folder with any static server, and open it in Chrome.
A real TV is needed to confirm remote, focus, Back-key and playback behaviour.

## Pull requests

1. Fork the repository and create a branch from `main`, named for the change, for example `fix-back-warning` or `docs-deployment`.
2. Keep the change focused. Do not mix refactors with fixes.
3. Run the checks in [docs/development.md](docs/development.md#checks) and test the screens you touched, with the remote only (no mouse).
4. Update the docs and [CHANGELOG.md](CHANGELOG.md) when behaviour changes.
5. Open a pull request and fill in the template. Say how you tested it and on which TV.

### Commit messages

Write short, imperative subjects such as `Fix resume position for page players`, and add a body when the reason is not obvious.
One logical change per commit.

### Code and design standards

- Plain JavaScript, no build step, no new runtime dependencies, no third-party CDNs at runtime.
- The TV UI must work with the D-pad alone. Every interactive element is focusable and has a visible focus state.
- Follow the design rules in [docs/architecture.md](docs/architecture.md#design-rules): neutral palette, local fonts, SVG icons, no emoji.
- Never commit secrets. `js/config.local.js` and `*.ipk` must stay out of version control.

## Licensing of contributions

By contributing you agree that your work is licensed under the [MIT License](LICENSE) of this project.
