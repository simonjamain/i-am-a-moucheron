// Exits 0 only after its promise settles; a runner that does not wait sees nothing.
await new Promise((r) => setTimeout(r, 200));
console.log('late output');
