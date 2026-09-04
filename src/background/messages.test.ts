import { DEFAULT_SETTINGS } from '../core/common/constants';
import { isExtensionMessage } from '../platforms/common';
import { parseContentMessage, parseOptionsMessage, parsePopupMessage } from './messages';

describe('runtime message parsing', () => {
  it('validates the extension message envelope', () => {
    expect(isExtensionMessage({ type: 'SIGN_OUT' })).toBe(true);
    expect(isExtensionMessage({})).toBe(false);
    expect(isExtensionMessage({ type: 1 })).toBe(false);
    expect(isExtensionMessage([])).toBe(false);
  });

  it('accepts scalar signing claims and rejects nested values', () => {
    expect(parsePopupMessage({
      type: 'SIGN_CONTENT',
      url: 'https://example.test/article',
      claims: { reviewed: true, revision: 2, title: 'Example' },
    })).toEqual({
      type: 'SIGN_CONTENT',
      url: 'https://example.test/article',
      claims: { reviewed: true, revision: 2, title: 'Example' },
    });

    expect(() => parsePopupMessage({
      type: 'SIGN_CONTENT',
      url: 'https://example.test/article',
      claims: { nested: { unsafe: true } },
    })).toThrow('claim nested must be a JSON scalar');
  });

  it('preserves omitted server update fields', () => {
    expect(parsePopupMessage({
      type: 'UPDATE_SERVER',
      id: 'server-1',
      updates: { name: 'Renamed' },
    })).toEqual({ type: 'UPDATE_SERVER', id: 'server-1', updates: { name: 'Renamed' } });
  });

  it('validates content verification summaries', () => {
    expect(parseContentMessage({
      type: 'CONTENT_DETECTED',
      url: 'https://example.test/article',
      verified: false,
    })).toEqual({
      type: 'CONTENT_DETECTED',
      url: 'https://example.test/article',
      verified: false,
    });

    expect(() => parseContentMessage({
      type: 'CONTENT_DETECTED',
      url: 'https://example.test/article',
      verified: 'yes',
    })).toThrow('verified must be a boolean');
  });

  it('rejects removed vote-control messages', () => {
    expect(() => parseContentMessage({
      type: 'SUBMIT_VOTE',
      authorId: 'author-1',
      vote: 'upvote',
    })).toThrow('Unknown content message type: SUBMIT_VOTE');
  });

  it('requires primitive enum values at message boundaries', () => {
    expect(() => parsePopupMessage({
      type: 'CREATE_AUTHOR',
      name: 'Alice',
      keyType: new String('HUMAN'),
    })).toThrow('keyType is invalid');

    expect(() => parseOptionsMessage({
      type: 'UPDATE_SETTINGS',
      settings: { ...DEFAULT_SETTINGS, authMethod: new String('apikey') },
    } as unknown as Parameters<typeof parseOptionsMessage>[0])).toThrow('settings.authMethod is invalid');
  });

  it('validates settings before they reach storage', () => {
    expect(parseOptionsMessage({
      type: 'UPDATE_SETTINGS',
      settings: DEFAULT_SETTINGS,
    }).settings).toMatchObject(DEFAULT_SETTINGS);

    expect(() => parseOptionsMessage({
      type: 'UPDATE_SETTINGS',
      settings: { ...DEFAULT_SETTINGS, autoVerify: 'yes' },
    })).toThrow('settings.autoVerify must be a boolean');
  });
});
