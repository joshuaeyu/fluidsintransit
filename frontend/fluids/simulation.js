import { webGpuContext } from "./context.js";

export class SimulationApp {
    settings;
    resources = {};
    bindGroups = {}; 
    pipelines = {};
    renderPassDescriptors = {};

    constructor(settings) {
        this.settings = settings;
    }

    static async build(settings) {
        const app = new SimulationApp(settings);
        await app.#initSimulationPipelines();
        return app;
    }

    async addSource(textureArray, idx) {
        const data = new Float32Array(textureArray.width * textureArray.height);
        for (let i = 0; i < data.length/2; i++) {
            data[i] = 1;
        }
        webGpuContext.device.queue.writeTexture(
            { 
                texture: textureArray,
                origin: [0, 0, idx],
            }, 
            data, 
            {
                bytesPerRow: textureArray.width * 4,
            }, 
            {
                width: textureArray.width,
                height: textureArray.height
            });
    }

    async densityStep() {
        // Density step command buffer
        const densityStepCommandEncoder = webGpuContext.device.createCommandEncoder();

        // Advection: d0,v0 -> d1
        const advectionEncoder = densityStepCommandEncoder.beginRenderPass(this.renderPassDescriptors.density[1]); // Target texture
        advectionEncoder.setPipeline(this.pipelines.advect); // Operation
        advectionEncoder.setVertexBuffer(0, this.resources.vertexBuffer);
        advectionEncoder.setBindGroup(0, this.bindGroups.sampler);
        advectionEncoder.setBindGroup(1, this.bindGroups.density[0]); // Input 1 (density is advected)
        advectionEncoder.setBindGroup(2, this.bindGroups.velocity[0]); // Input 2 (along the characteristic (velocity field))
        advectionEncoder.draw(6);
        advectionEncoder.end();
        
        // Diffusion: d1,d2 -> d0; d1,d0 -> d2; d1,d2 -> d0; ...
        let tgt_idx = 0;
        for (let k = 0; k < 20; k++) {
            const diffusionEncoder = densityStepCommandEncoder.beginRenderPass(renderPassDescriptors.density[tgt_idx]); // Target texture
            diffusionEncoder.setPipeline(pipelines.jacobi); // Operation
            diffusionEncoder.setVertexBuffer(0, this.resources.vertexBuffer);
            diffusionEncoder.setBindGroup(0, this.bindGroups.sampler);
            diffusionEncoder.setBindGroup(1, this.bindGroups.density[1]); // Input 1 (density initial state)
            diffusionEncoder.setBindGroup(2, this.bindGroups.density[2-tgt_idx]); // Input 2 (density feedback (current guess))
            diffusionEncoder.setBindGroup(3, this.bindGroups.uniform); // a, c values
            diffusionEncoder.draw(6);
            diffusionEncoder.end();
            tgt_idx = 2 - tgt_idx;
        }
        
        const densityStepCommandBuffer = densityStepCommandEncoder.finish();

        webGpuContext.device.queue.submit([densityStepCommandBuffer]);
    }

