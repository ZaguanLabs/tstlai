# Installation

tstlai is available as an npm package.

```bash
npm install tstlai
```

Or using your preferred package manager:

```bash
pnpm add tstlai
# or
yarn add tstlai
```

## Peer Dependencies

The core library has minimal dependencies (`node-html-parser`, `ioredis`, `openai`).

 However, if you are using the **Next.js Client Integration** (`tstlai/client`), you must have React installed:

```bash
npm install react react-dom
```

## TypeScript Support

tstlai is written in TypeScript and ships with type definitions included. No `@types/tstlai` package is required.
