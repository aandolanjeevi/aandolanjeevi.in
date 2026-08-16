# Contributing

Thanks for contributing! :smile:
We love contributions from everyone.
By participating in this project,
you agree to abide by our [code of conduct](./CODE_OF_CONDUCT.md).

We expect everyone to follow the code of conduct
anywhere in our project codebases,
issue trackers, chatrooms, and mailing lists.

The following is a set of guidelines for contributing. Most of these are guidelines, not rules — use your best judgment, and feel free to propose changes to this document in a pull request. The exception is commit messages, which must follow the [Conventional Commits v1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/).

_Note: Contributions should be made via pull requests to the `main` branch of the repository._

## Table of Contents

1. [Styleguides](#styleguides)
2. [What should I know before I get started?](#what-should-i-know-before-i-get-started)
3. [How Can I contribute?](#how-can-i-contribute)
4. [Contributing Code](#contributing-code)

# Guidelines

The following are the guidelines we request you to follow in order to contribute to this project.

## Styleguides

### Commit Messages

Commit messages must follow the [Conventional Commits v1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

The most common types:

```bash
feat: add dark mode          # a new feature (SemVer MINOR)
fix: correct broken nav link # a bug fix (SemVer PATCH)
docs: update setup steps     # documentation-only changes
style: fix lint issues       # formatting/lint; no behavior change
refactor: simplify parser    # code change that is neither a feature nor a fix
```

Also accepted: `build`, `chore`, `ci`, `perf`, `test`, and `revert`.

- **Scope** (optional): a noun describing the section of the codebase affected, in parentheses — e.g. `fix(nav): correct broken link`.
- **Description**: immediately follows the `: ` after the type/scope; keep it a short, lowercase summary.
- **Breaking changes**: append `!` before the colon (`feat!:` or `feat(api)!:`) and/or add a `BREAKING CHANGE: <description>` footer (SemVer MAJOR). `BREAKING-CHANGE` is synonymous.
- **Body** (optional): starts one blank line after the description; free-form, may span multiple paragraphs.
- **Footers** (optional): one blank line after the body, in git-trailer format (`Token: value`); use `-` instead of spaces in tokens (e.g. `Reviewed-by`), except `BREAKING CHANGE`.

> Because PRs are **squash-merged**, the **PR title** must be a valid Conventional Commit too — it becomes the commit message on `main`.

### Issues

```bash
update: Description # if an update is required for a feature
bug: Description # if there is a bug in a particular feature
suggestion: Description # if you want to suggest a better way to implement a feature
```

### Code Styleguide

The code should satisfy the following:

- Have meaningful variable names, either in `snake_case` or `camelCase`.
- Have no `lint` issues.
- Have meaningful file names, directory names and directory structure.
- Have a scope for easy fixing, refactoring and scaling.

## What should I know before I get started

You can contribute to any of the features you want, here's what you need to know:

- How the project works.
- The technology stack used for the project.
- A brief idea about writing documentation.

## How Can I Contribute

You can contribute by:

- Reporting Bugs
- Suggesting Enhancements
- Code Contribution
- Pull Requests

## Contributing Translations

You can contribute translations without setting up anything — the site's
interface strings live in one file per language:

- `locales/en.yaml` (English), `locales/hi.yaml` (हिन्दी), …

**To improve an existing language:** edit its file directly in the GitHub web
UI and open a pull request. Every value is plain text; the keys stay in
English.

**To add a new language:**

1. Copy `locales/en.yaml` to `locales/<code>.yaml` (ISO 639-1 code, e.g.
   `ta` for Tamil) and translate the values.
2. Add the code to `languages` in `_data/site.yaml`.
3. If the language uses a script other than Latin or Devanagari, note it in
   the PR — a maintainer adds the matching Noto font subset
   (`scripts/fetch-fonts.js`).

Resource entries can also carry translations: `title` and `description` are
language-keyed maps, so adding a `ta:` line to any entry is a welcome
contribution on its own. Text shown outside its source language is
automatically marked "(translated from …)".

## Contributing Code

1. Checkout the latest `main` branch to make sure the feature hasn't been implemented or the bug hasn't been fixed yet.
2. Check the issue tracker to make sure someone already hasn't requested it and/or contributed to it.
3. Fork it!
4. Create your feature branch: `git checkout -b feature/my-new-feature`
5. Add your changes: `git add .`
6. Commit your changes: `git commit -am 'feat: add some feature'`
7. Push to the branch: `git push origin feature/my-new-feature`
8. Submit a pull request :sunglasses:

### Pull Requests

Make sure to document the contributions well in the pull request.
Pull requests should have:

- A concise commit message following the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/).
- A description of what was changed/added.

Others will give constructive feedback.
This is a time for discussion and improvements,
and making the necessary changes will be required before we can
merge the contribution.