    async velocityStep() {
        // // Velocity step command buffer
        // const velocityStepCommandEncoder = webGpuContext.device.createCommandEncoder();

        // // Advection: d0,v0 -> d1
        // advectionEncoder = velocityStepCommandEncoder.beginRenderPass(densityPassDescriptors[1]); // Target texture
        // advectionEncoder.setPipeline(pipelines.advect); // Operation
        // advectionEncoder.setVertexBuffer(0, vertexBuffer);
        // advectionEncoder.setBindGroup(0, sampler);
        // advectionEncoder.setBindGroup(1, this.bindGroups.density[0]); // Input 1 (density is advected)
        // advectionEncoder.setBindGroup(2, velocityBindGroups[0]); // Input 2 (along the characteristic (velocity field))
        // advectionEncoder.draw(6);
        // advectionEncoder.end();
        
        // // Diffusion: d1,d2 -> d0; d1,d0 -> d2; d1,d2 -> d0; ...
        // tgt_idx = 0;
        // for (let k = 0; k < 20; k++) {
        //     const diffusionEncoder = velocityStepCommandEncoder.beginRenderPass(densityPassDescriptors[tgt_idx]); // Target texture
        //     diffusionEncoder.setPipeline(jacobiPipeline); // Operation
        //     diffusionEncoder.setVertexBuffer(0, vertexBuffer);
        //     diffusionEncoder.setBindGroup(0, sampler);
        //     diffusionEncoder.setBindGroup(1, this.bindGroups.density[1]); // Input 1 (density initial state)
        //     diffusionEncoder.setBindGroup(2, this.bindGroups.density[2-tgt_idx]); // Input 2 (density feedback (current guess))
        //     diffusionEncoder.setBindGroup(3, this.bindGroups.uniform); // a, c values
        //     diffusionEncoder.draw(6);
        //     diffusionEncoder.end();
        //     tgt_idx = 2 - tgt_idx;
        // }

        // // Projection
        // // 
        // const divergenceEncoder = velocityStepCommandEncoder.beginRenderPass(densityPassDescriptors[tgt_idx]); // Target texture
        // divergenceEncoder.setPipeline(pipelines.divergence);
        // divergenceEncoder.setBindGroup(0, sampler);
        // divergenceEncoder.setBindGroup(1, this.bindGroups.density[1]); // Input 1 (density initial state)
        // divergenceEncoder.setBindGroup(2, this.bindGroups.density[2-tgt_idx]); // Input 2 (density feedback (current guess))
        // divergenceEncoder.draw(6);
        // divergenceEncoder.end();
        // const pressureEncoder = velocityStepCommandEncoder.beginRenderPass(densityPassDescriptors[tgt_idx]); // Target texture
        // pressureEncoder.setPipeline(jacobiPipeline);
        // pressureEncoder.setBindGroup(0, sampler);
        // pressureEncoder.setBindGroup(1, this.bindGroups.density[1]); // Input 1 (density initial state)
        // pressureEncoder.setBindGroup(2, this.bindGroups.density[2-tgt_idx]); // Input 2 (density feedback (current guess))
        // pressureEncoder.draw(6);
        // pressureEncoder.end();
        // const subgradEncoder = velocityStepCommandEncoder.beginRenderPass(densityPassDescriptors[tgt_idx]); // Target texture
        // subgradEncoder.setPipeline(subtractGradientPipeline);
        // subgradEncoder.setBindGroup(0, sampler);
        // subgradEncoder.setBindGroup(1, this.bindGroups.density[1]); // Input 1 (density initial state)
        // subgradEncoder.setBindGroup(2, this.bindGroups.density[2-tgt_idx]); // Input 2 (density feedback (current guess))
        // subgradEncoder.draw(6);
        // subgradEncoder.end();
        
        // const velocityStepCommandBuffer = velocityStepCommandEncoder.finish();
    }

    async getDensityOutputTextureView() {
        return this.resources.densityTextureViews[1];
    }

    async getVelocityOutputTextureView() {

    }

