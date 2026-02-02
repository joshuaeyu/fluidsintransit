"use strict";

import { webGpuContext } from "./context.js";

export class SimulationFrag {
    settings;
    resources = {};
    densityOutIdx = 0;
    velocityOutIdx = 0;
    #bindGroups = {}; 
    #pipelines = {};
    #renderPassDescriptors = {};

    constructor(settings) {
        this.settings = settings;
    }

    static async build(settings) {
        const app = new SimulationFrag(settings);
        await app.#initSimulation();
        return app;
    }

    reset() {
        const commandEncoder = webGpuContext.device.createCommandEncoder();
        for (const descriptors of Object.values(this.#renderPassDescriptors)) {
            for (const descriptor of descriptors) {
                const renderPassEncoder = commandEncoder.beginRenderPass(descriptor);
                renderPassEncoder.end();
            }
        }
        webGpuContext.device.queue.submit([commandEncoder.finish()]);
        this.densityOutIdx = 0;
        this.velocityOutIdx = 0;
    }

    async addDensitySource(sourceDataArray) {
        // Use densityTextureArray[2] to temporarily hold the source data
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.resources.densityTextureArray,
                origin: [0, 0, 2],
            }, 
            sourceDataArray, 
            {
                bytesPerRow: this.resources.densityTextureArray.width * 4,
            }, 
            {
                width: this.resources.densityTextureArray.width,
                height: this.resources.densityTextureArray.height,
            });
        // Add source (densityTextureArray[2]) to existing density field (densityTextureArray[this.densityOutIdx])
        const sourceCommandEncoder = webGpuContext.device.createCommandEncoder();
        const sourceEncoder = sourceCommandEncoder.beginRenderPass(this.#renderPassDescriptors.density[1-this.densityOutIdx]);
        sourceEncoder.setPipeline(this.#pipelines.source);
        sourceEncoder.setVertexBuffer(0, this.resources.quadVertexBuffer);
        sourceEncoder.setBindGroup(0, this.#bindGroups.sampler);
        sourceEncoder.setBindGroup(1, this.#bindGroups.density[this.densityOutIdx]);
        sourceEncoder.setBindGroup(2, this.#bindGroups.density[2]);
        sourceEncoder.draw(6);
        sourceEncoder.end();
        webGpuContext.device.queue.submit([sourceCommandEncoder.finish()]);
        this.densityOutIdx = 1 - this.densityOutIdx;
    }

    async addVelocitySource(sourceDataArray) {
        // Use velocityTextureArray[2] to temporarily hold the source data
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.resources.velocityTextureArray,
                origin: [0, 0, 2],
            }, 
            sourceDataArray, 
            {
                bytesPerRow: this.resources.velocityTextureArray.width * 4 * 2,
            }, 
            {
                width: this.resources.velocityTextureArray.width,
                height: this.resources.velocityTextureArray.height,
            }
        );
        // Add source (velocityTextureArray[2]) to existing density field (velocityTextureArray[this.velocityOutIdx])
        const sourceCommandEncoder = webGpuContext.device.createCommandEncoder();
        const sourceEncoder = sourceCommandEncoder.beginRenderPass(this.#renderPassDescriptors.velocity[1-this.velocityOutIdx]);
        sourceEncoder.setPipeline(this.#pipelines.sourceVec2);
        sourceEncoder.setVertexBuffer(0, this.resources.quadVertexBuffer);
        sourceEncoder.setBindGroup(0, this.#bindGroups.sampler);
        sourceEncoder.setBindGroup(1, this.#bindGroups.velocity[this.velocityOutIdx]);
        sourceEncoder.setBindGroup(2, this.#bindGroups.velocity[2]);
        sourceEncoder.draw(6);
        sourceEncoder.end();
        webGpuContext.device.queue.submit([sourceCommandEncoder.finish()]);
        this.velocityOutIdx = 1 - this.velocityOutIdx;
    }

    async densityStep() {
        // Advection + diffusion command buffer
        const advectDiffuseCommandEncoder = webGpuContext.device.createCommandEncoder();

        // Advection
        // - advect: d0/d1 -> d2
        const advectionEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.#renderPassDescriptors.density[2]); // Target texture
        advectionEncoder.setPipeline(this.#pipelines.advect); // Operation
        advectionEncoder.setVertexBuffer(0, this.resources.quadVertexBuffer);
        advectionEncoder.setBindGroup(0, this.#bindGroups.sampler);
        advectionEncoder.setBindGroup(1, this.#bindGroups.density[this.densityOutIdx]); // Input 1 (density is advected)
        advectionEncoder.setBindGroup(2, this.#bindGroups.velocity[this.velocityOutIdx]); // Input 2 (along the characteristic (velocity field))
        advectionEncoder.draw(6);
        advectionEncoder.end();
        // // - set bound: d1 -> d2
        // const boundEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.#renderPassDescriptors.density[2]); // Target texture
        // boundEncoder.setPipeline(this.#pipelines.bound); // Operation
        // boundEncoder.setVertexBuffer(0, this.resources.lineVertexBuffer);
        // boundEncoder.setBindGroup(0, this.#bindGroups.sampler);
        // boundEncoder.setBindGroup(1, this.#bindGroups.density[this.densityOutIdx]); // Input 1 (density is advected)
        // boundEncoder.draw(5);
        // boundEncoder.end();

        // Diffusion
        const a = this.settings.dt * this.settings.dissipation * this.settings.diffusivity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a / this.settings.dissipation;
        this.resources.jacobiUniformValues.set([a, c]);
        webGpuContext.device.queue.writeBuffer(this.resources.jacobiUniformBuffer, 0, this.resources.jacobiUniformValues);
        for (let k = 0; k < 30; k++) {
            // - diffuse: d2 constant; d0 -> d1, d1 -> d0, ...
            const diffusionEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.#renderPassDescriptors.density[1-this.densityOutIdx]); // Target texture
            diffusionEncoder.setPipeline(this.#pipelines.jacobi); // Operation
            diffusionEncoder.setVertexBuffer(0, this.resources.quadVertexBuffer);
            diffusionEncoder.setBindGroup(0, this.#bindGroups.sampler);
            diffusionEncoder.setBindGroup(1, this.#bindGroups.density[2]); // Input 1 (density initial state)
            diffusionEncoder.setBindGroup(2, this.#bindGroups.density[this.densityOutIdx]); // Input 2 (density feedback (current guess))
            diffusionEncoder.setBindGroup(3, this.#bindGroups.jacobiUniform); // a, c values
            diffusionEncoder.draw(6);
            diffusionEncoder.end();
            this.densityOutIdx = 1 - this.densityOutIdx;
            // // - set bound
            // const boundEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.#renderPassDescriptors.density[1-this.densityOutIdx]); // Target texture
            // boundEncoder.setPipeline(this.#pipelines.bound); // Operation
            // boundEncoder.setVertexBuffer(0, this.resources.lineVertexBuffer);
            // boundEncoder.setBindGroup(0, this.#bindGroups.sampler);
            // boundEncoder.setBindGroup(1, this.#bindGroups.density[this.densityOutIdx]); // Input 1 (density is advected)
            // boundEncoder.draw(5);
            // boundEncoder.end();
            // this.densityOutIdx = 1 - this.densityOutIdx;
        }

        webGpuContext.device.queue.submit([advectDiffuseCommandEncoder.finish()]);
    }

    async velocityStep() {
        // Zero out scratch space
        const zeros = new Float32Array(this.resources.scratchTextureArray.width * this.resources.scratchTextureArray.height * this.resources.scratchTextureArray.depthOrArrayLayers);
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.resources.scratchTextureArray,
            }, 
            zeros, 
            {
                bytesPerRow: this.resources.scratchTextureArray.width * 4,
                rowsPerImage: this.resources.scratchTextureArray.height,
            }, 
            {
                width: this.resources.scratchTextureArray.width,
                height: this.resources.scratchTextureArray.height,
                depthOrArrayLayers: this.resources.scratchTextureArray.depthOrArrayLayers,
            }
        );

        // Advection + diffusion command buffer
        const advectDiffuseCommandEncoder = webGpuContext.device.createCommandEncoder();

        // Advection
        // - advect: v0/v1 -> v2
        const advectionEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.#renderPassDescriptors.velocity[2]); // Target texture
        advectionEncoder.setPipeline(this.#pipelines.advectVec2); // Operation
        advectionEncoder.setVertexBuffer(0, this.resources.quadVertexBuffer);
        advectionEncoder.setBindGroup(0, this.#bindGroups.sampler);
        advectionEncoder.setBindGroup(1, this.#bindGroups.velocity[this.velocityOutIdx]); // Input 1 (velocity is advected)
        advectionEncoder.setBindGroup(2, this.#bindGroups.velocity[this.velocityOutIdx]); // Input 2 (along the characteristic (velocity field))
        advectionEncoder.draw(6);
        advectionEncoder.end();
        // this.densityOutIdx = 1 - this.densityOutIdx;
        // // - set bound: d1 -> d2
        // const boundEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.#renderPassDescriptors.density[2]); // Target texture
        // boundEncoder.setPipeline(this.#pipelines.bound); // Operation
        // boundEncoder.setVertexBuffer(0, this.resources.lineVertexBuffer);
        // boundEncoder.setBindGroup(0, this.#bindGroups.sampler);
        // boundEncoder.setBindGroup(1, this.#bindGroups.density[this.densityOutIdx]); // Input 1 (density is advected)
        // boundEncoder.draw(5);
        // boundEncoder.end();

        // Diffusion
        const a = this.settings.dt * this.settings.viscosity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a;
        this.resources.jacobiUniformValues.set([a, c]);
        webGpuContext.device.queue.writeBuffer(this.resources.jacobiUniformBuffer, 0, this.resources.jacobiUniformValues);
        for (let k = 0; k < 30; k++) {
            // - diffuse: v2 constant; v0 -> v1, v1 -> v0, ...
            const diffusionEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.#renderPassDescriptors.velocity[1-this.velocityOutIdx]); // Target texture
            diffusionEncoder.setPipeline(this.#pipelines.jacobiVec2); // Operation
            diffusionEncoder.setVertexBuffer(0, this.resources.quadVertexBuffer);
            diffusionEncoder.setBindGroup(0, this.#bindGroups.sampler);
            diffusionEncoder.setBindGroup(1, this.#bindGroups.velocity[2]); // Input 1 (velocity initial state)
            diffusionEncoder.setBindGroup(2, this.#bindGroups.velocity[this.velocityOutIdx]); // Input 2 (velocity feedback (current guess))
            diffusionEncoder.setBindGroup(3, this.#bindGroups.jacobiUniform); // a, c values
            diffusionEncoder.draw(6);
            diffusionEncoder.end();
            this.velocityOutIdx = 1 - this.velocityOutIdx;
            // // - set bound
            // const boundEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.#renderPassDescriptors.density[1-this.densityOutIdx]); // Target texture
            // boundEncoder.setPipeline(this.#pipelines.bound); // Operation
            // boundEncoder.setVertexBuffer(0, this.resources.lineVertexBuffer);
            // boundEncoder.setBindGroup(0, this.#bindGroups.sampler);
            // boundEncoder.setBindGroup(1, this.#bindGroups.density[this.densityOutIdx]); // Input 1 (density is advected)
            // boundEncoder.draw(5);
            // boundEncoder.end();
            // this.densityOutIdx = 1 - this.densityOutIdx;
        }

        webGpuContext.device.queue.submit([advectDiffuseCommandEncoder.finish()]);

        // Projection command buffer
        const projectCommandEncoder = webGpuContext.device.createCommandEncoder();

        // Projection
        // - divergence: v0/v1, s0 -> s2
        const divergenceEncoder = projectCommandEncoder.beginRenderPass(this.#renderPassDescriptors.scratch[2]); // Target texture
        divergenceEncoder.setPipeline(this.#pipelines.divergence); // Operation
        divergenceEncoder.setVertexBuffer(0, this.resources.quadVertexBuffer);
        divergenceEncoder.setBindGroup(0, this.#bindGroups.sampler);
        divergenceEncoder.setBindGroup(1, this.#bindGroups.velocity[this.velocityOutIdx]); // Input 1 (velocity field)
        divergenceEncoder.setBindGroup(2, this.#bindGroups.scratch[0]); // Input 2 (scratch space for pressure field)
        divergenceEncoder.draw(6);
        divergenceEncoder.end();
        
        // - jacobi: s2 constant; s0 -> s1, s1 -> s0, ...
        this.resources.jacobiUniformValues.set([1, 4]);
        webGpuContext.device.queue.writeBuffer(this.resources.jacobiUniformBuffer, 0, this.resources.jacobiUniformValues);
        let sIn = 0, sOut = 1;
        for (let k = 0; k < 30; k++) {
            const jacobiEncoder = projectCommandEncoder.beginRenderPass(this.#renderPassDescriptors.scratch[sOut]); // Target texture 
            jacobiEncoder.setPipeline(this.#pipelines.jacobi); // Operation
            jacobiEncoder.setVertexBuffer(0, this.resources.quadVertexBuffer);
            jacobiEncoder.setBindGroup(0, this.#bindGroups.sampler);
            jacobiEncoder.setBindGroup(1, this.#bindGroups.scratch[2]); // Input 1 (divergence)
            jacobiEncoder.setBindGroup(2, this.#bindGroups.scratch[sIn]); // Input 2 (initial pressure field guess)
            jacobiEncoder.setBindGroup(3, this.#bindGroups.jacobiUniform); // a, c values
            jacobiEncoder.draw(6);
            jacobiEncoder.end();
            [sIn, sOut] = [sOut, sIn];
        }
        // - subtract gradient: 
        const subgradEncoder = projectCommandEncoder.beginRenderPass(this.#renderPassDescriptors.velocity[1-this.velocityOutIdx]); // Target texture
        subgradEncoder.setPipeline(this.#pipelines.advectVec2); // Operation
        subgradEncoder.setVertexBuffer(0, this.resources.quadVertexBuffer);
        subgradEncoder.setBindGroup(0, this.#bindGroups.sampler);
        subgradEncoder.setBindGroup(1, this.#bindGroups.velocity[this.velocityOutIdx]); // Input 1 (velocity field)
        subgradEncoder.setBindGroup(2, this.#bindGroups.scratch[sIn]); // Input 2 (working memory for pressure field)
        subgradEncoder.draw(6);
        subgradEncoder.end();
        this.velocityOutIdx = 1 - this.velocityOutIdx;

        webGpuContext.device.queue.submit([projectCommandEncoder.finish()]);
    }

    getDensityOutputTextureView() {
        return this.resources.densityTextureViews[this.densityOutIdx];
    }

    getVelocityOutputTextureView() {
        return this.resources.velocityTextureViews[this.velocityOutIdx];
    }

    async #initSimulation() {
        // Shader modules
        const vertexShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/render.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const boundShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/fragpute/bound.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const sourceShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/fragpute/source.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const jacobiShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/fragpute/jacobi.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const advectShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/fragpute/advect.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const divergenceShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/fragpute/divergence.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        const subgradShaderModule = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/fragpute/subgrad.wgsl", {cache: "reload"}).then(r => r.text()),
        });

        // Main quad vertex buffer
        const quadVertices = new Float32Array([
            -1, -1, 0, 1,     0, 0,
            -1, 1, 0, 1,     0, 1,
            1, -1, 0, 1,     1, 0,
            
            -1, 1, 0, 1,     0, 1,
            1, -1, 0, 1,     1, 0,
            1, 1, 0, 1,     1, 1,
        ]);
        this.resources.quadVertexBuffer = webGpuContext.device.createBuffer({
            size: quadVertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        webGpuContext.device.queue.writeBuffer(this.resources.quadVertexBuffer, 0, quadVertices, 0, quadVertices.length);
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

        // setbound: Boundary edge vertex buffers
        const boundaryVertices = [
            new Float32Array([ // left
                -1, -1, 0, 1,     0, 0,
                -1, 1, 0, 1,     0, 1,
            ]),
            new Float32Array([ // right
                1, -1, 0, 1,     1, 0,
                1, 1, 0, 1,     1, 1,
            ]),
            new Float32Array([ // top
                -1, 1, 0, 1,     0, 1,
                1, 1, 0, 1,     1, 1,
            ]),
            new Float32Array([ // bottom
                -1, -1, 0, 1,     0, 0,
                1, -1, 0, 1,     1, 0,
            ]),
        ];
        this.resources.boundaryVertexBuffers = boundaryVertices.map(
            (vertices) => {
                const buffer = webGpuContext.device.createBuffer({
                    size: vertices.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                });
                webGpuContext.device.queue.writeBuffer(buffer, 0, vertices, 0, vertices.length);
                return buffer;
            }
        );
        // setbound: Uniform buffers - scale, offset
        this.resources.boundaryUvOffsets = [
            [1,0], // left
            [-1,0], // right
            [0,1], // top
            [0,-1], // bottom
        ];
        this.resources.boundaryUniformValues = new Float32Array(3);
        this.resources.boundaryUniformBuffer = webGpuContext.device.createBuffer({
            size: this.resources.boundaryUniformValues.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // jacobi: Uniform buffer - a, c
        this.resources.jacobiUniformValues = new Float32Array(2);
        this.resources.jacobiUniformBuffer = webGpuContext.device.createBuffer({
            size: this.resources.jacobiUniformValues.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Sampler and textures
        this.resources.sampler = webGpuContext.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
        });
        this.resources.velocityTextureArray = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "rg32float",
            size: [this.settings.M + 2, this.settings.N + 2, 3],
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            label: "velocity",
        });
        this.resources.densityTextureArray = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "r32float",
            size: [this.settings.M + 2, this.settings.N + 2, 3],
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            label: "density",
        });
        this.resources.scratchTextureArray = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "r32float",
            size: [this.settings.M + 2, this.settings.N + 2, 3],
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            label: "scratch",
        });

        // Texture views
        this.resources.velocityTextureViews = [0,1,2].map(
            (i) => this.resources.velocityTextureArray.createView({ dimension: "2d", baseArrayLayer: i })
        );
        this.resources.densityTextureViews = [0,1,2].map(
            (i) => this.resources.densityTextureArray.createView({ dimension: "2d", baseArrayLayer: i })
        );
        this.resources.scratchTextureViews = [0,1,2].map(
            (i) => this.resources.scratchTextureArray.createView({ dimension: "2d", baseArrayLayer: i })
        );
        
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
                    buffer: { 
                        type: "uniform" 
                    },
                },
            ],
        });

        // Bind groups
        this.#bindGroups.sampler = webGpuContext.device.createBindGroup({
            layout: samplerBindGroupLayout,
            entries: [
                { binding: 0, resource: this.resources.sampler },
            ],
        });
        this.#bindGroups.velocity = [0,1,2].map(
            (i) => webGpuContext.device.createBindGroup({
                layout: textureBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.resources.velocityTextureViews[i] },
                ],
            }),
        );
        this.#bindGroups.density = [0,1,2].map(
            (i) => webGpuContext.device.createBindGroup({
                layout: textureBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.resources.densityTextureViews[i] },
                ],
            }),
        );
        this.#bindGroups.scratch = [0,1,2].map(
            (i) => webGpuContext.device.createBindGroup({
                layout: textureBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.resources.scratchTextureViews[i] },
                ],
            }),
        );
        this.#bindGroups.jacobiUniform = webGpuContext.device.createBindGroup({
            layout: uniformBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.resources.jacobiUniformBuffer } },
            ],
        });
        this.#bindGroups.boundaryUniform = webGpuContext.device.createBindGroup({
            layout: uniformBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.resources.boundaryUniformBuffer } },
            ],
        });

        // Simulaton render pipelines
        const pipelineLayout = webGpuContext.device.createPipelineLayout({
            bindGroupLayouts: [samplerBindGroupLayout, textureBindGroupLayout, textureBindGroupLayout],
        });
        const boundPipelineLayout = webGpuContext.device.createPipelineLayout({
            bindGroupLayouts: [samplerBindGroupLayout, textureBindGroupLayout, uniformBindGroupLayout],
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
        
        this.#pipelines.bound = this.#createSimulationPipeline(boundPipelineLayout, vertexStageDescriptor, boundShaderModule, "set_bound", "r32float", constants, "line-list");
        this.#pipelines.boundVec2 = this.#createSimulationPipeline(boundPipelineLayout, vertexStageDescriptor, boundShaderModule, "set_bound_vec2", "rg32float", constants, "line-list");
        this.#pipelines.source = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, sourceShaderModule, "add_source", "r32float", constants, "triangle-list");
        this.#pipelines.sourceVec2 = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, sourceShaderModule, "add_source_vec2", "rg32float", constants, "triangle-list");
        this.#pipelines.jacobi = this.#createSimulationPipeline(jacobiPipelineLayout, vertexStageDescriptor, jacobiShaderModule, "jacobi", "r32float", constants, "triangle-list");
        this.#pipelines.jacobiVec2 = this.#createSimulationPipeline(jacobiPipelineLayout, vertexStageDescriptor, jacobiShaderModule, "jacobi_vec2", "rg32float", constants, "triangle-list");
        this.#pipelines.advect = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, advectShaderModule, "advect", "r32float", constants, "triangle-list");
        this.#pipelines.advectVec2 = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, advectShaderModule, "advect_vec2", "rg32float", constants, "triangle-list");
        this.#pipelines.divergence = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, divergenceShaderModule, "divergence", "r32float", constants, "triangle-list");
        this.#pipelines.subgrad = this.#createSimulationPipeline(pipelineLayout, vertexStageDescriptor, subgradShaderModule, "subtract_gradient", "rg32float", constants, "triangle-list");

        // Simulation render pass descriptors
        this.#renderPassDescriptors.velocity = [0,1,2].map(
            (i) => ({
                colorAttachments: [
                    { loadOp: "clear", storeOp: "store", view: this.resources.velocityTextureViews[i] },
                ],
            })
        );
        this.#renderPassDescriptors.density = [0,1,2].map(
            (i) => ({
                colorAttachments: [
                    { loadOp: "clear", storeOp: "store", view: this.resources.densityTextureViews[i] },
                ],
            })
        );
        this.#renderPassDescriptors.scratch = [0,1,2].map(
            (i) => ({
                colorAttachments: [
                    { loadOp: "clear", storeOp: "store", view: this.resources.scratchTextureViews[i] },
                ],
            })
        );
    }

    #createSimulationPipeline(layout, vertex, module, entryPoint, format, constants, topology) {
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
            primitive: {
                topology: topology,
            },
        });
        return pipeline;
    }

}