import { MemoryStorage } from '../storage';
import {
  getTrustDirectorySubscriptions,
  validateTrustDirectorySubscription,
  type DirectorySubscription,
} from './types';

describe('trust directory subscriptions', () => {
  it('persists weighted enabled state through extension storage', async () => {
    const storage = new MemoryStorage();
    const configured: DirectorySubscription[] = [
      { url: 'https://directory.example', weight: 0.75, enabled: true },
      { url: 'https://paused.example', weight: 0.25, enabled: false },
    ];

    await storage.set('settings', { trustDirectorySubscriptions: configured });
    const settings = await storage.get<{ trustDirectorySubscriptions: DirectorySubscription[] }>('settings');

    expect(getTrustDirectorySubscriptions(settings!)).toEqual(configured);
  });

  it('migrates legacy URL-only settings with an enabled neutral subscription', () => {
    expect(getTrustDirectorySubscriptions({ trustDirectoryUrls: [' https://legacy.example/ '] })).toEqual([
      { url: 'https://legacy.example/', weight: 1, enabled: true },
    ]);
  });

  it('rejects insecure, credential-bearing, and out-of-range subscriptions', () => {
    expect(validateTrustDirectorySubscription({ url: 'http://directory.example', weight: 1 })).toMatch(/HTTPS/);
    expect(validateTrustDirectorySubscription({ url: 'https://user:pass@directory.example', weight: 1 })).toMatch(/credentials/);
    expect(validateTrustDirectorySubscription({ url: 'https://directory.example?tenant=one', weight: 1 })).toMatch(/query/);
    expect(validateTrustDirectorySubscription({ url: 'https://directory.example#tenant', weight: 1 })).toMatch(/fragment/);
    expect(validateTrustDirectorySubscription({ url: 'https://directory.example', weight: 2 })).toMatch(/between 0 and 1/);
    expect(validateTrustDirectorySubscription({ url: 'https://directory.example', weight: 0.5 })).toBeNull();
  });
});
