import { metadataToClaims } from './metadata-claims';

describe('metadataToClaims', () => {
  it('keeps namespaces distinct and drops empty form values', () => {
    expect(metadataToClaims({
      dublinCore: { title: 'DC title', empty: ' ' },
      openGraph: { title: 'OG title' },
      schemaOrg: { datePublished: '2026-08-28' },
    })).toEqual({
      'dc:title': 'DC title',
      'og:title': 'OG title',
      'schema:datePublished': '2026-08-28',
    });
  });
});
