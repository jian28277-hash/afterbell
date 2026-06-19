import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";

const defaultProxy = process.env.BITGET_PROXY_URL || "http://127.0.0.1:10808";
process.env.HTTP_PROXY ||= process.env.http_proxy || defaultProxy;
process.env.HTTPS_PROXY ||= process.env.https_proxy || defaultProxy;
process.env.http_proxy ||= process.env.HTTP_PROXY;
process.env.https_proxy ||= process.env.HTTPS_PROXY;
process.env.NO_PROXY ||= process.env.no_proxy || "127.0.0.1,localhost";
process.env.no_proxy ||= process.env.NO_PROXY;

const dispatcher = new EnvHttpProxyAgent();

export async function externalFetch(input: string, init: RequestInit = {}) {
  return undiciFetch(input, {
    ...init,
    dispatcher
  } as Parameters<typeof undiciFetch>[1]);
}
