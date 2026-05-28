/**
 * @jest-environment jsdom
 */

import { isTrustedAutofillActivation } from '../src/content/autofill';

describe('autofill content script safeguards', () => {
  it('rejects synthetic page-script activation events', () => {
    // Page JavaScript can call `.click()` on elements injected into the
    // DOM. Browsers mark those events as untrusted, so the content script
    // must treat them as non-gestures and refuse to ask for credentials.
    expect(isTrustedAutofillActivation(new MouseEvent('click'))).toBe(false);
  });
});
