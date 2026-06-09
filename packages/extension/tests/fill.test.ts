/**
 * @jest-environment jsdom
 */

import { fillField } from '../src/content/fill';

function makeInput(initial = ''): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = initial;
  document.body.appendChild(input);
  return input;
}

describe('fillField', () => {
  it('sets the input value via the native HTMLInputElement setter', () => {
    // Build the input first; `makeInput` itself touches `.value`, which
    // would otherwise show up as a phantom invocation in the spy.
    const input = makeInput();
    const nativeDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    );
    const nativeSetter = nativeDescriptor!.set!;
    const setterSpy = jest.fn(function (this: HTMLInputElement, value: string) {
      nativeSetter.call(this, value);
    });
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      ...nativeDescriptor,
      set: setterSpy,
    });
    try {
      fillField(input, 'hello');
      expect(setterSpy).toHaveBeenCalledTimes(1);
      expect(setterSpy.mock.calls[0]![0]).toBe('hello');
      expect(input.value).toBe('hello');
    } finally {
      Object.defineProperty(HTMLInputElement.prototype, 'value', nativeDescriptor!);
    }
  });

  it('bypasses an instance-level setter (the React tracker pattern)', () => {
    const input = makeInput();
    // Simulate React installing an instance setter that swallows
    // external writes — `fillField` must reach past this to the
    // prototype setter so the underlying value still updates.
    const reactLikeSetter = jest.fn();
    Object.defineProperty(input, 'value', {
      configurable: true,
      get(): string {
        return Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )!.get!.call(input);
      },
      set: reactLikeSetter,
    });
    fillField(input, 'autofilled');
    expect(reactLikeSetter).not.toHaveBeenCalled();
    expect(input.value).toBe('autofilled');
  });

  it('dispatches bubbling input and change events after setting the value', () => {
    const input = makeInput();
    const inputHandler = jest.fn();
    const changeHandler = jest.fn();
    input.addEventListener('input', inputHandler);
    input.addEventListener('change', changeHandler);
    fillField(input, 'value');
    expect(inputHandler).toHaveBeenCalledTimes(1);
    expect(changeHandler).toHaveBeenCalledTimes(1);
    expect(inputHandler.mock.calls[0]![0].bubbles).toBe(true);
    expect(changeHandler.mock.calls[0]![0].bubbles).toBe(true);
    // input must precede change so React-style change-batching sees
    // the new value before the change handler runs.
    expect(inputHandler.mock.invocationCallOrder[0]!).toBeLessThan(
      changeHandler.mock.invocationCallOrder[0]!,
    );
  });
});
