export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const base64data = reader.result;
      if (typeof base64data === 'string') {
        const a = document.createElement('a');
        a.href = base64data;
        a.download = filename;
        document.body.append(a); // Append to body to ensure click works in all browsers
        a.click();
        a.remove(); // Clean up
      } else {
        // This case should ideally not happen if the input is a Blob and readAsDataURL is used.
        // However, it's good practice to handle potential unexpected outcomes.
        throw new TypeError('Failed to convert blob to base64 string.');
      }
    });
    reader.addEventListener('error', () => {
      // Handle FileReader errors (e.g., if the blob is unreadable)
      throw new Error('FileReader failed to read the blob.');
    });
    reader.readAsDataURL(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
