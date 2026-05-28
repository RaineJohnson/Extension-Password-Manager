/**
 * @jest-environment jsdom
 */

import { detectLoginForm } from '../src/content/formDetection';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('detectLoginForm', () => {
  it('returns null when there are no password fields', () => {
    setBody('<input type="text" /><input type="email" />');
    expect(detectLoginForm()).toBeNull();
  });

  it('matches the common email-above-password layout', () => {
    setBody(`
      <form>
        <input type="email" id="email" />
        <input type="password" id="pw" />
        <button type="submit">Sign in</button>
      </form>
    `);
    const result = detectLoginForm();
    expect(result).not.toBeNull();
    expect(result!.passwordInput.id).toBe('pw');
    expect(result!.usernameInput?.id).toBe('email');
  });

  it('matches a text-above-password layout outside a <form>', () => {
    setBody(`
      <div>
        <input type="text" id="user" />
        <input type="password" id="pw" />
      </div>
    `);
    const result = detectLoginForm();
    expect(result!.usernameInput?.id).toBe('user');
  });

  it('picks the nearest preceding candidate when several precede the password', () => {
    setBody(`
      <form>
        <input type="text" id="search" />
        <input type="email" id="email" />
        <input type="password" id="pw" />
      </form>
    `);
    const result = detectLoginForm();
    expect(result!.usernameInput?.id).toBe('email');
  });

  it('returns the password-only case as a fillable form with no username', () => {
    setBody(`
      <form>
        <input type="password" id="pw" />
      </form>
    `);
    const result = detectLoginForm();
    expect(result).not.toBeNull();
    expect(result!.usernameInput).toBeNull();
  });

  it('skips hidden, aria-hidden, disabled, and readonly password fields', () => {
    setBody(`
      <input type="password" hidden />
      <input type="password" aria-hidden="true" />
      <input type="password" disabled />
      <input type="password" readonly />
    `);
    expect(detectLoginForm()).toBeNull();
  });

  it('does not pick a username input that follows the password field', () => {
    setBody(`
      <form>
        <input type="password" id="pw" />
        <input type="text" id="trailing" />
      </form>
    `);
    const result = detectLoginForm();
    expect(result!.usernameInput).toBeNull();
  });

  it('treats `input` without a type as a username candidate', () => {
    setBody(`
      <form>
        <input id="user" />
        <input type="password" id="pw" />
      </form>
    `);
    const result = detectLoginForm();
    expect(result!.usernameInput?.id).toBe('user');
  });
});
