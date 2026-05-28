/**
 * Fill an `<input>` in a way that React-, Vue-, and Svelte-controlled
 * components register the change.
 *
 * Why this is non-trivial: React installs an instance-level value-property
 * descriptor on each mounted input so it can detect external mutations.
 * A plain `el.value = x` writes through that descriptor and React's
 * `onChange` never sees the new value. The fix is to invoke the *native*
 * `HTMLInputElement.prototype` setter directly (so React's descriptor is
 * bypassed) and then dispatch a bubbling `input` event for React, plus
 * a bubbling `change` event for Vue/legacy listeners.
 */

export function fillField(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  if (nativeSetter !== undefined) {
    nativeSetter.call(input, value);
  } else {
    // Should never happen in a real browser; jsdom + spec-conformant
    // engines all install a setter. Fall back so we don't silently
    // skip filling on an obscure runtime.
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
