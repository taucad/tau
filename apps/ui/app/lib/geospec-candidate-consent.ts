/** Device-local candidate consent coordination, never portable project state. */
export const candidateConsentChannelName = 'tau-geospec-candidate-consent';

/** Serialize opt-out with the final remote publication lease. */
export const withCandidateConsentLock = async <T>(projectId: string, work: () => Promise<T>): Promise<T> => {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    throw new Error('GeoSpec candidate sharing requires browser Web Locks.');
  }
  return navigator.locks.request(`tau-geospec-candidate-consent:${projectId}`, work);
};

/** Wake an in-flight bounded fetch when this device turns sharing off. */
export const announceCandidateConsent = (projectId: string, enabled: boolean): void => {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }
  const channel = new BroadcastChannel(candidateConsentChannelName);
  channel.postMessage({ projectId, enabled });
  channel.close();
};
