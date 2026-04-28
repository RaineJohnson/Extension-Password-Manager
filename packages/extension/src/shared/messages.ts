/**
 * Typed message protocol between popup and background service worker.
 *
 * Every request is a discriminated union member; each request has exactly
 * one matching response shape, looked up via the `ResponseFor` conditional
 * type. `sendMessage` is the single typed entry point for the popup side —
 * the service worker side dispatches in `background/serviceWorker.ts`.
 *
 * No auth logic lives here. Add a new `{ type: 'foo' }` request and a
 * matching `Foo*` response type, and extend `ResponseFor`.
 */

import browser from 'webextension-polyfill';

export type PingRequest = { type: 'ping' };
export type PingResponse = { type: 'pong'; receivedAt: number };

export type GetStatusRequest = { type: 'getStatus' };
export type GetStatusResponse = { type: 'status'; locked: boolean };

export type Request = PingRequest | GetStatusRequest;
export type Response = PingResponse | GetStatusResponse;

export type ResponseFor<R extends Request> = R extends PingRequest
  ? PingResponse
  : R extends GetStatusRequest
    ? GetStatusResponse
    : never;

export async function sendMessage<R extends Request>(req: R): Promise<ResponseFor<R>> {
  return (await browser.runtime.sendMessage(req)) as ResponseFor<R>;
}
