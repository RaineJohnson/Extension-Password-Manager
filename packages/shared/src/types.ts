// Request body for POST /auth/register
export interface RegisterRequest {
  email: string;
  authCredential: string;
  saltA: string;
  saltB: string;
  encryptedVaultKey: string;
}

// Request body for POST /auth/login
export interface LoginRequest {
  email: string;
  authCredential: string;
}

// Response from POST /auth/login
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  encryptedVaultKey: string;
}

// Response from GET /auth/salts
export interface SaltsResponse {
  saltA: string;
  saltB: string;
}

// Request body for POST /auth/refresh
export interface RefreshRequest {
  refreshToken: string;
}

// Response from POST /auth/refresh
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// Request body for POST /auth/change-password
export interface ChangePasswordRequest {
  oldAuthCredential: string;
  newAuthCredential: string;
  newEncryptedVaultKey: string;
  newSaltA: string;
  newSaltB: string;
}

// Request body for POST /vault/item
export interface CreateVaultItemRequest {
  site: string;
  encryptedBlob: string;
}

// Request body for PUT /vault/item/:id
export interface UpdateVaultItemRequest {
  site?: string;
  encryptedBlob: string;
}

// Shape of a vault item returned by GET /vault and vault CRUD responses
export interface VaultItemResponse {
  id: string;
  site: string;
  encryptedBlob: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Decrypted contents of encryptedBlob — never sent over the wire
export interface PlaintextPayload {
  username: string;
  password: string;
  notes?: string;
}

// Server-side user record — included for shared schema awareness
export interface User {
  id: string;
  email: string;
  authHash: string;
  saltA: string;
  saltB: string;
  encryptedVaultKey: string;
  createdAt: string;
}
