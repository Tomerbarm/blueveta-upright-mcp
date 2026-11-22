# BlueVetaUpright MCP server

An [MCP](https://modelcontextprotocol.io) server that gives any MCP-compatible AI client
(Claude Desktop, and any other MCP-aware agent) a `detect_rotation` tool: checks whether a
product photo is upright and, if not, exactly how many degrees to rotate it.

## How billing works (read this first)

This server is a thin wrapper around the real, **paid** BlueVetaUpright API
(`https://blueveta.com/api/upright/detect`). It is **bring-your-own-key (BYOK)**: every call
bills *your own* BlueVetaUpright account, exactly the same as calling the REST API directly.
There is no free tier hiding behind this tool — get a key and credits at
[blueveta.com/upright](https://blueveta.com/upright).

## Install & configure

```bash
npm install
```

Set your API key as an environment variable (recommended — configure it once in your MCP
client's server config, not per call):

```bash
export BLUEVETA_UPRIGHT_API_KEY=bvu_live_...
```

Then point your MCP client at `node src/server.js` (stdio transport) in this directory. A
call can also override the key per-invocation with an `apiKey` argument if that fits your
client's auth model better than an environment variable.

## Docker

```bash
docker build -t blueveta-upright-mcp .
docker run -i --rm -e BLUEVETA_UPRIGHT_API_KEY=bvu_live_... blueveta-upright-mcp
```

The server speaks MCP over stdio, so run the container with `-i` (interactive, keeps stdin
open) and point your MCP client at the `docker run` command itself as the server's launch
command, rather than at `node src/server.js` directly.

## The tool

`detect_rotation(imageUrl | imageBase64, returnImage?, apiKey?)` → the same response shape
as the REST API: `wasAlreadyUpright`, `rotationClockwise4Axis`, `confidence4Axis`,
`rotationClockwiseFull`, `confidenceFull`, `resolved`, `note`, and (when `returnImage: true`,
priced 1.5x same as the REST API) `imageBase64`/`imageMimeType` of the corrected photo.

## Development

```bash
npm test
```

Runs `detectRotation.js`'s own unit tests — the core HTTP-calling logic (which endpoint,
whose key, what gets sent) is dependency-free and tested with a mocked `fetch`, independent
of the MCP SDK wiring in `server.js`.

## Status

Built and unit-tested (2026-10-29). Published to npm as
[`blueveta-upright-mcp`](https://www.npmjs.com/package/blueveta-upright-mcp)
(v0.1.0, 2026-11-19) and listed on the official
[MCP Registry](https://github.com/modelcontextprotocol/registry) as
`com.blueveta/upright` — genuinely installable via `npx blueveta-upright-mcp`,
not just a registry listing. See `.claude/rules/upright.md` item 26 for the
current real status.
