export type PublicAsset = Readonly<{ base64: string; contentType: string; sha256: string }>;
export type AssetMap = Readonly<Record<string, PublicAsset>>;

/** The build supplies this closed map. Request paths never reach a filesystem. */
export function assetResponse(request: Request, assets: AssetMap): Response | null {
  const pathname = new URL(request.url).pathname;
  if (!Object.hasOwn(assets, pathname)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  const asset = assets[pathname];
  const headers = new Headers({ "Content-Type": asset.contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ETag: '"' + asset.sha256 + '"' });
  if (request.headers.get("if-none-match") === headers.get("etag")) return new Response(null, { status: 304, headers });
  const bytes = Uint8Array.from(atob(asset.base64), value => value.charCodeAt(0));
  headers.set("Content-Length", String(bytes.byteLength));
  return new Response(request.method === "HEAD" ? null : bytes, { headers });
}
