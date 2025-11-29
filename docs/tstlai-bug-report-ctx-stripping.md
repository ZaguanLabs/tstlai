# Bug Report: `$ctx:` suffix not stripped by AutoTranslate

## Version

tstlai v0.17.0

## Description

The `$ctx:` contextual string format is not stripped from translated text when using the `AutoTranslate` component for client-side DOM translation. The context hint appears verbatim in the rendered UI.

## Expected Behavior

Text like `Official$ctx:endorsed_by_project` should:

1. Send the context hint to the LLM for disambiguation
2. Strip the `$ctx:...` suffix from the final rendered output
3. Display only `Official` (or its translation) to the user

## Actual Behavior

The full string `Official$ctx:endorsed_by_project` is displayed in the UI without any processing.

## Steps to Reproduce

1. Add contextual string to a React component:

```tsx
const badgeLabels = {
  official: 'Official$ctx:endorsed_by_project',
  stable: 'Stable$ctx:software_stability_not_horse',
};

export function Badge({ badgeKey }) {
  return <span>{badgeLabels[badgeKey]}</span>;
}
```

2. Enable AutoTranslate in layout:

```tsx
<AutoTranslate targetLang={locale} stream={true} streamEndpoint="/api/tstlai/stream" />
```

3. Visit a non-English locale (e.g., `/es`)

4. Observe that badges display `Official$ctx:endorsed_by_project` instead of `Oficial`

## Screenshot

![Context suffix visible in UI](../public/images/bug-ctx-not-stripped.png)

## Suggested Fix

The `AutoTranslate` component should:

1. Detect `$ctx:` in collected text nodes
2. Extract the context hint and pass it to the translation API
3. Strip the `$ctx:...` suffix before updating the DOM

Alternatively, document that `$ctx:` format is **only** for the CLI `generate` command and not supported in runtime translation.

## Workaround

Don't use `$ctx:` format with `AutoTranslate`. Rely on the global `translationContext` config instead:

```typescript
new Tstlai({
  translationContext: 'Tech startup website for AI developer tools',
  // ...
});
```

## Environment

- tstlai: 0.17.0
- Next.js: 16.0.5
- React: 19.x
- Browser: Chrome 131
