#!/usr/bin/env node
// BlueVetaUpright MCP server -- a standard Model Context Protocol server any
// MCP-compatible AI client (Claude Desktop, etc.) can run, giving an AI agent
// a `detect_rotation` tool backed by the real, paid BlueVetaUpright API.
//
// BYOK (bring your own key): every call bills the CALLER's own
// BlueVetaUpright account, exactly like a direct REST API integration --
// see detectRotation.js's own header for the full reasoning. This file is
// just the MCP protocol wiring (tool registration, stdio transport); the
// actual HTTP call and the "which endpoint, whose key" decision live in
// detectRotation.js, kept separate and dependency-free so that logic can be
// verified and tested on its own.
//
// Real, honest status (2026-10-29): written against the documented
// @modelcontextprotocol/sdk API shape (McpServer + StdioServerTransport +
// zod schemas), but the SDK package is NOT installed in this worktree (same
// pattern as apify-actor/, which also ships an uninstalled package.json --
// real users get it via `npm install` / `npx`). This file itself has not
// been executed end-to-end in this environment; detectRotation.js (the part
// that actually decides which endpoint and whose key gets used) is fully
// unit-tested with zero external dependencies -- see detectRotation.test.mjs.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { detectRotation, MissingApiKeyError } from './detectRotation.js'

const server = new McpServer({ name: 'blueveta-upright', version: '0.1.0' })

server.registerTool(
  'detect_rotation',
  {
    title: 'Detect and fix a product photo\'s rotation',
    description:
      'Checks whether a product photo is upright and, if not, exactly how many degrees to rotate it ' +
      '(clockwise). Returns a confidence score and an honest flag when the answer is uncertain. ' +
      'Bills the caller\'s own BlueVetaUpright account per call, same as the REST API -- requires an ' +
      'API key from https://blueveta.com/upright, set as BLUEVETA_UPRIGHT_API_KEY or passed as apiKey.',
    inputSchema: {
      imageUrl: z.string().url().optional().describe('A hosted image URL for BlueVetaUpright to fetch'),
      imageBase64: z.string().optional().describe('Raw image bytes, base64-encoded (use this OR imageUrl, not both)'),
      returnImage: z.boolean().optional().describe('Also return the corrected image (priced 1.5x, same as the REST API)'),
      apiKey: z.string().optional().describe('Overrides the BLUEVETA_UPRIGHT_API_KEY environment variable for this call'),
    },
  },
  async ({ imageUrl, imageBase64, returnImage, apiKey }) => {
    try {
      const result = await detectRotation({ imageUrl, imageBase64, returnImage, apiKey })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      const message = err instanceof MissingApiKeyError ? err.message : `BlueVetaUpright error: ${err.message}`
      return { content: [{ type: 'text', text: message }], isError: true }
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