    async #initSimulationPipelines() {
        // Off-screen quad vertex buffer
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
        const vertexShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./shaders/render.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const jacobiShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./shaders/jacobi.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const advectShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./shaders/advect.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const divergenceShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./shaders/divergence.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const subgradShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./shaders/subgrad.wgsl", {cache: "reload"}).then(r => r.text()),
        });

        // Textures and sampler
        this.resources.velocityTextureArray = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "rg32float",
            size: [canvas.width, canvas.height, 3],
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            label: "velocity",
        });
        this.resources.densityTextureArray = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "r32float",
            size: [canvas.width, canvas.height, 3],
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            label: "density",
        });
        this.resources.sampler = webGpuContext.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
        });

        // Texture views
        this.resources.velocityTextureViews = [0,1,2].map(
            (i) => this.resources.velocityTextureArray.createView({ dimension: "2d", baseArrayLayer: i })
        );
        this.resources.densityTextureViews = [0,1,2].map(
            (i) => this.resources.densityTextureArray.createView({ dimension: "2d", baseArrayLayer: i })
        );

        // Uniform buffer - a, c
        const uniformBufferSize = 2 * 4;
        this.resources.uniformBuffer = webGpuContext.device.createBuffer({
            size: uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.resources.uniformValues = new Float32Array([1, 1]);
        
        // Bind group layouts
        const samplerBindGroupLayout = webGpuContext.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
            ],
        });
        const textureBindGroupLayout = webGpuContext.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        viewDimension: "2d",
                    },
                },
            ],
        });
        const uniformBindGroupLayout = webGpuContext.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });

        // Bind groups
        this.bindGroups.sampler = webGpuContext.device.createBindGroup({
            layout: samplerBindGroupLayout,
            entries: [
                { binding: 0, resource: this.resources.sampler },
            ],
        });
        this.bindGroups.velocity = [0,1,2].map(
            (i) => webGpuContext.device.createBindGroup({
                layout: textureBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.resources.velocityTextureViews[i] },
                ],
            }),
        );
        this.bindGroups.density = [0,1,2].map(
            (i) => webGpuContext.device.createBindGroup({
                layout: textureBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.resources.velocityTextureViews[i] },
                ],
            }),
        );
        this.bindGroups.uniform = webGpuContext.device.createBindGroup({
            layout: uniformBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.resources.uniformBuffer } },
            ],
        });

        // Simulaton render pipelines
        const pipelineLayout = webGpuContext.device.createPipelineLayout({
            bindGroupLayouts: [samplerBindGroupLayout, textureBindGroupLayout, textureBindGroupLayout],
        });
        const jacobiPipelineLayout = webGpuContext.device.createPipelineLayout({
            bindGroupLayouts: [samplerBindGroupLayout, textureBindGroupLayout, textureBindGroupLayout, uniformBindGroupLayout],
        });
        const vertexStageDescriptor = {
            module: vertexShaderModule,
            entryPoint: "vertex_main",
            buffers: vertexBufferDescriptor,
        };

        const constants = { dt: this.settings.dt, M: this.settings.M, N: this.settings.N };

        this.pipelines.jacobi = this.#createSimulationPipeline(jacobiPipelineLayout, vertexStageDescriptor, jacobiShaderModule, "jacobi", "r32float", constants);
        this.pipelines.jacobiVec2 = this.#createSimulationPipeline(jacobiPipelineLayout, vertexStageDescriptor, jacobiShaderModule, "jacobi_vec2", "rg32float", constants);
        this.pipelines.advect = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, advectShaderModule, "advect", "r32float", constants);
        this.pipelines.advectVec2 = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, advectShaderModule, "advect_vec2", "rg32float", constants);
        this.pipelines.divergence = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, divergenceShaderModule, "divergence", "r32float", constants);
        this.pipelines.subgrad = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, subgradShaderModule, "subtract_gradient", "rg32float", constants);

        // Simulation render pass descriptors
        this.renderPassDescriptors.velocity = [0,1,2].map(
            (i) => ({
                colorAttachments: [
                    { loadOp: "clear", storeOp: "store", view: this.resources.velocityTextureViews[i] },
                ],
            })
        );
        this.renderPassDescriptors.density = [0,1,2].map(
            (i) => ({
                colorAttachments: [
                    { loadOp: "clear", storeOp: "store", view: this.resources.densityTextureViews[i] },
                ],
            })
        );

        // densityStep();
        await this.addSource(this.resources.densityTextureArray, 1);
    }

    #createSimulationPipeline(layout, vertex, module, entryPoint, format, constants) {
        const pipeline = webGpuContext.device.createRenderPipeline({
            layout: layout,
            vertex: vertex,
            fragment: {
                module: module,
                entryPoint: entryPoint,
                targets: [
                    {
                        format: format
                    },
                ],
                constants: constants,
            },
        });
        return pipeline;
    }

}