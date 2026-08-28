export let canvas: HTMLCanvasElement;
export let device: GPUDevice;
export let context: GPUCanvasContext;
export let hdr: boolean;

export async function initialize(initCanvas: HTMLCanvasElement, initHdr: boolean = true) {
    canvas = initCanvas;
    hdr = initHdr;

    if (!navigator.gpu) {
        throw Error("WebGPU not supported.");
    }
    
    const adapter: GPUAdapter | null = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw Error("Couldn't request WebGPU adapter.");
    }
    
    const requiredFeatures: GPUFeatureName[] = [
        "float32-filterable" as GPUFeatureName,
        "texture-formats-tier2" as GPUFeatureName
    ];

    device = await adapter.requestDevice({requiredFeatures});
    if (!device) {
        throw Error("Couldn't request WebGPU device.");
    } 

    context = canvas.getContext("webgpu") as GPUCanvasContext;
    
    if (hdr) {
        context.configure({
            device: device,
            alphaMode: "premultiplied",
            format: "rgba16float",
            toneMapping: { mode: "extended" },
        });
    } else {
        context.configure({
            device: device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: "premultiplied",
        });
    }
}