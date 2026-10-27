// Loads the DocSpring components with @pipedream/platform's axios replaced by a recorder, so
// tests see every request and never reach the network. Run with `npm test` (it needs
// `npm install` in components/docspring first, and Node 22.3 or later for module mocks).
import { mock } from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
export const componentsDir = path.join(root, "components", "docspring");

const require = createRequire(path.join(componentsDir, "package.json"));
let platformPath;
try {
  platformPath = require.resolve("@pipedream/platform");
} catch (error) {
  throw new Error(`@pipedream/platform isn't installed: run \`npm install\` in ${componentsDir} first (${error.message})`);
}
const platformUrl = pathToFileURL(platformPath).href;
const realPlatform = await import(platformUrl);

// Nothing in these tests may reach the network.
globalThis.fetch = async (url) => {
  throw new Error(`Network access in a test: ${url}`);
};

export const requests = [];
let responder = () => ({});

/**
 * Sets what the mocked axios returns: a function of the request config that returns the
 * response body, or throws (see `httpError`).
 * @param {function} fn
 */
export const respondWith = (fn) => {
  responder = fn;
};

/**
 * Queues one response body (or error) per request, in order.
 * @param {...*} responses
 */
export const respondInOrder = (...responses) => {
  const queue = [
    ...responses,
  ];
  responder = (config) => {
    if (!queue.length) {
      throw new Error(`Unexpected request: ${config.method || "GET"} ${config.url}`);
    }
    const next = queue.shift();
    if (next instanceof Error) {
      throw next;
    }
    return typeof next === "function"
      ? next(config)
      : next;
  };
};

/**
 * An error shaped like the one @pipedream/platform's axios throws for an HTTP error.
 * @param {number} status
 * @param {*} data
 * @param {string} [statusText]
 * @returns {Error}
 */
export const httpError = (status, data, statusText = "") => {
  const error = new Error(JSON.stringify(data));
  error.response = {
    status,
    statusText,
    data,
  };
  return error;
};

export const reset = () => {
  requests.length = 0;
  responder = () => ({});
};

mock.module(platformUrl, {
  namedExports: {
    ...realPlatform,
    axios: async (_$, config) => {
      // Copy the config the way it would go on the wire (undefined values dropped).
      const sent = JSON.parse(JSON.stringify({
        method: config.method || "GET",
        url: config.url,
        params: config.params,
        data: config.data,
        headers: config.headers,
      }));
      requests.push(sent);
      return responder(sent);
    },
  },
});

const load = async (relative) => (await import(pathToFileURL(path.join(componentsDir, relative)).href)).default;

export const app = await load("docspring.app.mjs");
export const utils = await load("common/utils.mjs");
export const constants = await load("common/constants.mjs");
export const loadComponent = load;

/**
 * The app as a component sees it: its methods, with `this.$auth` set.
 * @param {object} [auth]
 * @returns {object}
 */
export const makeApp = (auth = {}) => ({
  ...app.methods,
  $auth: {
    token_id: "api_test123",
    token_secret: "secret456",
    region: "us",
    ...auth,
  },
});

/**
 * Runs an action's `run()` with the given prop values.
 * @param {object} action
 * @param {object} props
 * @param {object} [auth]
 * @returns {Promise<{result: *, summary: string}>}
 */
export const runAction = async (action, props = {}, auth = {}) => {
  const exports = {};
  const $ = {
    export(key, value) {
      exports[key] = value;
    },
  };
  const context = {
    ...action.methods,
    ...props,
    docspring: makeApp(auth),
  };
  const result = await action.run.call(context, {
    $,
  });
  return {
    result,
    summary: exports.$summary,
  };
};
