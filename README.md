# Extension-Password-Manager

A zero-knowledge password manager built as a browser extension. All encryption and decryption happens client-side — the server stores only opaque ciphertext and can never read your vault.

## How It Works

Vault uses a three-layer key hierarchy to protect your credentials:

1. Your **master password** is run through Argon2id (a memory-hard key derivation function) to produce two independent outputs: one for encrypting your vault key, and one for authenticating with the server. The master password itself is never transmitted or stored.
2. A randomly generated **vault key** encrypts and decrypts your stored credentials using AES-256-GCM. This key is wrapped (encrypted) by the derived key and stored on the server in that form.
3. Each **vault item** (username, password, notes) is encrypted individually with a fresh nonce, so the server only ever sees opaque blobs.

This design means a master password change only requires re-wrapping the vault key — not re-encrypting every credential in your vault.

## Features

- AES-256-GCM encryption with per-item nonces
- Argon2id key derivation (64 MB memory cost, 3 iterations)
- Autofill on login forms
- Multi-device sync through an encrypted backend
- Chrome and Firefox support (Manifest V3)

## Design Document

For a detailed walkthrough of the architecture, cryptographic design, threat model, and authentication flows, see the full design document:

[Password Manager MVP — Design Document](https://docs.google.com/document/d/1bBKy-_0sNsH421WW63CQSVsW-JPp1lLEvCM6vf3tGWk/edit?usp=sharing)
