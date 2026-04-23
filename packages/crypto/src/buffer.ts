/**
 * Best-effort zero of a byte buffer.
 *
 * IMPORTANT: JavaScript does not guarantee that every copy of the bytes
 * has been scrubbed from the V8 heap. Strings are immutable and the GC
 * may have made copies during normal operation. Treat this as
 * defense-in-depth, not a guarantee.
 *
 * Always hold key material in Uint8Array (never strings) and call
 * `zeroBuffer` as soon as the material is no longer needed.
 */
export function zeroBuffer(buf: Uint8Array): void {
  buf.fill(0);
}
