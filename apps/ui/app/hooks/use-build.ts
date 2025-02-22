import { useLoaderData } from '@remix-run/react';
import { storage } from '@/db/storage';
import { useEffect, useState } from 'react';
import type { Build } from '@/types/build';
import { useChat } from '@/contexts/use-chat';
import { loader } from '@/routes/builds_.$id/route';

export function useBuild(buildId: string) {
  const { model } = useLoaderData<typeof loader>();
  const chat = useChat();
  const [build, setBuild] = useState<Build | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // Load initial build data and messages
  useEffect(() => {
    async function loadBuildData() {
      try {
        setIsLoading(true);
        setError(undefined);

        // Get client-side build data
        const clientBuild = storage.getBuild(buildId);
        if (!clientBuild) {
          throw new Error('Build not found');
        }

        setBuild(clientBuild);
        // Load messages into chat context
        chat.setMessages(clientBuild.messages);
      } catch (error) {
        console.error('Failed to load build:', error);
        setError(error instanceof Error ? error.message : 'Failed to load build');
        setBuild(undefined);
      } finally {
        setIsLoading(false);
      }
    }

    loadBuildData();
  }, [buildId, chat]);

  // Save messages to storage when they change
  useEffect(() => {
    if (!build || chat.messages.length === 0) return;

    // Only update if messages have actually changed
    if (JSON.stringify(build.messages) === JSON.stringify(chat.messages)) return;

    // Update the build with new messages
    storage.updateBuild(buildId, {
      messages: chat.messages,
      updatedAt: Date.now(),
    });
  }, [build, buildId, chat.messages]);

  return {
    build,
    model,
    isLoading,
    error,
    chat,
  };
}
