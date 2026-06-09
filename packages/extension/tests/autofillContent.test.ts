/**
 * @jest-environment jsdom
 */

import {
  fillFromMatch,
  isTrustedAutofillActivation,
} from '../src/content/autofill';
import type { DetectedLoginForm } from '../src/content/formDetection';
import { ApiError, sendMessage } from '../src/shared/messages';

jest.mock('../src/shared/messages', () => {
  const actual =
    jest.requireActual<typeof import('../src/shared/messages')>(
      '../src/shared/messages',
    );
  return { ...actual, sendMessage: jest.fn() };
});

const mockedSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;

const TRIGGER_ID = '__pm_autofill_trigger__';

/**
 * Wait out the re-scan pipeline: the MutationObserver callback runs as a
 * microtask, and the rescan it schedules runs on the next animation frame.
 */
async function flushRescan(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe('autofill content script safeguards', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('rejects synthetic page-script activation events', () => {
    // Page JavaScript can call `.click()` on elements injected into the
    // DOM. Browsers mark those events as untrusted, so the content script
    // must treat them as non-gestures and refuse to ask for credentials.
    expect(isTrustedAutofillActivation(new MouseEvent('click'))).toBe(false);
  });

  it('surfaces a toast when the credentials request rejects', async () => {
    // The multi-match picker invokes fillFromMatch as a fire-and-forget
    // callback after onTriggerClicked has already returned, so there is no
    // outer catch. A rejected credentials request must therefore be handled
    // inside fillFromMatch — otherwise it closes the picker, fills nothing,
    // and becomes an unhandled rejection the user never sees.
    mockedSendMessage.mockRejectedValueOnce(new ApiError('LOCKED', 'Vault locked.'));
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    document.body.appendChild(passwordInput);
    const form: DetectedLoginForm = { usernameInput: null, passwordInput };

    await fillFromMatch(form, { id: 'item-1', username: 'octocat' });

    const toast = document.getElementById('__pm_autofill_toast__');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toBe('Vault locked.');
    expect(passwordInput.value).toBe('');
  });

  it('attaches a trigger when an SPA mounts the login form after load', async () => {
    // The module's bootstrap already ran at import time and found nothing,
    // mirroring a page that has no login form in its initial HTML.
    expect(document.getElementById(TRIGGER_ID)).toBeNull();

    // Simulate a client-side render mounting the form after load.
    const username = document.createElement('input');
    username.type = 'email';
    const password = document.createElement('input');
    password.type = 'password';
    document.body.append(username, password);

    await flushRescan();

    expect(document.getElementById(TRIGGER_ID)).not.toBeNull();
  });

  it('drops a stale trigger when the form is unmounted', async () => {
    const password = document.createElement('input');
    password.type = 'password';
    document.body.appendChild(password);
    await flushRescan();
    expect(document.getElementById(TRIGGER_ID)).not.toBeNull();

    // Client-side route change tears the login form out of the DOM. The
    // trigger button must not linger anchored to a form that's gone.
    password.remove();
    await flushRescan();

    expect(document.getElementById(TRIGGER_ID)).toBeNull();
  });
});
