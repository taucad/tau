import { storage } from '@/db/storage';
import { useEffect } from 'react';
import type { Build } from '@/types/build';
import { useChat } from '@/contexts/use-chat';
import { sampleBuilds } from './use-builds';
import { useQuery } from '@tanstack/react-query';

// Function to fetch builds
const fetchBuild = async (buildId: string): Promise<Build> => {
  const clientBuild = storage.getBuild(buildId);

  if (clientBuild) {
    return clientBuild;
  } else {
    const sampleBuild = sampleBuilds.find((build) => build.id === buildId);
    if (sampleBuild) {
      return sampleBuild;
    } else {
      throw new Error('Build not found');
    }
  }
};

export function useBuild(buildId: string) {
  const chat = useChat();

  const {
    data: build,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['build', buildId],
    queryFn: () =>
      fetchBuild(buildId).then((build) => {
        chat.setMessages(build.messages);
        return build;
      }),
  });

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

  // Reset messages when the build is unmounted
  useEffect(() => {
    return () => {
      chat.setMessages([]);
    };
  }, [buildId]);

  return {
    build,
    isLoading,
    error,
    chat,
  };
}
