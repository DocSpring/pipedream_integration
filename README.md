# DocSpring — Pipedream components

The DocSpring integration for [Pipedream](https://pipedream.com). Sibling to the
[Zapier](https://github.com/DocSpring/zapier_integration),
[Make](https://github.com/DocSpring/make_integration),
[n8n](https://github.com/DocSpring/n8n_integration), and
[Node-RED](https://github.com/DocSpring/node-red_integration) integrations.

`components/docspring/` mirrors the layout used by the
[`PipedreamHQ/pipedream`](https://github.com/PipedreamHQ/pipedream) monorepo
(`components/<app>/`): the app file, six actions, and a webhook source. See
[`DESIGN.md`](./DESIGN.md) for the port spec.

## Status

Built and validated against the live DocSpring API (all six actions + the template
dropdown + the source flatten). **Submission is a PR to `PipedreamHQ/pipedream`** —
which also requires Pipedream to register the new `docspring` app with a
custom-fields auth (`token_id` + `token_secret`), since `this.$auth` only resolves
for a registered app.

## License

[MIT](LICENSE.md)
