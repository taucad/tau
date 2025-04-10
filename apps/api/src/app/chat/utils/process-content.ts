/**
 * Process streaming content to detect <think> and </think> tags.
 * @param chunk Current text chunk from the stream
 * @param buffer Current buffer state
 * @param isReasoning Current reasoning mode state
 * @returns Processed content, type, and updated state
 */
export function processContent(
  chunk: string,
  buffer: string,
  isReasoning: boolean,
): {
  content: string;
  type: 'text' | 'reasoning';
  buffer: string;
  isReasoning: boolean;
} {
  // Add the current chunk to the buffer
  let updatedBuffer = buffer + chunk;

  // Check for opening and closing tags
  const openTagIndex = updatedBuffer.indexOf('<think>');
  const closeTagIndex = updatedBuffer.indexOf('</think>');

  let resultContent = '';
  let contentType: 'text' | 'reasoning' = isReasoning ? 'reasoning' : 'text';

  // Process the buffer based on tag positions
  if (openTagIndex !== -1 && closeTagIndex !== -1) {
    // Both tags are present in the buffer
    if (openTagIndex < closeTagIndex) {
      // Normal case: <think>...</think>
      if (openTagIndex > 0) {
        // Text before the opening tag
        resultContent = updatedBuffer.slice(0, openTagIndex);
        contentType = 'text';
      } else {
        // Extract content between tags
        resultContent = updatedBuffer.slice(openTagIndex + 7, closeTagIndex);
        contentType = 'reasoning';
      }

      // Update buffer to content after the closing tag
      updatedBuffer = updatedBuffer.slice(closeTagIndex + 8);
      isReasoning = false;

      // If there's remaining content, recursively process it
      if (updatedBuffer.length > 0) {
        const nextProcess = processContent('', updatedBuffer, isReasoning);
        if (nextProcess.content) {
          // If the next chunk has content with a different type, we'll send separate chunks
          return {
            content: resultContent,
            type: contentType,
            buffer: nextProcess.buffer,
            isReasoning: nextProcess.isReasoning,
          };
        }
        // Update with the recursive call results
        updatedBuffer = nextProcess.buffer;
        isReasoning = nextProcess.isReasoning;
      }
    }
  } else if (openTagIndex !== -1) {
    // Only opening tag found
    if (openTagIndex > 0) {
      // Return content before the tag
      resultContent = updatedBuffer.slice(0, openTagIndex);
      updatedBuffer = updatedBuffer.slice(openTagIndex);
      contentType = 'text';
    } else {
      // We're entering reasoning mode
      isReasoning = true;
      resultContent = updatedBuffer.slice(7); // Skip "<think>"
      updatedBuffer = '';
      contentType = 'reasoning';
    }
  } else if (closeTagIndex === -1) {
    // No tags found, return current chunk with current mode
    resultContent = updatedBuffer;
    updatedBuffer = '';
  } else {
    // Only closing tag found
    resultContent = updatedBuffer.slice(0, closeTagIndex);
    updatedBuffer = updatedBuffer.slice(closeTagIndex + 8);
    isReasoning = false;
    contentType = 'reasoning';

    // If there's remaining content, process it
    if (updatedBuffer.length > 0) {
      const nextProcess = processContent('', updatedBuffer, isReasoning);
      if (nextProcess.content) {
        return {
          content: resultContent,
          type: contentType,
          buffer: nextProcess.buffer,
          isReasoning: nextProcess.isReasoning,
        };
      }
      // Update with the recursive call results
      updatedBuffer = nextProcess.buffer;
      isReasoning = nextProcess.isReasoning;
    }
  }

  return {
    content: resultContent,
    type: contentType,
    buffer: updatedBuffer,
    isReasoning: isReasoning,
  };
}
