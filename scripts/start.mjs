// App Platform proporciona PORT; Astro debe escuchar en todas las interfaces.
process.env.HOST ||= '0.0.0.0';
await import('../dist/server/entry.mjs');
