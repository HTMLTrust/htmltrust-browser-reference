# Contributing

Thanks for helping move HTMLTrust forward.

## Contribution Flow

1. Fork the repository.
2. Create a branch for your change.
3. Run the project's existing checks (tests, linters, conformance vectors —
   see the README for the specific commands).
4. Open a pull request against `main`.

For larger changes (a new resolver, a new normalization phase, a new spec
section), open an issue first to talk about scope. Saves everyone time.

## What's in scope

- Code, tests, and conformance vectors that improve any of the reference
  implementations.
- Spec clarifications, examples, and edits that fix ambiguity.
- Bug fixes, security fixes, performance improvements.
- New language bindings of the canonicalization library that pass the
  conformance suite.

## What's out of scope

HTMLTrust is a mechanism, not a value judgment. The project does **not**
accept contributions or issues for:

- Debates over whether AI should or shouldn't be used to author software or specifications.
- Lists of "approved" vs "disapproved" signers.
- Political, religious, or philosophical positions on what content should be trusted.
- Trust directory operator policies — those belong to the directory operators.

The protocol is deliberately neutral so anyone can sign anything they
publish and any user can decide for themselves whom to trust. If you want
to debate the answers, that's a different project.

## Legal and Attribution

- By submitting a contribution, you agree your change is provided under the
  repository's license (`PolyForm-Noncommercial-1.0.0` for code repos,
  `CC-BY-NC-ND-4.0` for the spec and website).
- Keep existing copyright, license, and notice text intact.
- AI-assisted contributions are fine. If the contribution is substantial,
  briefly disclose the tools used in the PR description.

## Code of Conduct

Be technical. Be precise. Don't waste people's time.
