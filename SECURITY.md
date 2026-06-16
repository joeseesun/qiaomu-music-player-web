# Security Policy

## Supported Versions

Security fixes are handled on `main` for the current public repository.

## Reporting A Vulnerability

Please do not open a public issue for secrets, authentication bugs, file exposure, or upload bypasses.

Report privately by emailing or messaging the maintainer:

- GitHub: https://github.com/joeseesun
- X: https://x.com/vista8

Include the affected endpoint, reproduction steps, expected impact, and whether uploaded private media or admin credentials could be exposed.

## Security Notes

- Do not commit `.env`, uploaded music, covers, `data/tracks.json`, or generated private job folders.
- Put public deployments behind HTTPS.
- Use a strong `ADMIN_PASSWORD` and a stable `SESSION_SECRET` in production.
- The public playback API only exposes published tracks.
