// Pure, SDK-free core: calls the real, PAID BlueVetaUpright API
// (https://blueveta.com/api/upright/detect) with the caller's own API key.
//
// Deliberately never calls the free /api/upright/try demo route -- that route
// is IP-rate-limited and scoped to a sample/demo use case, not meant for
// production or agent traffic. Wiring this MCP tool to it instead of the paid
// endpoint would be exactly the "free bypass around paying us" Tomer asked
// about before approving this build (2026-10-29) -- this module's entire
// reason to exist as a separate file is to make that one fact easy to verify
// by reading a single, small, dependency-free function, independent of
// whatever MCP SDK wiring sits on top of it.
//
// Auth contract matches functions/api/upright/detect.js exactly (read
// directly before writing this, not assumed): Authorization: Bearer
// bvu_live_... / bvu_test_..., raw image bytes OR {"url": "..."} JSON body,
// response fields wasAlreadyUpright/rotationClockwise4Axis/confidence4Axis/
// rotationClockwiseFull/confidenceFull/exifOnlyRemainder/resolved/note/
// heicConverted/imageBase64/imageMimeType (locked contract, see
// .claude/rules/upright.md item 9 -- not reinvented here).

export const UPRIGHT_DETECT_URL = 'https://blueveta.com/api/upright/detect'

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'No BlueVetaUpright API key provided. Set the BLUEVETA_UPRIGHT_API_KEY ' +
      'environment variable (recommended, configured once in your MCP client), ' +
      'or pass an apiKey argument on the call. Get a key at https://blueveta.com/upright.'
    )
    this.name = 'MissingApiKeyError'
  }
}

/**
 * @param {object} input
 * @param {string} [input.apiKey] - overrides BLUEVETA_UPRIGHT_API_KEY if given
 * @param {string} [input.imageUrl] - a hosted image URL (server fetches it)
 * @param {string} [input.imageBase64] - raw image bytes, base64-encoded
 * @param {boolean} [input.returnImage] - also get the corrected image back (1.5x priced on the real API)
 * @param {object} [deps]
 * @param {typeof fetch} [deps.fetchImpl] - injectable for tests; defaults to global fetch
 * @param {object} [deps.env] - injectable for tests; defaults to process.env
 */
export async function detectRotation(input, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch
  const env = deps.env ?? process.env

  const apiKey = input?.apiKey || env.BLUEVETA_UPRIGHT_API_KEY
  if (!apiKey) throw new MissingApiKeyError()

  if (!input?.imageUrl && !input?.imageBase64) {
    throw new Error('Provide either imageUrl (a hosted image link) or imageBase64 (raw image bytes, base64-encoded).')
  }

  const url = new URL(UPRIGHT_DETECT_URL)
  if (input.returnImage) url.searchParams.set('returnImage', 'true')

  const headers = { authorization: `Bearer ${apiKey}` }
  let body
  if (input.imageUrl) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify({ url: input.imageUrl })
  } else {
    headers['content-type'] = 'image/jpeg'
    body = Buffer.from(input.imageBase64, 'base64')
  }

  const resp = await fetchImpl(url.toString(), { method: 'POST', headers, body })
  const data = await resp.json()

  if (!resp.ok) {
    const err = new Error(data?.message || data?.code || `BlueVetaUpright API error (HTTP ${resp.status})`)
    err.code = data?.code
    err.status = resp.status
    throw err
  }

  return data
}
