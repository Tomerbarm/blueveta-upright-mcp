// Real tests for the MCP server's core HTTP-calling logic -- $0, no real network, no SDK
// dependency (detectRotation.js itself has zero imports beyond Node builtins, so this
// runs with plain `node` and nothing else installed). Locks in the one fact that matters
// most for this build: every real call hits the PAID blueveta.com/upright/detect route,
// with the caller's own key, never the free /try demo.
// Run: node mcp-server/src/detectRotation.test.mjs
import { detectRotation, MissingApiKeyError, UPRIGHT_DETECT_URL } from './detectRotation.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗ FAIL:', name) } }

function fakeFetch(responseBody, { status = 200 } = {}) {
  const calls = []
  const impl = async (url, opts) => {
    calls.push({ url, opts })
    return { ok: status >= 200 && status < 300, status, json: async () => responseBody }
  }
  return { impl, calls }
}

async function main() {
  // 1. Missing key (no param, no env) -> throws MissingApiKeyError, no network call.
  {
    const { impl, calls } = fakeFetch({})
    let threw = null
    try { await detectRotation({ imageUrl: 'https://x.test/a.jpg' }, { fetchImpl: impl, env: {} }) }
    catch (err) { threw = err }
    ok('missing key -> throws MissingApiKeyError', threw instanceof MissingApiKeyError)
    ok('missing key -> error message points to blueveta.com/upright', /blueveta\.com\/upright/.test(threw?.message ?? ''))
    ok('missing key -> no network call made', calls.length === 0)
  }

  // 2. Real success path, key from explicit apiKey param, imageUrl input.
  {
    const fakeData = { ok: true, wasAlreadyUpright: false, rotationClockwise4Axis: 90, confidence4Axis: 0.97, resolved: true }
    const { impl, calls } = fakeFetch(fakeData)
    const result = await detectRotation({ apiKey: 'bvu_live_test123', imageUrl: 'https://x.test/photo.jpg' }, { fetchImpl: impl, env: {} })
    ok('success -> calls the real PAID detect endpoint, not /try', calls[0].url.startsWith(UPRIGHT_DETECT_URL))
    ok('success -> URL is the real production host', calls[0].url.startsWith('https://blueveta.com/api/upright/detect'))
    ok('success -> forwards the caller\'s own key as Bearer auth', calls[0].opts.headers.authorization === 'Bearer bvu_live_test123')
    ok('success -> JSON body for imageUrl input', calls[0].opts.headers['content-type'] === 'application/json')
    ok('success -> body carries the real url', JSON.parse(calls[0].opts.body).url === 'https://x.test/photo.jpg')
    ok('success -> returns the real response fields verbatim', result.rotationClockwise4Axis === 90 && result.confidence4Axis === 0.97)
  }

  // 3. Key from BLUEVETA_UPRIGHT_API_KEY env var (recommended path), imageBase64 input.
  {
    const { impl, calls } = fakeFetch({ ok: true, wasAlreadyUpright: true })
    await detectRotation({ imageBase64: Buffer.from('fake-jpeg-bytes').toString('base64') }, { fetchImpl: impl, env: { BLUEVETA_UPRIGHT_API_KEY: 'bvu_live_fromEnv' } })
    ok('env-var key -> forwarded correctly', calls[0].opts.headers.authorization === 'Bearer bvu_live_fromEnv')
    ok('imageBase64 -> raw bytes with image/jpeg content-type', calls[0].opts.headers['content-type'] === 'image/jpeg')
    ok('imageBase64 -> decoded to the real original bytes', calls[0].opts.body.toString() === 'fake-jpeg-bytes')
  }

  // 4. Explicit apiKey param overrides the env var, not the other way around.
  {
    const { impl, calls } = fakeFetch({ ok: true })
    await detectRotation({ apiKey: 'bvu_live_explicit', imageUrl: 'https://x.test/a.jpg' }, { fetchImpl: impl, env: { BLUEVETA_UPRIGHT_API_KEY: 'bvu_live_fromEnv' } })
    ok('explicit apiKey param wins over env var', calls[0].opts.headers.authorization === 'Bearer bvu_live_explicit')
  }

  // 5. returnImage=true -> forwarded as the real query param (1.5x priced on the real API).
  {
    const { impl, calls } = fakeFetch({ ok: true, imageBase64: 'ZmFrZQ==' })
    await detectRotation({ apiKey: 'k', imageUrl: 'https://x.test/a.jpg', returnImage: true }, { fetchImpl: impl, env: {} })
    ok('returnImage=true -> real ?returnImage=true forwarded', calls[0].url.includes('returnImage=true'))
  }

  // 6. Neither imageUrl nor imageBase64 given -> real, clear input error, no network call.
  {
    const { impl, calls } = fakeFetch({})
    let threw = null
    try { await detectRotation({ apiKey: 'k' }, { fetchImpl: impl, env: {} }) } catch (err) { threw = err }
    ok('no image input -> throws a clear error', /imageUrl|imageBase64/.test(threw?.message ?? ''))
    ok('no image input -> no network call made', calls.length === 0)
  }

  // 7. Real upstream error (e.g. insufficient_balance) -> surfaced as a real, readable error.
  {
    const { impl } = fakeFetch({ ok: false, code: 'insufficient_balance' }, { status: 402 })
    let threw = null
    try { await detectRotation({ apiKey: 'k', imageUrl: 'https://x.test/a.jpg' }, { fetchImpl: impl, env: {} }) } catch (err) { threw = err }
    ok('upstream 402 -> throws with the real code surfaced', threw?.code === 'insufficient_balance' && threw?.status === 402)
  }

  console.log(`\n${pass} pass / ${fail} fail`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
