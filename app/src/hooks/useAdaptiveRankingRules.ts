import { useEffect, type MutableRefObject } from 'react';
import { fetchAdaptiveRankingSnapshot, type AdaptiveRankingSnapshot } from '../lib/scanApi';

export function useAdaptiveRankingRules(adaptiveRankingRef: MutableRefObject<AdaptiveRankingSnapshot | null>) {
  useEffect(() => {
    void (async () => {
      const snapshot = await fetchAdaptiveRankingSnapshot();
      if (snapshot) {
        adaptiveRankingRef.current = snapshot;
      }
    })();
  }, [adaptiveRankingRef]);
}
