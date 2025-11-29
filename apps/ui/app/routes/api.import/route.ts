// eslint-disable-next-line no-restricted-imports -- allowed for route types
import type { Route } from './+types/route.js';
import { ENV } from '#config.js';

/**
 * Generic proxy route for importing external resources.
 * Handles CORS by proxying requests through our backend.
 *
 * Usage: /api/import?url=https://example.com/resource
 */
export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing required parameter: url', { status: 400 });
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return new Response('Invalid URL parameter', { status: 400 });
  }

  // Only allow HTTPS for security
  if (parsedUrl.protocol !== 'https:') {
    return new Response('Only HTTPS URLs are allowed', { status: 400 });
  }

  // Prepare headers from original request, excluding proxy-specific headers
  const headers = new Headers();
  const userAgent = request.headers.get('User-Agent');
  if (userAgent) {
    headers.set('User-Agent', userAgent);
  }

  const accept = request.headers.get('Accept');
  if (accept) {
    headers.set('Accept', accept);
  }

  const acceptEncoding = request.headers.get('Accept-Encoding');
  if (acceptEncoding) {
    headers.set('Accept-Encoding', acceptEncoding);
  }

  // Add GitHub authentication if available and requesting from GitHub API
  const isGitHubApiHost = parsedUrl.hostname === 'api.github.com' || parsedUrl.hostname === 'codeload.github.com';

  if (isGitHubApiHost) {
    const githubToken = ENV.GITHUB_API_TOKEN;
    if (githubToken) {
      headers.set('Authorization', `Bearer ${githubToken}`);
    }
  }

  // Forward the request to the target URL
  const response = await fetch(targetUrl, {
    headers,
    redirect: 'follow',
    method: request.method,
  });

  if (!response.ok) {
    return new Response(`Proxy request failed: ${response.status} ${response.statusText}`, {
      status: response.status,
    });
  }

  // Stream the response back to client
  const responseHeaders = new Headers(response.headers);

  // Ensure Content-Length is preserved for HEAD requests
  const contentLength = response.headers.get('Content-Length');
  if (contentLength) {
    responseHeaders.set('Content-Length', contentLength);
  }

  // Remove CORS headers as they're handled by the proxy
  responseHeaders.delete('Access-Control-Allow-Origin');
  responseHeaders.delete('Access-Control-Allow-Credentials');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
