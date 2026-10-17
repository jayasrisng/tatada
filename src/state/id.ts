// getRandomValues also works over LAN HTTP, where randomUUID may be unavailable.
export const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
