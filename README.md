# Sentirella

Sentirella is an open-source project for sharing selected local folders without uploading their contents to cloud storage first. A folder owner controls when sharing is available, who may access it, and can enable or disable access with a single action.

The current demonstrator combines a desktop client, a web interface, and coordination infrastructure. Files remain on the owner's computer and are transferred only when an authorised recipient requests them. Some parts of the demonstrator currently use third-party services; the roadmap tracks their progressive replacement with provider-neutral, self-hostable components.

## Direction

- Keep original files in their existing local folders.
- Make sharing explicitly controlled by the owner.
- Support access from a conventional web browser without a recipient application.
- Protect content and relevant metadata with end-to-end encryption.
- Prefer direct device connectivity and fall back to blind relays when necessary.
- Allow operators to use compatible third-party services or their own infrastructure.
- Deliver reproducible deployments, tests, technical decisions, and documentation.

## Project status

Sentirella is under active research and development. The public roadmap distinguishes existing demonstrator capabilities from stabilisation, open-source infrastructure work, and later product development.

- [Roadmap](.github/ROADMAP.md)
- [Structured roadmap source](.github/roadmap/sentirella-kanban.yaml)

## License

Sentirella is licensed under the [GNU Affero General Public License v3.0](LICENSE).
