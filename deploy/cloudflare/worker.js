// Public edge for the service. The origin is never exposed to the internet:
// requests reach it through a Workers VPC Service bound to a Cloudflare
// Zero Trust tunnel (cloudflared running next to the containers, outbound-only).
//
//   browser -> <name>.workers.dev (this Worker) -> env.APP (VPC Service)
//           -> tunnel "twelve-factor-health" -> http://web1:8080 on the compose network
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = `http://web1:8080${url.pathname}${url.search}`;
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
    try {
      return await env.APP.fetch(target, { method: request.method, headers, body: request.body, redirect: 'manual' });
    } catch (err) {
      return Response.json({ status: 'unreachable', error: String(err) }, { status: 502 });
    }
  },
};
