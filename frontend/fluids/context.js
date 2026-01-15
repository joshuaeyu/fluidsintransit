class WebGpuContext {
    canvas;
    device;
    context;
    hdr;

    async init(canvas, hdr = true) {
        this.canvas = canvas;
        this.hdr = hdr;
        await this.#initWebGPU();
    }

    async #initWebGPU() {
        if (!navigator.gpu) {
            throw Error("WebGPU not supported.");
        }
        
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw Error("Couldn't request WebGPU adapter.");
        }
        
        const requiredFeatures = ["float32-filterable"];

        this.device = await adapter.requestDevice({requiredFeatures});
        if (!this.device) {
            throw Error("Couldn't request WebGPU device.");
        } 

        this.context = this.canvas.getContext("webgpu");
        if (this.hdr) {
            this.context.configure({
                device: this.device,
                alphaMode: "premultiplied",
                format: "rgba16float",
                toneMapping: { mode: "extended" },
            });
        } else {
            this.context.configure({
                device: this.device,
                format: navigator.gpu.getPreferredCanvasFormat(),
                alphaMode: "premultiplied",
            });
        }
    }
}

export const webGpuContext = new WebGpuContext();