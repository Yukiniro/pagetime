// Classic worker at the extension root. WXT rewrites import.meta.url, so a bundled module worker URL does not resolve.
self.onmessage = event => {
  const file = event.data;
  const read = file && typeof file.text === 'function' ? file.text() : Promise.reject(new Error('read'));
  void Promise.resolve(read).then(
    text => {
      try {
        const source = typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
        self.postMessage({ value: JSON.parse(source) });
      } catch {
        self.postMessage({ code: 'format' });
      }
    },
    () => self.postMessage({ code: 'read' }),
  );
};
