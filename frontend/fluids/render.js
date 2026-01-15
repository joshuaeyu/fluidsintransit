import { webGpuContext } from "./context.js";

export class RenderApp {
    settings;
    resources = {};
    #renderPipeline;
    #bindGroupLayout;

    constructor(settings) {
        this.settings = settings;
    }

    static async build(settings) {
        const app = new RenderApp(settings);
        await app.#initRenderPipeline();
        return app;
    }

    render(textureView) {
        // Bind group
        const bindGroup = webGpuContext.device.createBindGroup({
            layout: this.#bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.resources.sampler,
                },
                {
                    binding: 1,
                    resource: textureView,
                },
            ]
        });

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

        renderPassEncoder.setPipeline(this.#renderPipeline);
        renderPassEncoder.setVertexBuffer(0, this.resources.vertexBuffer);
        renderPassEncoder.setBindGroup(0, bindGroup);
        renderPassEncoder.draw(6);
        renderPassEncoder.end();
        
        // Submit
        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    async #initRenderPipeline() {
        // Screen quad vertex buffer
        const vertices = new Float32Array([
            -1, -1, 0, 1,     0, 0,
            -1, 1, 0, 1,     0, 1,
            1, -1, 0, 1,     1, 0,
            
            -1, 1, 0, 1,     0, 1,
            1, -1, 0, 1,     1, 0,
            1, 1, 0, 1,     1, 1,
        ]);
        this.resources.vertexBuffer = webGpuContext.device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        webGpuContext.device.queue.writeBuffer(this.resources.vertexBuffer, 0, vertices, 0, vertices.length);
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

        // Shader modules
        const shaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./shaders/render.wgsl", {cache: "reload"}).then(r => r.text()),
        })

        // Texture and sampler
        this.resources.texture = webGpuContext.device.createTexture({
            format: "rgba16float",
            size: [this.settings.M+2, this.settings.N+2],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.resources.sampler = webGpuContext.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
        })

        // Texture/sampler bind group
        this.#bindGroupLayout = webGpuContext.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
            ],
        });

        // Render pipeline
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
                        format: this.settings.hdr ? "rgba16float" : navigator.gpu.getPreferredCanvasFormat(),
                    },
                ],
            },
            // layout: "auto",
            layout: webGpuContext.device.createPipelineLayout({
                bindGroupLayouts: [this.#bindGroupLayout]
            }),
        };

        this.#renderPipeline = await webGpuContext.device.createRenderPipelineAsync(pipelineDescriptor);
    }
}