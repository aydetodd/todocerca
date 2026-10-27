/** Preserve returned identity fields, never provider credentials or binary images. */
export function visibleVerificationData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(visibleVerificationData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) =>
      !/token|secret|password|authorization|api.?key|base64|image|imagen|photo|foto/i.test(key)
    ).map(([key, item]) => [key, visibleVerificationData(item)]));
  }
  if (typeof value === 'string' && (value.startsWith('data:image/') || value.length > 20000)) return '[Contenido binario omitido]';
  return value;
}

export function confirmationAllowed(status: string, action: string): boolean {
  return action === 'confirmar' && (status === 'pending' || status === 'confirmed');
}