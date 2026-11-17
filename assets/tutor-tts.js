// Custom words and sentences are synthesised in the learner's browser. The
// worker fetches public model files; the learner's text stays inside the worker.
(() => {
    function runSpeechWorker() {
        const model = 'onnx-community/Kokoro-82M-v1.0-ONNX';
        const revision = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
        const runtime = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
        const onnx = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/ort-wasm-simd-threaded.jsep';
        const modelRoot = 'https://huggingface.co/' + model + '/resolve/';
        const browserFetch = self.fetch.bind(self);
        let newest = 0;
        let queue = Promise.resolve();
        let engine;
        let cache;

        // This Kokoro release looks up voices on the main branch. Pin all
        // upstream model requests, including its internal voice-file lookup.
        self.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input.url ?? String(input);
            if (url.startsWith(modelRoot + 'main/')) {
                const pinned = url.replace(modelRoot + 'main/', modelRoot + revision + '/');
                const response = await browserFetch(pinned, init);
                // Kokoro caches voice payloads even for unsuccessful responses.
                // Reject before an error page can be saved as a voice embedding.
                if (url.includes('/voices/') && !response.ok) {
                    throw new Error('Could not download the tutor voice (' + response.status + ').');
                }
                return response;
            }
            return browserFetch(input, init);
        };

        async function cachedURL(url, type, integrity) {
            let response = await cache?.match(url);
            if (!response) {
                response = await browserFetch(url, {integrity});
                if (!response.ok) throw new Error('Could not download voice software (' + response.status + ').');
                // Private browsing and limited storage can prevent caching.
                try { await cache?.put(url, response.clone()); } catch {}
            }
            return URL.createObjectURL(new Blob([await response.arrayBuffer()], {type}));
        }

        function status(message) {
            if (newest) self.postMessage({id: newest, message});
        }

        async function loadEngine() {
            status('Preparing tutor voices for this device…');
            try { cache = await self.caches?.open('ielts-tutor-runtime-1.2.1'); } catch {}
            const [js, module, wasm] = await Promise.all([
                cachedURL(runtime, 'text/javascript', 'sha384-suR1TeKe6Fe8fT0n/uTWoohnPJrp1zu3z0bj4VH2anmmq739wlmFSnMFJyMYszAC'),
                cachedURL(onnx + '.mjs', 'text/javascript'),
                cachedURL(onnx + '.wasm', 'application/wasm')
            ]);
            const { KokoroTTS, env } = await import(js);
            env.wasmPaths = {mjs: module, wasm};
            let last = -1;
            const tts = await KokoroTTS.from_pretrained(model, {
                dtype: 'q8', device: 'wasm',
                progress_callback(progress) {
                    if (progress.status !== 'progress' || !progress.file.endsWith('.onnx')) return;
                    const step = Math.min(100, Math.floor(progress.progress / 5) * 5);
                    if (Number.isFinite(step) && step > last) {
                        last = step;
                        status('Loading the tutor voice model · ' + step + '%');
                    }
                }
            });
            for (const url of [js, module, wasm]) URL.revokeObjectURL(url);
            return tts;
        }

        // Keep inputs below the model's token window, including long custom
        // examples pasted without sentence breaks.
        function splitText(text) {
            const chunks = [];
            while (text.length > 180) {
                const head = text.slice(0, 180);
                const sentence = [...head.matchAll(/[.!?;]\s+/g)].pop();
                const space = head.lastIndexOf(' ');
                const end = sentence ? sentence.index + 1 : space > 0 ? space : head.length;
                chunks.push(text.slice(0, end).trim());
                text = text.slice(end).trimStart();
            }
            if (text) chunks.push(text);
            return chunks;
        }

        async function generate({id, text, voice, speed}) {
            if (id !== newest) return;
            engine ??= loadEngine();
            const tts = await engine;
            if (id !== newest) return;
            status('Preparing pronunciation…');
            const parts = [];
            for (const chunk of splitText(text.trim())) {
                if (id !== newest) return;
                parts.push(await tts.generate(chunk, {voice, speed}));
            }
            if (id !== newest) return;
            const audio = parts[0];
            if (parts.length > 1) {
                const samples = new Float32Array(parts.reduce((n, part) => n + part.audio.length, 0));
                let offset = 0;
                for (const part of parts) {
                    samples.set(part.audio, offset);
                    offset += part.audio.length;
                }
                audio.audio = samples;
            }
            self.postMessage({id, audio: audio.toBlob()});
        }

        self.onmessage = ({data}) => {
            newest = data.id;
            if (!newest) return;
            queue = queue.then(() => generate(data)).catch(error => {
                self.postMessage({id: data.id, error: error.message || 'Voice synthesis failed.'});
            });
        };
    }

    let worker;
    let pending;
    let sequence = 0;

    function cancel() {
        if (!pending) return;
        pending.reject(new DOMException('Pronunciation changed.', 'AbortError'));
        pending = null;
        worker?.postMessage({id: 0});
    }

    function resetWorker() {
        worker?.terminate();
        worker = null;
    }

    function startWorker() {
        const url = URL.createObjectURL(new Blob(['(', runSpeechWorker.toString(), ')()'], {type: 'text/javascript'}));
        try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
        worker.onmessage = ({data}) => {
            if (!pending || pending.id !== data.id) return;
            if (!pending.isCurrent()) return cancel();
            if (data.message) return pending.onStatus(data.message);
            if (data.audio) {
                pending.resolve(data.audio);
            } else {
                pending.reject(new Error(data.error || 'Could not generate the pronunciation.'));
                // The model runtime can retain rejected promises after network
                // failures. A new worker can retry using any completed downloads.
                resetWorker();
            }
            pending = null;
        };
        worker.onerror = () => {
            pending?.reject(new Error('Could not start the tutor voice engine on this device.'));
            pending = null;
            resetWorker();
        };
    }

    function synthesize(text, {voice, speed = 1, onStatus = () => {}, isCurrent = () => true}) {
        cancel();
        if (!text?.trim() || !voice || !Number.isFinite(speed) || speed <= 0) {
            return Promise.reject(new Error('A word or sentence and tutor voice are required.'));
        }
        return new Promise((resolve, reject) => {
            if (!worker) startWorker();
            const id = ++sequence;
            pending = {id, onStatus, isCurrent, resolve, reject};
            worker.postMessage({id, text, voice, speed});
        });
    }

    window.tutorTTS = {synthesize, cancel};
})();
