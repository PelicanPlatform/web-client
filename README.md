# Pelican Platform Monorepo

## Publishing

This monorepo contains two independently versioned and published npm packages:
- `@pelicanplatform/web-client` (packages/web-client)
- `@pelicanplatform/components` (packages/components)

To bump the version of a package, run `npm version patch` (or minor/major) in the appropriate package directory, commit the change, and push to main. The GitHub Actions workflow will automatically publish the package if the version is new.
