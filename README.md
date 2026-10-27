# DocSpring — Pipedream components

The DocSpring integration for [Pipedream](https://pipedream.com). Sibling to the
[Zapier](https://github.com/DocSpring/zapier_integration),
[Make](https://github.com/DocSpring/make_integration),
[n8n](https://github.com/DocSpring/n8n_integration), and
[Node-RED](https://github.com/DocSpring/node-red_integration) integrations.

`components/docspring/` mirrors the layout of the
[`PipedreamHQ/pipedream`](https://github.com/PipedreamHQ/pipedream) monorepo (`components/<app>/`): the app file,
27 actions and a webhook source, on DocSpring's API v2. See [`DESIGN.md`](./DESIGN.md) for how they work and
[`CHANGELOG.md`](./CHANGELOG.md) for what changed.

## Status

Not published. The components go to Pipedream as a PR to `PipedreamHQ/pipedream`
([#21947](https://github.com/PipedreamHQ/pipedream/pull/21947)), which waits for Pipedream to register the
`docspring` app with custom-fields auth (`token_id`, `token_secret`, `region`, `custom_host`;
[#21948](https://github.com/PipedreamHQ/pipedream/issues/21948)): `this.$auth` only works for a registered app.

## Tests

```sh
(cd components/docspring && npm install)
npm test
```

The tests (Node 22.3 or later) mock `@pipedream/platform`'s `axios` and block `fetch`, so they make no network
requests. `package.json` and `test/` at the root stay here: only `components/docspring/` goes upstream.

## License

[MIT](LICENSE.md)
