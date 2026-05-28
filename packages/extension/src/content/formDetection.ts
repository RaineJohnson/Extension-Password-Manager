/**
 * Detect a single login form on the page.
 *
 * Phase 3 strategy: find a visible `<input type="password">`, then walk
 * the surrounding `<form>` (or the document if there isn't one) for the
 * nearest preceding text/email input. That covers the common
 * email-above-password layout that 90% of login pages use.
 *
 * Deliberately conservative:
 *   - No multi-step / wizard logins (Google's separate email-then-password
 *     screen, banking SSO). The two fields never coexist in the DOM at
 *     the same time; supporting them needs cross-navigation memory.
 *   - No shadow-DOM descent. `querySelector` doesn't enter open or
 *     closed shadow roots, so SSO providers that render auth in a
 *     shadow tree are skipped.
 *   - No hidden-honeypot stripping. We do filter `hidden` and
 *     `aria-hidden`, but we don't compute layout-based visibility.
 *
 * TODO(phase-3.5): the multi-step and shadow-DOM cases above.
 */

export interface DetectedLoginForm {
  /**
   * Nearest preceding text/email input within the same scope. `null`
   * is valid — a password-only flow (e.g. confirmation prompt) still
   * counts as a fillable form for the password half.
   */
  usernameInput: HTMLInputElement | null;
  passwordInput: HTMLInputElement;
}

export function detectLoginForm(
  root: ParentNode = document,
): DetectedLoginForm | null {
  const passwords = Array.from(
    root.querySelectorAll('input[type="password"]'),
  ) as HTMLInputElement[];

  for (const passwordInput of passwords) {
    if (!isUsable(passwordInput)) continue;
    return {
      passwordInput,
      usernameInput: findUsernameInput(passwordInput),
    };
  }
  return null;
}

function findUsernameInput(
  passwordInput: HTMLInputElement,
): HTMLInputElement | null {
  const scope: ParentNode =
    passwordInput.form ?? passwordInput.ownerDocument ?? document;
  const candidates = Array.from(
    scope.querySelectorAll(
      'input[type="text"], input[type="email"], input:not([type])',
    ),
  ) as HTMLInputElement[];

  // The nearest *preceding* visible candidate. We loop forward in
  // document order and keep the latest preceding hit — that's the one
  // closest to the password field on the page.
  let best: HTMLInputElement | null = null;
  for (const candidate of candidates) {
    if (candidate === passwordInput) continue;
    if (!isUsable(candidate)) continue;
    const cmp = passwordInput.compareDocumentPosition(candidate);
    if ((cmp & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
      best = candidate;
    }
  }
  return best;
}

function isUsable(el: HTMLInputElement): boolean {
  if (el.hidden) return false;
  if (el.disabled) return false;
  if (el.readOnly) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  return true;
}
