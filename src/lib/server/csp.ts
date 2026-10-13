/** Single source of the Content-Security-Policy. Without a nonce (non-HTML responses, fallback) scripts stay 'unsafe-inline'. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce?: string): string {
  const script = nonce ? `script-src 'self' 'nonce-${nonce}'` : "script-src 'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://studio-dev.genlayer.com https://explorer-studio-dev.genlayer.com https://studio.genlayer.com https://explorer-studio.genlayer.com https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://rpc.walletconnect.org https://explorer-api.walletconnect.com https://pulse.walletconnect.org https://api.web3modal.org https://cca-lite.coinbase.com https://keys.coinbase.com https://api.coinbase.com",
    "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.com https://secure.walletconnect.org https://keys.coinbase.com https://*.walletconnect.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
