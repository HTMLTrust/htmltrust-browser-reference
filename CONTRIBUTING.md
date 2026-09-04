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

## Licensing your contribution

This project uses the [Developer Certificate of Origin](DCO), not a contributor
licence agreement. There is nothing to sign and nobody to email. You keep the
copyright in what you write.

Sign off each commit, which certifies you have the right to submit it under the
project's licence:

```sh
git commit -s -m "your message"
```

That adds a `Signed-off-by: Your Name <you@example.com>` trailer. Use a real
name and a real address. The full text of what you are certifying is in
[DCO](DCO); it is four short clauses and worth reading once.

Your contribution is licensed to the project on the same terms the project uses,
which is the Apache License 2.0 in `LICENSE`. That includes
the patent grant in section 3, which is what makes the code safe for others
to implement against. No additional rights are transferred, and there is no
copyright assignment.

One consequence worth stating plainly: because contributors keep their
copyright, changing the project's licence later would need the agreement of
everyone who has contributed. That is the deliberate trade for having no CLA to
sign, and it is why the licence was settled before inviting contributions.

## Verifying sign-off locally

```sh
git log --format='%h %s%n    %(trailers:key=Signed-off-by)' origin/main..HEAD
```

Every commit in the range should show a trailer. To add one to the last commit:

```sh
git commit --amend -s --no-edit
```
