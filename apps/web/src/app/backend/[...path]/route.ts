import type { NextRequest } from 'next/server';

// Proxies browser calls (/backend/*) to the Nest API (/api/*). A route handler is used
// instead of a rewrite so API_URL is read at runtime (the image is built before it is known)
// and the request body is streamed without the proxy body size limit.
export const dynamic = 'force-dynamic';

const HOP_BY_HOP = [
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'expect', // curl sends Expect: 100-continue for big bodies; undici does not support it
  'content-length',
  'accept-encoding',
];

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
  const target = `${apiUrl}/api/${path.join('/')}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // Required by Node's fetch when streaming a request body.
    ...(hasBody ? { duplex: 'half' } : {}),
    redirect: 'manual',
  } as RequestInit);

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
};
