/**
 * Content-script bootstrap.
 *
 * Phase 3 behavior:
 *   1. Wait until the DOM is settled, then scan for a single login form.
 *   2. If one is present, render a small "Fill from password manager"
 *      button anchored above the password field. Nothing else happens
 *      without user input.
 *   3. On click (the required user gesture): ask the service worker for
 *      hostname matches; depending on the count, fill directly or
 *      prompt the user to pick an account.
 *   4. Plaintext credentials are released as soon as `fillField` returns
 *      and the local references are dropped.
 *
 * The script never receives the vault key. The service worker validates
 * `sender.id` before returning plaintext; a web page that injects a
 * `runtime.sendMessage` call wouldn't have the right sender id and is
 * rejected.
 */

import browser from 'webextension-polyfill';
import { sendMessage, type AutofillMatch } from '../shared/messages';
import { detectLoginForm, type DetectedLoginForm } from './formDetection';
import { fillField } from './fill';

const BUTTON_ID = '__pm_autofill_trigger__';
const PICKER_ID = '__pm_autofill_picker__';
const TOAST_ID = '__pm_autofill_toast__';

void browser.runtime.id;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tryAttachTrigger, { once: true });
} else {
  queueMicrotask(tryAttachTrigger);
}

function tryAttachTrigger(): void {
  const form = detectLoginForm();
  if (form === null) return;
  if (document.getElementById(BUTTON_ID) !== null) return;
  document.body.appendChild(renderTrigger(form));
}

function renderTrigger(form: DetectedLoginForm): HTMLButtonElement {
  const rect = form.passwordInput.getBoundingClientRect();
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = 'Fill from password manager';
  Object.assign(button.style, {
    position: 'fixed',
    top: `${Math.round(rect.top - 28)}px`,
    left: `${Math.round(rect.left)}px`,
    zIndex: '2147483647',
    padding: '4px 8px',
    fontSize: '12px',
    fontFamily: 'system-ui, sans-serif',
    color: '#fff',
    background: '#2c5fb3',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void onTriggerClicked(form);
  });
  return button;
}

async function onTriggerClicked(form: DetectedLoginForm): Promise<void> {
  const hostname = window.location.hostname;
  try {
    const { matches } = await sendMessage({
      type: 'autofill/matches',
      hostname,
    });
    if (matches.length === 0) {
      showToast('No saved credentials for this site.');
      return;
    }
    if (matches.length === 1) {
      await fillFromMatch(form, hostname, matches[0]!);
      return;
    }
    // Multi-match: surface a picker before any plaintext is requested.
    // Spec asks for the picker in the popup, but content scripts can't
    // portably trigger the browser-action popup. The security boundary
    // is unchanged — we only send the chosen id to the SW, which
    // re-validates the hostname before releasing credentials.
    // TODO(phase-3.5): when `browser.action.openPopup()` is portable,
    // route this through the popup instead.
    renderPicker(matches, (match) => fillFromMatch(form, hostname, match));
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Autofill failed.');
  }
}

async function fillFromMatch(
  form: DetectedLoginForm,
  hostname: string,
  match: AutofillMatch,
): Promise<void> {
  closePicker();
  let credentials: { username: string; password: string } | null = null;
  try {
    credentials = await sendMessage({
      type: 'autofill/credentials',
      id: match.id,
      hostname,
    });
    if (form.usernameInput !== null) {
      fillField(form.usernameInput, credentials.username);
    }
    fillField(form.passwordInput, credentials.password);
  } finally {
    // We can't truly wipe JS strings, but we can stop holding refs so
    // they become eligible for GC. The DOM still holds the password in
    // the input's value — same as if the user had typed it.
    credentials = null;
  }
}

function renderPicker(
  matches: AutofillMatch[],
  onPick: (match: AutofillMatch) => Promise<void>,
): void {
  closePicker();
  const root = document.createElement('div');
  root.id = PICKER_ID;
  Object.assign(root.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    background: 'rgba(0,0,0,0.4)',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif',
  });
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    minWidth: '240px',
    padding: '16px',
    background: '#fff',
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
  });
  const heading = document.createElement('div');
  heading.textContent = 'Pick an account to fill';
  Object.assign(heading.style, {
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '8px',
  });
  panel.appendChild(heading);

  for (const match of matches) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = match.username;
    Object.assign(item.style, {
      display: 'block',
      width: '100%',
      padding: '8px 10px',
      marginBottom: '4px',
      textAlign: 'left',
      fontSize: '13px',
      background: '#fafafa',
      border: '1px solid #ddd',
      borderRadius: '3px',
      cursor: 'pointer',
    });
    item.addEventListener('click', () => {
      void onPick(match);
    });
    panel.appendChild(item);
  }

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  Object.assign(cancel.style, {
    marginTop: '8px',
    padding: '4px 8px',
    fontSize: '12px',
    background: '#fff',
    border: '1px solid #ccc',
    borderRadius: '3px',
    cursor: 'pointer',
  });
  cancel.addEventListener('click', closePicker);
  panel.appendChild(cancel);

  root.appendChild(panel);
  root.addEventListener('click', (event) => {
    if (event.target === root) closePicker();
  });
  document.body.appendChild(root);
}

function closePicker(): void {
  document.getElementById(PICKER_ID)?.remove();
}

function showToast(text: string): void {
  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = text;
  Object.assign(toast.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    padding: '8px 12px',
    background: '#222',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
    borderRadius: '4px',
    zIndex: '2147483647',
  });
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2500);
}
