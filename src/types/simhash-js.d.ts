declare module 'simhash-js' {
  export class SimHash {
    constructor();
    hash(text: string): number;
    static hammingDistance(hash1: number, hash2: number): number;
  }
}