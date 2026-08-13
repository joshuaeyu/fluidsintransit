"use strict";

import { webGpuContext } from "./context.js";

export class SimulationCompute {
    
    settings;
    
    #workgroupDim = 8;

    #densityOutIdx = 0;
    #velocityOutIdx = 0;

    #bindGroupLayouts = {};
    #bindGroups = {};
    #pipelines = {};
    #shaderModules = {};
    #textures = {};
    #textureViews = {}
    #uniformBuffers = {}
    #uniformValues = {};
    

    constructor(settings) {
        this.settings = settings;
    }

    static async build(settings) {
        const app = new SimulationCompute(settings);
        await app.#initSimulation();
        return app;
    }

    reset() {
        // Clear simulation data
        for (const tex in this.#textures) {
            this.#clearTexture(this.#textures[tex]);
        }
        this.#densityOutIdx = 0;
        this.#velocityOutIdx = 0;
    }

    async addDensitySource(sourceDataArray) {
        // Copy data
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.#textures.density,
                origin: [0, 0, 1-this.#densityOutIdx],
            }, 
            sourceDataArray, 
            {
                bytesPerRow: this.#textures.density.width * 4,
            }, 
            {
                width: this.#textures.density.width,
                height: this.#textures.density.height,
        });
        // Add source
        const commandEncoder = webGpuContext.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.#pipelines.source);
        passEncoder.setBindGroup(0, this.#bindGroups.densityTextureViews[this.#densityOutIdx]);
        passEncoder.setBindGroup(1, this.#bindGroups.densityTextureViews[1-this.#densityOutIdx]);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.#workgroupDim), Math.ceil(this.settings.N+2)/this.#workgroupDim); // Number of workgroups
        passEncoder.end();
        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    async addVelocitySource(sourceDataArray) {
        // Copy data
        const sourceDataX = sourceDataArray.filter((_,i) => i % 2 == 0);
        const sourceDataY = sourceDataArray.filter((_,i) => i % 2 == 1);
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.#textures.velocityx,
                origin: [0, 0, 1-this.#velocityOutIdx],
            }, 
            sourceDataX, 
            {
                bytesPerRow: this.#textures.velocityx.width * 4,
            }, 
            {
                width: this.#textures.velocityx.width,
                height: this.#textures.velocityx.height,
        });
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.#textures.velocityy,
                origin: [0, 0, 1-this.#velocityOutIdx],
            }, 
            sourceDataY, 
            {
                bytesPerRow: this.#textures.velocityy.width * 4,
            }, 
            {
                width: this.#textures.velocityy.width,
                height: this.#textures.velocityy.height,
        });
        // Add source
        const commandEncoder = webGpuContext.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.#pipelines.source);
        passEncoder.setBindGroup(0, this.#bindGroups.velocityxTextureViews[this.#velocityOutIdx]);
        passEncoder.setBindGroup(1, this.#bindGroups.velocityxTextureViews[1-this.#velocityOutIdx]);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.#workgroupDim), Math.ceil(this.settings.N+2)/this.#workgroupDim); // Number of workgroups
        passEncoder.setBindGroup(0, this.#bindGroups.velocityyTextureViews[this.#velocityOutIdx]);
        passEncoder.setBindGroup(1, this.#bindGroups.velocityyTextureViews[1-this.#velocityOutIdx]);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.#workgroupDim), Math.ceil(this.settings.N+2)/this.#workgroupDim); // Number of workgroups
        passEncoder.end();
        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    async densityStep() {
        // Uniforms (a, c, values for Jacobi diffusion solver)
        const a = this.settings.dt * this.settings.dissipation * this.settings.diffusivity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a / this.settings.dissipation;
        this.#uniformValues.jacobi.set([a, c]);
        webGpuContext.device.queue.writeBuffer(this.#uniformBuffers.densityDiffuse, 0, this.#uniformValues.jacobi);
        
        // Compute
        const commandEncoder = webGpuContext.device.createCommandEncoder();

        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.#pipelines.density); // Operation
        passEncoder.setBindGroup(0, this.#bindGroups.densityStepTextureArrays);
        passEncoder.setBindGroup(1, this.#bindGroups.densityStepUniforms);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.#workgroupDim), Math.ceil(this.settings.N+2)/this.#workgroupDim); // Number of workgroups
        passEncoder.end();

        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    async velocityStep() {
        // Zero out scratch space
        this.#clearTexture(this.#textures.scratch);
        
        // Uniforms (a, c, values for Jacobi solver for diffusion and projection)
        const a = this.settings.dt * this.settings.viscosity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a;
        this.#uniformValues.jacobi.set([a, c]); // For diffusion
        webGpuContext.device.queue.writeBuffer(this.#uniformBuffers.velocityDiffuse, 0, this.#uniformValues.jacobi);
        this.#uniformValues.jacobi.set([1, 4]); // For projection
        webGpuContext.device.queue.writeBuffer(this.#uniformBuffers.velocityProject, 0, this.#uniformValues.jacobi);
        
        // Compute
        const commandEncoder = webGpuContext.device.createCommandEncoder();

        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.#pipelines.velocity); // Operation
        passEncoder.setBindGroup(0, this.#bindGroups.velocityStepTextureArrays);
        passEncoder.setBindGroup(1, this.#bindGroups.velocityStepUniforms);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.#workgroupDim), Math.ceil(this.settings.N+2)/this.#workgroupDim); // Number of workgroups
        passEncoder.end();

        commandEncoder.copyTextureToTexture(
            { 
                origin: [0,0,1],
                texture: this.#textures.velocityx,
            },
            { 
                origin: [0,0,0],
                texture: this.#textures.velocityx,
            },
            {
                width: this.#textures.velocityx.width,
                height: this.#textures.velocityx.height,
            }
        );
        commandEncoder.copyTextureToTexture(
            { 
                origin: [0,0,1],
                texture: this.#textures.velocityy,
            },
            { 
                origin: [0,0,0],
                texture: this.#textures.velocityy,
            },
            {
                width: this.#textures.velocityy.width,
                height: this.#textures.velocityy.height,
            }
        );

        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    getDensityOutputTextureView() {
        return this.#textureViews.density[this.#densityOutIdx];
    }

    getVelocityOutputTextureView() {
        return this.#textureViews.velocityy[this.#velocityOutIdx];
    }

    #clearTexture(texture) {
        // Zero out scratch space
        const zeros = new Float32Array(texture.width * texture.height * texture.depthOrArrayLayers);
        webGpuContext.device.queue.writeTexture(
            { 
                texture: texture,
            }, 
            zeros, 
            {
                bytesPerRow: texture.width * 4, // 32 bits per texel
                rowsPerImage: texture.height,
            }, 
            {
                width: texture.width,
                height: texture.height,
                depthOrArrayLayers: texture.depthOrArrayLayers,
            }
        );
    }

    async #initSimulation() {
        await this.#setupShaderModules();
        this.#setupUniformBuffers();
        this.#setupTextures();
        this.#setupBindGroups();
        this.#setupPipelines();
    }

    async #setupShaderModules() {
        // Shader modules
        this.#shaderModules.source = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/compute/source.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        this.#shaderModules.velocity = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/compute/velocity.wgsl", {cache: "reload"}).then(r => r.text()),
        });
        this.#shaderModules.density = webGpuContext.device.createShaderModule({
            code: await fetch("./fluids/shaders/compute/density.wgsl", {cache: "reload"}).then(r => r.text()),
        });
    }

    #setupUniformBuffers() {
        // Uniform buffers (JacobiUniforms) - a, c
        this.#uniformValues.jacobi = new Float32Array(2);
        this.#uniformBuffers.densityDiffuse = webGpuContext.device.createBuffer({
            size: this.#uniformValues.jacobi.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.#uniformBuffers.velocityDiffuse = webGpuContext.device.createBuffer({
            size: this.#uniformValues.jacobi.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.#uniformBuffers.velocityProject = webGpuContext.device.createBuffer({
            size: this.#uniformValues.jacobi.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    #setupTextures() {
        // Textures
        this.#textures.velocityx = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "r32float",
            size: [this.settings.M + 2, this.settings.N + 2, 2],
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
            label: "velocityx",
        });
        this.#textures.velocityy = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "r32float",
            size: [this.settings.M + 2, this.settings.N + 2, 2],
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
            label: "velocityy",
        });
        this.#textures.density = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "r32float",
            size: [this.settings.M + 2, this.settings.N + 2, 2],
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
            label: "density",
        });
        this.#textures.scratch = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "r32float",
            size: [this.settings.M + 2, this.settings.N + 2, 2],
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
            label: "scratch",
        });

        // Texture views
        this.#textureViews.velocityx = [0,1].map(
            (i) => this.#textures.velocityx.createView({ dimension: "2d", baseArrayLayer: i })
        );
        this.#textureViews.velocityy = [0,1].map(
            (i) => this.#textures.velocityy.createView({ dimension: "2d", baseArrayLayer: i })
        );
        this.#textureViews.density = [0,1].map(
            (i) => this.#textures.density.createView({ dimension: "2d", baseArrayLayer: i })
        );
        this.#textureViews.scratch = [0,1].map(
            (i) => this.#textures.scratch.createView({ dimension: "2d", baseArrayLayer: i })
        );
    }

    #setupBindGroups() {
        // Bind group layouts
        this.#bindGroupLayouts.indvTexture = webGpuContext.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "read-write",
                        format: "r32float",
                        viewDimension: "2d",
                    },
                }
            ],
        });
        this.#bindGroupLayouts.velocityTexture = webGpuContext.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "read-write",
                        format: "r32float",
                        viewDimension: "2d-array",
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "read-write",
                        format: "r32float",
                        viewDimension: "2d-array",
                    },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "read-write",
                        format: "r32float",
                        viewDimension: "2d-array",
                    },
                },
            ],
        });
        this.#bindGroupLayouts.densityTexture = webGpuContext.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "read-only",
                        format: "r32float",
                        viewDimension: "2d-array",
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "read-only",
                        format: "r32float",
                        viewDimension: "2d-array",
                    },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "read-write",
                        format: "r32float",
                        viewDimension: "2d-array",
                    },
                },
            ],
        });
        this.#bindGroupLayouts.densityUniform = webGpuContext.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { 
                        type: "uniform" 
                    },
                },
            ],
        });
        this.#bindGroupLayouts.velocityUniform = webGpuContext.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { 
                        type: "uniform" 
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { 
                        type: "uniform" 
                    },
                },
            ],
        });

        // Bind groups
        this.#bindGroups.velocityxTextureViews = [0,1].map((i) => webGpuContext.device.createBindGroup({
            layout: this.#bindGroupLayouts.indvTexture,
            entries: [
                { binding: 0, resource: this.#textureViews.velocityx[i] },
            ],
        }));
        this.#bindGroups.velocityyTextureViews = [0,1].map((i) => webGpuContext.device.createBindGroup({
            layout: this.#bindGroupLayouts.indvTexture,
            entries: [
                { binding: 0, resource: this.#textureViews.velocityy[i] },
            ],
        }));
        this.#bindGroups.densityTextureViews = [0,1].map((i) => webGpuContext.device.createBindGroup({
            layout: this.#bindGroupLayouts.indvTexture,
            entries: [
                { binding: 0, resource: this.#textureViews.density[i] },
            ],
        }));
        this.#bindGroups.scratchTextureViews = [0,1].map((i) => webGpuContext.device.createBindGroup({
            layout: this.#bindGroupLayouts.indvTexture,
            entries: [
                { binding: 0, resource: this.#textureViews.scratch[i] },
            ],
        }));
        this.#bindGroups.velocityStepTextureArrays = webGpuContext.device.createBindGroup({
            layout: this.#bindGroupLayouts.velocityTexture,
            entries: [
                { binding: 0, resource: this.#textures.velocityx },
                { binding: 1, resource: this.#textures.velocityy },
                { binding: 2, resource: this.#textures.scratch },
            ],
        });
        this.#bindGroups.densityStepTextureArrays = webGpuContext.device.createBindGroup({
            layout: this.#bindGroupLayouts.densityTexture,
            entries: [
                { binding: 0, resource: this.#textures.velocityx },
                { binding: 1, resource: this.#textures.velocityy },
                { binding: 2, resource: this.#textures.density },
            ],
        });
        this.#bindGroups.velocityStepUniforms = webGpuContext.device.createBindGroup({
            layout: this.#bindGroupLayouts.velocityUniform,
            entries: [
                { binding: 0, resource: { buffer: this.#uniformBuffers.velocityDiffuse } },
                { binding: 1, resource: { buffer: this.#uniformBuffers.velocityProject } },
            ],
        });
        this.#bindGroups.densityStepUniforms = webGpuContext.device.createBindGroup({
            layout: this.#bindGroupLayouts.densityUniform,
            entries: [
                { binding: 0, resource: { buffer: this.#uniformBuffers.densityDiffuse } },
            ],
        });
    }

    #setupPipelines() {
        // Compute pipelines
        const sourcePipelineLayout = webGpuContext.device.createPipelineLayout({
            bindGroupLayouts: [
                this.#bindGroupLayouts.indvTexture, 
                this.#bindGroupLayouts.indvTexture
            ],
        });
        const densityPipelineLayout = webGpuContext.device.createPipelineLayout({
            bindGroupLayouts: [
                this.#bindGroupLayouts.densityTexture, 
                this.#bindGroupLayouts.densityUniform
            ],
        });
        const velocityPipelineLayout = webGpuContext.device.createPipelineLayout({
            bindGroupLayouts: [
                this.#bindGroupLayouts.velocityTexture, 
                this.#bindGroupLayouts.velocityUniform
            ],
        });
        const constants = { dt: this.settings.dt, M: this.settings.M, N: this.settings.N };
        
        this.#pipelines.source = this.#createComputePipeline(sourcePipelineLayout, this.#shaderModules.source, "add_source", constants);
        this.#pipelines.density = this.#createComputePipeline(densityPipelineLayout, this.#shaderModules.density, "main", constants);
        this.#pipelines.velocity = this.#createComputePipeline(velocityPipelineLayout, this.#shaderModules.velocity, "main", constants);
    }

    #createComputePipeline(layout, module, entryPoint, constants) {
        const pipeline = webGpuContext.device.createComputePipeline({
            layout: layout,
            compute: {
                module: module,
                entryPoint: entryPoint,
                constants: constants,
            },
        });
        return pipeline;
    }

}