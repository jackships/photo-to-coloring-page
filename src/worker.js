// Drop-in Web Worker. Create it as a module worker:
//   new Worker(new URL("photo-to-coloring-page/worker", import.meta.url), { type: "module" })
// Post { id, data, width, height, options } (transfer data.buffer); receive { id, data, width, height } or { id, error }.
import { photoToColoringPage } from "./index.js";

self.onmessage = (e) => {
  const { id, data, width, height, options } = e.data;
  try {
    const r = photoToColoringPage(data, width, height, options);
    self.postMessage({ id, data: r.data, width: r.width, height: r.height }, [r.data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
