// WebCrypto utilities for Vault encryption

export const PBKDF2_ITERATIONS = 100000;
export const SALT_LEN = 16;
export const IV_LEN = 12;

// Get crypto API - works in both window and service worker contexts
const getCrypto = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  if (typeof self !== 'undefined' && self.crypto) {
    return self.crypto;
  }
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  throw new Error('Crypto API not available');
};

/**
 * Generates a random salt.
 */
export function generateSalt(): Uint8Array {
  return getCrypto().getRandomValues(new Uint8Array(SALT_LEN));
}

/**
 * Derives a CryptoKey from a password and salt using PBKDF2.
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const crypto = getCrypto();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any, // Cast to any to avoid TS lib mismatch
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts data using AES-GCM.
 * Returns object containing ciphertext, iv, and salt (needed for decryption, passed in for convenience).
 */
export async function encryptData(
  data: string,
  password: string
): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const crypto = getCrypto();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const encryptedContent = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
    },
    key,
    dataBuffer
  );

  // Convert buffers to base64 for storage
  return {
    ciphertext: arrayBufferToBase64(encryptedContent),
    iv: uint8ArrayToBase64(iv),
    salt: uint8ArrayToBase64(salt),
  };
}

/**
 * Decrypts data using AES-GCM.
 */
export async function decryptData(
  ciphertext: string,
  iv: string,
  salt: string,
  password: string
): Promise<string> {
  const saltBytes = base64ToUint8Array(salt);
  const ivBytes = base64ToUint8Array(iv);
  const ciphertextBytes = base64ToArrayBuffer(ciphertext);

  const key = await deriveKey(password, saltBytes);
  const crypto = getCrypto();

  try {
    const decryptedContent = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as any,
      },
      key,
      ciphertextBytes
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedContent);
  } catch (e) {
    throw new Error('Incorrect password or corrupted data');
  }
}

// Helpers - Base64 encoding/decoding that works in service workers
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  // Use btoa if available (browser), otherwise use manual encoding
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  
  // Manual base64 encoding for service worker context
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < binary.length) {
    const a = binary.charCodeAt(i++);
    const b = i < binary.length ? binary.charCodeAt(i++) : 0;
    const c = i < binary.length ? binary.charCodeAt(i++) : 0;
    
    const bitmap = (a << 16) | (b << 8) | c;
    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += i - 2 < binary.length ? chars.charAt((bitmap >> 6) & 63) : '=';
    result += i - 1 < binary.length ? chars.charAt(bitmap & 63) : '=';
  }
  return result;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  return arrayBufferToBase64(bytes.buffer as ArrayBuffer);
}

function base64ToUint8Array(base64: string): Uint8Array {
  // Use atob if available (browser), otherwise use manual decoding
  let binary_string: string;
  
  if (typeof atob !== 'undefined') {
    binary_string = atob(base64);
  } else {
    // Manual base64 decoding for service worker context
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    base64 = base64.replace(/[^A-Za-z0-9\+\/]/g, '');
    
    while (i < base64.length) {
      const encoded1 = chars.indexOf(base64.charAt(i++));
      const encoded2 = chars.indexOf(base64.charAt(i++));
      const encoded3 = chars.indexOf(base64.charAt(i++));
      const encoded4 = chars.indexOf(base64.charAt(i++));
      
      const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
      
      result += String.fromCharCode((bitmap >> 16) & 255);
      if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
      if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255);
    }
    binary_string = result;
  }
  
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return base64ToUint8Array(base64).buffer as ArrayBuffer;
}