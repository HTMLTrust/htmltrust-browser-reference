import type { ClaimMap } from './types';

export interface SigningMetadata {
  dublinCore: Record<string, string>;
  openGraph: Record<string, string>;
  schemaOrg: Record<string, string>;
}

/** Preserve metadata namespaces when flattening popup fields into claims. */
export function metadataToClaims(metadata: SigningMetadata): ClaimMap {
  const claims: ClaimMap = {};
  for (const [namespace, values] of [
    ['dc', metadata.dublinCore],
    ['og', metadata.openGraph],
    ['schema', metadata.schemaOrg],
  ] as const) {
    for (const [name, value] of Object.entries(values)) {
      if (value.trim()) claims[`${namespace}:${name}`] = value;
    }
  }
  return claims;
}
