// The PostHog browser SDK this app loads: a copy pinned on ciunkos.com (same origin, never a CDN),
// checked by its Subresource Integrity hash. Copied from the owner's generated record of the
// vendored SDK (their site repo writes it with scripts/vendor-posthog.mjs); update all three values
// together when the vendored copy changes.
export const POSTHOG_SDK = {
  version: '1.439.0',
  src: '/vendor/posthog/1.439.0-f32a5541/posthog.js',
  integrity: 'sha384-7tPSHdDbq6CQO0xfuWHqd7w3VefViVXx4eNX/PX8SqAeaMolupVqzMIf22ryGp40',
} as const;
