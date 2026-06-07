/** Pure JS base64 — SpacetimeDB module runtime has no atob/btoa. */

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Encode(binary: string): string {
  let output = '';
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
    const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;
    const n = (a << 16) | (b << 8) | c;
    output += BASE64[(n >> 18) & 63];
    output += BASE64[(n >> 12) & 63];
    output += i + 1 < binary.length ? BASE64[(n >> 6) & 63] : '=';
    output += i + 2 < binary.length ? BASE64[n & 63] : '=';
  }
  return output;
}

export function base64Decode(input: string): string {
  const cleaned = input.replace(/[^A-Za-z0-9+/=]/g, '');
  if (cleaned.length % 4 === 1) {
    throw new Error('Invalid base64 string');
  }

  let output = '';
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned.charAt(i);
    if (char === '=') break;
    const value = BASE64.indexOf(char);
    if (value < 0) continue;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
}
