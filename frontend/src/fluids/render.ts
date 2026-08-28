import type { Settings } from "../types/settings.js";
import * as webGpuContext from "./context.js";

export class Renderer {
    // Fluid sim settings
    settings: Settings;
    // WebGPU resources
    private readonly bindGroupMap: Map<GPUTextureView, GPUBindGroup> = new Map<GPUTextureView, GPUBindGroup>();
    private readonly renderPipeline: GPURenderPipeline;
    private readonly samplerBindGroup: GPUBindGroup;
    private readonly textureViewBindGroupLayout: GPUBindGroupLayout;
    private readonly vertexBuffer: GPUBuffer;

    private constructor(
        settings: Settings,
        renderPipeline: GPURenderPipeline,
        samplerBindGroup: GPUBindGroup,
        textureViewBindGroupLayout: GPUBindGroupLayout,
        vertexBuffer: GPUBuffer
    ) {
        this.settings = settings;
        this.renderPipeline = renderPipeline;
        this.samplerBindGroup = samplerBindGroup;
        this.textureViewBindGroupLayout = textureViewBindGroupLayout;
        this.vertexBuffer = vertexBuffer;
    }

    static async build(settings: Settings): Promise<Renderer> {
        const vertexBuffer = createVertexBuffer();
        
        const samplerBindGroupLayout = createSamplerBindGroupLayout();
        const samplerBindGroup = createSamplerBindGroup(samplerBindGroupLayout);
        const textureViewBindGroupLayout = createTextureViewBindGroupLayout();
        
        const renderPipeline = await createPipeline(settings, samplerBindGroupLayout, textureViewBindGroupLayout);
        
        return new Renderer(
            settings,
            renderPipeline,
            samplerBindGroup,
            textureViewBindGroupLayout,
            vertexBuffer
        );
    }

    render(textureView: GPUTextureView) {
        if (!this.bindGroupMap.has(textureView)) {
            this.registerTextureView(textureView);
        }
        
        // Command buffer
        const commandEncoder = webGpuContext.device.createCommandEncoder();

        const renderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                    view: webGpuContext.context.getCurrentTexture().createView(),
                },
            ],
        });

        renderPassEncoder.setPipeline(this.renderPipeline);
        renderPassEncoder.setVertexBuffer(0, this.vertexBuffer);
        renderPassEncoder.setBindGroup(0, this.samplerBindGroup);
        renderPassEncoder.setBindGroup(1, this.bindGroupMap.get(textureView)!);
        renderPassEncoder.draw(6);
        renderPassEncoder.end();
        
        // Submit
        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    private registerTextureView(textureView: GPUTextureView) {
        if (this.bindGroupMap.has(textureView)) {
            return;
        }
        const bindGroup = webGpuContext.device.createBindGroup({
            layout: this.textureViewBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: textureView,
                },
            ]
        });
        this.bindGroupMap.set(textureView, bindGroup);
    }
}

function createVertexBuffer(): GPUBuffer {
    // Screen quad vertex buffer
    const vertices = new Float32Array([
        -1, -1, 0, 1,     0, 0,
        -1, 1, 0, 1,     0, 1,
        1, -1, 0, 1,     1, 0,
        
        -1, 1, 0, 1,     0, 1,
        1, -1, 0, 1,     1, 0,
        1, 1, 0, 1,     1, 1,
    ]);
    const vertexBuffer = webGpuContext.device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    webGpuContext.device.queue.writeBuffer(vertexBuffer, 0, vertices, 0, vertices.length);
    
    return vertexBuffer;
}

function createSamplerBindGroupLayout(): GPUBindGroupLayout {
    const bindGroupLayout = webGpuContext.device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {},
            },
        ],
    });
    return bindGroupLayout;
}

function createTextureViewBindGroupLayout(): GPUBindGroupLayout {
    const bindGroupLayout = webGpuContext.device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {},
            },
        ],
    });
    return bindGroupLayout;
}

function createSamplerBindGroup(samplerBindGroupLayout: GPUBindGroupLayout): GPUBindGroup {
    const sampler = webGpuContext.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
    })
    const bindGroup = webGpuContext.device.createBindGroup({
        layout: samplerBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: sampler,
            },
        ]
    });
    
    return bindGroup;
}

async function createPipeline(settings: Settings, samplerBindGroupLayout: GPUBindGroupLayout, textureViewBindGroupLayout: GPUBindGroupLayout): Promise<GPURenderPipeline> {
    const vertexBufferDescriptor = [
        {
            attributes: [
                {
                    shaderLocation: 0,
                    offset: 0,
                    format: "float32x4",
                },
                {
                    shaderLocation: 1,
                    offset: 16,
                    format: "float32x2",
                },
            ],
            arrayStride: 24,
            stepMode: "vertex",
        },
    ];

    // Texture and sampler
    // this.resources.texture = webGpuContext.device.createTexture({
    //     format: "rgba16float",
    //     size: [this.settings.M+2, this.settings.N+2],
    //     usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    // });

    // Render pipeline
    const shaderModule = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/render.wgsl", {cache: "reload"}).then(r => r.text()),
    })
    const pipelineDescriptor = {
        vertex: {
            module: shaderModule,
            entryPoint: "vertex_main",
            buffers: vertexBufferDescriptor,
        },
        fragment: {
            module: shaderModule,
            entryPoint: "fragment_main",
            targets: [
                {
                    format: settings.hdr ? "rgba16float" : navigator.gpu.getPreferredCanvasFormat(),
                },
            ],
        },
        // layout: "auto",
        layout: webGpuContext.device.createPipelineLayout({
            bindGroupLayouts: [
                samplerBindGroupLayout,
                textureViewBindGroupLayout
            ]
        }),
    } as GPURenderPipelineDescriptor;
    
    return webGpuContext.device.createRenderPipelineAsync(pipelineDescriptor);
}