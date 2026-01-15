class WebGpuContext {
    canvas;
    device;
    context;

    async init(canvas) {
        this.canvas = canvas;
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
        this.context.configure({
            device: this.device,
            // format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: "premultiplied",
            format: "rgba16float",
            toneMapping: { mode: "extended" },
        });
    }
}

export const webGpuContext = new WebGpuContext();