import type { Settings } from "../../types/settings.js";
import * as webGpuContext from "../context.js";
import { Simulator } from "./simulator.js";

type BindGroups = {
    sampler: GPUBindGroup;
    density: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
    velocity: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
    scratch: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
    boundaryUniform: GPUBindGroup;
    jacobiUniform: GPUBindGroup;
};

type BindGroupLayouts = {
    sampler: GPUBindGroupLayout;
    texture: GPUBindGroupLayout;
    uniform: GPUBindGroupLayout;
};

type Pipelines = {
    bound: GPURenderPipeline;
    boundVec2: GPURenderPipeline;
    source: GPURenderPipeline;
    sourceVec2: GPURenderPipeline;
    jacobi: GPURenderPipeline;
    jacobiVec2: GPURenderPipeline;
    advect: GPURenderPipeline;
    advectVec2: GPURenderPipeline;
    divergence: GPURenderPipeline;
    subgrad: GPURenderPipeline;
};

type RenderPassDescriptors = {
    density: [GPURenderPassDescriptor, GPURenderPassDescriptor, GPURenderPassDescriptor];
    velocity: [GPURenderPassDescriptor, GPURenderPassDescriptor, GPURenderPassDescriptor];
    scratch: [GPURenderPassDescriptor, GPURenderPassDescriptor, GPURenderPassDescriptor];
};

type ShaderModules = {
    vertex: GPUShaderModule;
    bound: GPUShaderModule;
    source: GPUShaderModule;
    jacobi: GPUShaderModule;
    advect: GPUShaderModule;
    divergence: GPUShaderModule;
    subgrad: GPUShaderModule;
};

type Textures = {
    density: GPUTexture;
    velocity: GPUTexture;
    scratch: GPUTexture;
};

type TextureViews = {
    density: [GPUTextureView, GPUTextureView, GPUTextureView]
    velocity: [GPUTextureView, GPUTextureView, GPUTextureView]
    scratch: [GPUTextureView, GPUTextureView, GPUTextureView]
};

type UniformBuffers = {
    boundary: GPUBuffer;
    jacobi: GPUBuffer;
};

type UniformArrays = {
    boundary: Float32Array;
    jacobi: Float32Array;
};

type VertexBuffers = {
    boundary: GPUBuffer[];
    quad: GPUBuffer;
};

export class SimulatorFrag extends Simulator {
    // Fluid sim settings
    settings: Settings;
    // Current target texture
    private densityOutIdx: number = 0;
    private velocityOutIdx: number = 0;
    // WebGPU resources
    private readonly bindGroups: BindGroups;
    private readonly pipelines: Pipelines;
    private readonly renderPassDescriptors: RenderPassDescriptors;
    private readonly sampler: GPUSampler;
    private readonly textures: Textures;
    private readonly textureViews: TextureViews;
    private readonly uniformBuffers: UniformBuffers;
    private readonly uniformArrays: UniformArrays;
    private readonly vertexBuffers: VertexBuffers;

    private constructor(
        settings: Settings,
        bindGroups: BindGroups,
        pipelines: Pipelines,
        renderPassDescriptors: RenderPassDescriptors,
        sampler: GPUSampler,
        textures: Textures,
        textureViews: TextureViews,
        uniformBuffers: UniformBuffers,
        uniformArrays: UniformArrays,
        vertexBuffers: VertexBuffers,
    ) {
        super();
        this.settings = settings;
        this.bindGroups = bindGroups;
        this.pipelines = pipelines;
        this.renderPassDescriptors = renderPassDescriptors;
        this.sampler = sampler;
        this.textures = textures;
        this.textureViews = textureViews;
        this.uniformBuffers = uniformBuffers;
        this.uniformArrays = uniformArrays;
        this.vertexBuffers = vertexBuffers;
    }

    static async build(settings: Settings): Promise<SimulatorFrag> {
        const vertexBuffers = createVertexBuffers();
        
        const sampler = createSampler();
        const textures = createTextures(settings);
        const textureViews = createTextureViews(textures);
        const renderPassDescriptors = createRenderPassDescriptors(textureViews);
        
        const uniformArrays = createUniformArrays();
        const uniformBuffers = createUniformBuffers(uniformArrays);
        
        const bindGroupLayouts = createBindGroupLayouts();
        const bindGroups = createBindGroups(sampler, textureViews, bindGroupLayouts, uniformBuffers);
        
        const shaderModules = await createShaderModules();
        const pipelines = createPipelines(settings, shaderModules, bindGroupLayouts);


        return new SimulatorFrag(
            settings,
            bindGroups,
            pipelines,
            renderPassDescriptors,
            sampler,
            textures,
            textureViews,
            uniformBuffers,
            uniformArrays,
            vertexBuffers,
        );
    }

    reset(): void {
        const commandEncoder = webGpuContext.device.createCommandEncoder();
        for (const descriptors of Object.values(this.renderPassDescriptors)) {
            for (const descriptor of descriptors) {
                const renderPassEncoder = commandEncoder.beginRenderPass(descriptor);
                renderPassEncoder.end();
            }
        }
        webGpuContext.device.queue.submit([commandEncoder.finish()]);
        this.densityOutIdx = 0;
        this.velocityOutIdx = 0;
    }

    async addDensitySource(sourceDataArray: Float32Array): Promise<void> {
        // Use densityTextureArray[2] to temporarily hold the source data
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.textures.density,
                origin: [0, 0, 2],
            }, 
            sourceDataArray, 
            {
                bytesPerRow: this.textures.density.width * 4,
            }, 
            {
                width: this.textures.density.width,
                height: this.textures.density.height,
            });
        // Add source (densityTextureArray[2]) to existing density field (densityTextureArray[this.densityOutIdx])
        const sourceCommandEncoder = webGpuContext.device.createCommandEncoder();
        const sourceEncoder = sourceCommandEncoder.beginRenderPass(this.renderPassDescriptors.density[1-this.densityOutIdx] as GPURenderPassDescriptor);
        sourceEncoder.setPipeline(this.pipelines.source);
        sourceEncoder.setVertexBuffer(0, this.vertexBuffers.quad);
        sourceEncoder.setBindGroup(0, this.bindGroups.sampler);
        sourceEncoder.setBindGroup(1, this.bindGroups.density[this.densityOutIdx] as GPUBindGroup);
        sourceEncoder.setBindGroup(2, this.bindGroups.density[2]);
        sourceEncoder.draw(6);
        sourceEncoder.end();
        webGpuContext.device.queue.submit([sourceCommandEncoder.finish()]);
        this.densityOutIdx = 1 - this.densityOutIdx;
    }

    async addVelocitySource(sourceDataArray: Float32Array): Promise<void> {
        // Use velocityTextureArray[2] to temporarily hold the source data
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.textures.velocity,
                origin: [0, 0, 2],
            }, 
            sourceDataArray, 
            {
                bytesPerRow: this.textures.velocity.width * 4 * 2,
            }, 
            {
                width: this.textures.velocity.width,
                height: this.textures.velocity.height,
            }
        );
        // Add source (velocityTextureArray[2]) to existing density field (velocityTextureArray[this.velocityOutIdx])
        const sourceCommandEncoder = webGpuContext.device.createCommandEncoder();
        const sourceEncoder = sourceCommandEncoder.beginRenderPass(this.renderPassDescriptors.velocity[1-this.velocityOutIdx] as GPURenderPassDescriptor);
        sourceEncoder.setPipeline(this.pipelines.sourceVec2);
        sourceEncoder.setVertexBuffer(0, this.vertexBuffers.quad);
        sourceEncoder.setBindGroup(0, this.bindGroups.sampler);
        sourceEncoder.setBindGroup(1, this.bindGroups.velocity[this.velocityOutIdx] as GPUBindGroup);
        sourceEncoder.setBindGroup(2, this.bindGroups.velocity[2]);
        sourceEncoder.draw(6);
        sourceEncoder.end();
        webGpuContext.device.queue.submit([sourceCommandEncoder.finish()]);
        this.velocityOutIdx = 1 - this.velocityOutIdx;
    }

    async densityStep(): Promise<void> {
        // Advection + diffusion command buffer
        const advectDiffuseCommandEncoder = webGpuContext.device.createCommandEncoder();

        // Advection
        // - advect: d0/d1 -> d2
        const advectionEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.renderPassDescriptors.density[2]); // Target texture
        advectionEncoder.setPipeline(this.pipelines.advect); // Operation
        advectionEncoder.setVertexBuffer(0, this.vertexBuffers.quad);
        advectionEncoder.setBindGroup(0, this.bindGroups.sampler);
        advectionEncoder.setBindGroup(1, this.bindGroups.density[this.densityOutIdx] as GPUBindGroup); // Input 1 (density is advected)
        advectionEncoder.setBindGroup(2, this.bindGroups.velocity[this.velocityOutIdx] as GPUBindGroup); // Input 2 (along the characteristic (velocity field))
        advectionEncoder.draw(6);
        advectionEncoder.end();
        // // - set bound: d1 -> d2
        // const boundEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.renderPassDescriptors.density[2]); // Target texture
        // boundEncoder.setPipeline(this.pipelines.bound); // Operation
        // boundEncoder.setVertexBuffer(0, this.vertexBuffers.line);
        // boundEncoder.setBindGroup(0, this.bindGroups.sampler);
        // boundEncoder.setBindGroup(1, this.bindGroups.density[this.densityOutIdx]); // Input 1 (density is advected)
        // boundEncoder.draw(5);
        // boundEncoder.end();

        // Diffusion
        const a = this.settings.dt * this.settings.dissipation * this.settings.diffusivity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a / this.settings.dissipation;
        this.uniformArrays.jacobi.set([a, c]);
        webGpuContext.device.queue.writeBuffer(this.uniformBuffers.jacobi, 0, this.uniformArrays.jacobi);
        for (let k = 0; k < 30; k++) {
            // - diffuse: d2 constant; d0 -> d1, d1 -> d0, ...
            const diffusionEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.renderPassDescriptors.density[1-this.densityOutIdx] as GPURenderPassDescriptor); // Target texture
            diffusionEncoder.setPipeline(this.pipelines.jacobi); // Operation
            diffusionEncoder.setVertexBuffer(0, this.vertexBuffers.quad);
            diffusionEncoder.setBindGroup(0, this.bindGroups.sampler);
            diffusionEncoder.setBindGroup(1, this.bindGroups.density[2]); // Input 1 (density initial state)
            diffusionEncoder.setBindGroup(2, this.bindGroups.density[this.densityOutIdx] as GPUBindGroup); // Input 2 (density feedback (current guess))
            diffusionEncoder.setBindGroup(3, this.bindGroups.jacobiUniform); // a, c values
            diffusionEncoder.draw(6);
            diffusionEncoder.end();
            this.densityOutIdx = 1 - this.densityOutIdx;
            // // - set bound
            // const boundEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.renderPassDescriptors.density[1-this.densityOutIdx]); // Target texture
            // boundEncoder.setPipeline(this.pipelines.bound); // Operation
            // boundEncoder.setVertexBuffer(0, this.vertexBuffers.line);
            // boundEncoder.setBindGroup(0, this.bindGroups.sampler);
            // boundEncoder.setBindGroup(1, this.bindGroups.density[this.densityOutIdx]); // Input 1 (density is advected)
            // boundEncoder.draw(5);
            // boundEncoder.end();
            // this.densityOutIdx = 1 - this.densityOutIdx;
        }

        webGpuContext.device.queue.submit([advectDiffuseCommandEncoder.finish()]);
    }

    async velocityStep(): Promise<void> {
        // Zero out scratch space
        const zeros = new Float32Array(this.textures.scratch.width * this.textures.scratch.height * this.textures.scratch.depthOrArrayLayers);
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.textures.scratch,
            }, 
            zeros, 
            {
                bytesPerRow: this.textures.scratch.width * 4,
                rowsPerImage: this.textures.scratch.height,
            }, 
            {
                width: this.textures.scratch.width,
                height: this.textures.scratch.height,
                depthOrArrayLayers: this.textures.scratch.depthOrArrayLayers,
            }
        );

        // Advection + diffusion command buffer
        const advectDiffuseCommandEncoder = webGpuContext.device.createCommandEncoder();

        // Advection
        // - advect: v0/v1 -> v2
        const advectionEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.renderPassDescriptors.velocity[2]); // Target texture
        advectionEncoder.setPipeline(this.pipelines.advectVec2); // Operation
        advectionEncoder.setVertexBuffer(0, this.vertexBuffers.quad);
        advectionEncoder.setBindGroup(0, this.bindGroups.sampler);
        advectionEncoder.setBindGroup(1, this.bindGroups.velocity[this.velocityOutIdx] as GPUBindGroup); // Input 1 (velocity is advected)
        advectionEncoder.setBindGroup(2, this.bindGroups.velocity[this.velocityOutIdx] as GPUBindGroup); // Input 2 (along the characteristic (velocity field))
        advectionEncoder.draw(6);
        advectionEncoder.end();
        // this.densityOutIdx = 1 - this.densityOutIdx;
        // // - set bound: d1 -> d2
        // const boundEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.renderPassDescriptors.density[2]); // Target texture
        // boundEncoder.setPipeline(this.pipelines.bound); // Operation
        // boundEncoder.setVertexBuffer(0, this.vertexBuffers.line);
        // boundEncoder.setBindGroup(0, this.bindGroups.sampler);
        // boundEncoder.setBindGroup(1, this.bindGroups.density[this.densityOutIdx]); // Input 1 (density is advected)
        // boundEncoder.draw(5);
        // boundEncoder.end();

        // Diffusion
        const a = this.settings.dt * this.settings.viscosity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a;
        this.uniformArrays.jacobi.set([a, c]);
        webGpuContext.device.queue.writeBuffer(this.uniformBuffers.jacobi, 0, this.uniformArrays.jacobi);
        for (let k = 0; k < 30; k++) {
            // - diffuse: v2 constant; v0 -> v1, v1 -> v0, ...
            const diffusionEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.renderPassDescriptors.velocity[1-this.velocityOutIdx] as GPURenderPassDescriptor); // Target texture
            diffusionEncoder.setPipeline(this.pipelines.jacobiVec2); // Operation
            diffusionEncoder.setVertexBuffer(0, this.vertexBuffers.quad);
            diffusionEncoder.setBindGroup(0, this.bindGroups.sampler);
            diffusionEncoder.setBindGroup(1, this.bindGroups.velocity[2]); // Input 1 (velocity initial state)
            diffusionEncoder.setBindGroup(2, this.bindGroups.velocity[this.velocityOutIdx] as GPUBindGroup); // Input 2 (velocity feedback (current guess))
            diffusionEncoder.setBindGroup(3, this.bindGroups.jacobiUniform); // a, c values
            diffusionEncoder.draw(6);
            diffusionEncoder.end();
            this.velocityOutIdx = 1 - this.velocityOutIdx;
            // // - set bound
            // const boundEncoder = advectDiffuseCommandEncoder.beginRenderPass(this.renderPassDescriptors.density[1-this.densityOutIdx]); // Target texture
            // boundEncoder.setPipeline(this.pipelines.bound); // Operation
            // boundEncoder.setVertexBuffer(0, this.vertexBuffers.line);
            // boundEncoder.setBindGroup(0, this.bindGroups.sampler);
            // boundEncoder.setBindGroup(1, this.bindGroups.density[this.densityOutIdx]); // Input 1 (density is advected)
            // boundEncoder.draw(5);
            // boundEncoder.end();
            // this.densityOutIdx = 1 - this.densityOutIdx;
        }

        webGpuContext.device.queue.submit([advectDiffuseCommandEncoder.finish()]);

        // Projection command buffer
        const projectCommandEncoder = webGpuContext.device.createCommandEncoder();

        // Projection
        // - divergence: v0/v1, s0 -> s2
        const divergenceEncoder = projectCommandEncoder.beginRenderPass(this.renderPassDescriptors.scratch[2]); // Target texture
        divergenceEncoder.setPipeline(this.pipelines.divergence); // Operation
        divergenceEncoder.setVertexBuffer(0, this.vertexBuffers.quad);
        divergenceEncoder.setBindGroup(0, this.bindGroups.sampler);
        divergenceEncoder.setBindGroup(1, this.bindGroups.velocity[this.velocityOutIdx] as GPUBindGroup); // Input 1 (velocity field)
        divergenceEncoder.setBindGroup(2, this.bindGroups.scratch[0]); // Input 2 (scratch space for pressure field)
        divergenceEncoder.draw(6);
        divergenceEncoder.end();
        
        // - jacobi: s2 constant; s0 -> s1, s1 -> s0, ...
        this.uniformArrays.jacobi.set([1, 4]);
        webGpuContext.device.queue.writeBuffer(this.uniformBuffers.jacobi, 0, this.uniformArrays.jacobi);
        let sIn = 0, sOut = 1;
        for (let k = 0; k < 30; k++) {
            const jacobiEncoder = projectCommandEncoder.beginRenderPass(this.renderPassDescriptors.scratch[sOut] as GPURenderPassDescriptor); // Target texture 
            jacobiEncoder.setPipeline(this.pipelines.jacobi); // Operation
            jacobiEncoder.setVertexBuffer(0, this.vertexBuffers.quad);
            jacobiEncoder.setBindGroup(0, this.bindGroups.sampler);
            jacobiEncoder.setBindGroup(1, this.bindGroups.scratch[2]); // Input 1 (divergence)
            jacobiEncoder.setBindGroup(2, this.bindGroups.scratch[sIn] as GPUBindGroup); // Input 2 (initial pressure field guess)
            jacobiEncoder.setBindGroup(3, this.bindGroups.jacobiUniform); // a, c values
            jacobiEncoder.draw(6);
            jacobiEncoder.end();
            [sIn, sOut] = [sOut, sIn];
        }
        // - subtract gradient: 
        const subgradEncoder = projectCommandEncoder.beginRenderPass(this.renderPassDescriptors.velocity[1-this.velocityOutIdx] as GPURenderPassDescriptor); // Target texture
        subgradEncoder.setPipeline(this.pipelines.advectVec2); // Operation
        subgradEncoder.setVertexBuffer(0, this.vertexBuffers.quad);
        subgradEncoder.setBindGroup(0, this.bindGroups.sampler);
        subgradEncoder.setBindGroup(1, this.bindGroups.velocity[this.velocityOutIdx] as GPUBindGroup); // Input 1 (velocity field)
        subgradEncoder.setBindGroup(2, this.bindGroups.scratch[sIn] as GPUBindGroup); // Input 2 (working memory for pressure field)
        subgradEncoder.draw(6);
        subgradEncoder.end();
        this.velocityOutIdx = 1 - this.velocityOutIdx;

        webGpuContext.device.queue.submit([projectCommandEncoder.finish()]);
    }

    getDensityOutputTextureView(): GPUTextureView {
        return this.textureViews.density[this.densityOutIdx] as GPUTextureView;
    }

    getVelocityOutputTextureView(): GPUTextureView {
        return this.textureViews.velocity[this.velocityOutIdx] as GPUTextureView;
    }
}

async function createShaderModules(): Promise<ShaderModules> {
    // Shader modules
    const vertex = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/render.wgsl", {cache: "reload"}).then(r => r.text()),
    });
    const bound = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/frag/bound.wgsl", {cache: "reload"}).then(r => r.text()),
    });
    const source = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/frag/source.wgsl", {cache: "reload"}).then(r => r.text()),
    });
    const jacobi = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/frag/jacobi.wgsl", {cache: "reload"}).then(r => r.text()),
    });
    const advect = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/frag/advect.wgsl", {cache: "reload"}).then(r => r.text()),
    });
    const divergence = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/frag/divergence.wgsl", {cache: "reload"}).then(r => r.text()),
    });
    const subgrad = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/frag/subgrad.wgsl", {cache: "reload"}).then(r => r.text()),
    });

    return {
        vertex,
        bound,
        source,
        jacobi,
        advect,
        divergence,
        subgrad,
    };
}

function createVertexBuffers(): VertexBuffers {
    // Main quad vertex buffer
    const quadVertices = new Float32Array([
        -1, -1, 0, 1,     0, 0,
        -1, 1, 0, 1,     0, 1,
        1, -1, 0, 1,     1, 0,
        
        -1, 1, 0, 1,     0, 1,
        1, -1, 0, 1,     1, 0,
        1, 1, 0, 1,     1, 1,
    ]);
    const quad = webGpuContext.device.createBuffer({
        size: quadVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    webGpuContext.device.queue.writeBuffer(quad, 0, quadVertices, 0, quadVertices.length);

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
    const boundary = boundaryVertices.map(
        (vertices) => {
            const buffer = webGpuContext.device.createBuffer({
                size: vertices.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            webGpuContext.device.queue.writeBuffer(buffer, 0, vertices, 0, vertices.length);
            return buffer;
        }
    );

    return {
        boundary,
        quad,
    };
}

function createUniformArrays(): UniformArrays {
    // setbound: Uniform buffers - scale, offset
    const boundaryUvOffsets = [
        [1,0], // left
        [-1,0], // right
        [0,1], // top
        [0,-1], // bottom
    ];
    const boundary = new Float32Array(3);

    // jacobi: Uniform buffer - a, c
    const jacobi = new Float32Array(2);

    return {
        boundary,
        jacobi,
    }
};

function createUniformBuffers(uniformArrays: UniformArrays): UniformBuffers {
    const boundary = webGpuContext.device.createBuffer({
        size: uniformArrays.boundary.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // jacobi: Uniform buffer - a, c
    const jacobi = webGpuContext.device.createBuffer({
        size: uniformArrays.jacobi.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    return {
        boundary,
        jacobi,
    }
}

function createSampler(): GPUSampler {
    const sampler = webGpuContext.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
    });
    return sampler
}

function createTextures(settings: Settings): Textures {
    const density = webGpuContext.device.createTexture({
        dimension: "2d",
        format: "r32float",
        size: [settings.M + 2, settings.N + 2, 3],
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
        label: "density",
    });
    const velocity = webGpuContext.device.createTexture({
        dimension: "2d",
        format: "rg32float",
        size: [settings.M + 2, settings.N + 2, 3],
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
        label: "velocity",
    });
    const scratch = webGpuContext.device.createTexture({
        dimension: "2d",
        format: "r32float",
        size: [settings.M + 2, settings.N + 2, 3],
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
        label: "scratch",
    });
    return {
        density,
        velocity,
        scratch,
    };
}

function createTextureViews(textures: Textures): TextureViews {
    const velocity = [0,1,2].map(
        (i) => textures.velocity.createView({ dimension: "2d", baseArrayLayer: i })
    ) as [GPUTextureView, GPUTextureView, GPUTextureView];
    const density = [0,1,2].map(
        (i) => textures.density.createView({ dimension: "2d", baseArrayLayer: i })
    ) as [GPUTextureView, GPUTextureView, GPUTextureView];
    const scratch = [0,1,2].map(
        (i) => textures.scratch.createView({ dimension: "2d", baseArrayLayer: i })
    ) as [GPUTextureView, GPUTextureView, GPUTextureView];
    return {
        density,
        velocity,
        scratch,
    };
}

function createBindGroupLayouts(): BindGroupLayouts {
    // Bind group layouts
    const sampler = webGpuContext.device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {},
            },
        ],
    });
    const texture = webGpuContext.device.createBindGroupLayout({
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
    const uniform = webGpuContext.device.createBindGroupLayout({
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
    return {
        sampler,
        texture,
        uniform
    }
}

function createBindGroups(gpusampler: GPUSampler, textureViews: TextureViews, bindGroupLayouts: BindGroupLayouts, uniformBuffers: UniformBuffers): BindGroups {
    // Bind groups
    const sampler = webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.sampler,
        entries: [
            { binding: 0, resource: gpusampler },
        ],
    });
    const density = [0,1,2].map(
        (i) => webGpuContext.device.createBindGroup({
            layout: bindGroupLayouts.texture,
            entries: [
                { binding: 0, resource: textureViews.density[i] as GPUTextureView },
            ],
        }),
    ) as [GPUBindGroup, GPUBindGroup, GPUBindGroup];
    const velocity = [0,1,2].map(
        (i) => webGpuContext.device.createBindGroup({
            layout: bindGroupLayouts.texture,
            entries: [
                { binding: 0, resource: textureViews.velocity[i] as GPUTextureView },
            ],
        }),
    ) as [GPUBindGroup, GPUBindGroup, GPUBindGroup];
    const scratch = [0,1,2].map(
        (i) => webGpuContext.device.createBindGroup({
            layout: bindGroupLayouts.texture,
            entries: [
                { binding: 0, resource: textureViews.scratch[i] as GPUTextureView },
            ],
        }),
    ) as [GPUBindGroup, GPUBindGroup, GPUBindGroup];
    const boundaryUniform = webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.uniform,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffers.boundary } },
        ],
    });
    const jacobiUniform = webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.uniform,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffers.jacobi } },
        ],
    });
    return {
        sampler,
        density,
        velocity,
        scratch,
        boundaryUniform,
        jacobiUniform,
    }
}

function createPipelines(settings: Settings, shaderModules: ShaderModules, bindGroupLayouts: BindGroupLayouts): Pipelines {
    // Simulaton render pipelines
    const pipelineLayout = webGpuContext.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayouts.sampler, bindGroupLayouts.texture, bindGroupLayouts.texture],
    });
    const boundPipelineLayout = webGpuContext.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayouts.sampler, bindGroupLayouts.texture, bindGroupLayouts.uniform],
    });
    const jacobiPipelineLayout = webGpuContext.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayouts.sampler, bindGroupLayouts.texture, bindGroupLayouts.texture, bindGroupLayouts.uniform],
    });

    // Vertex stage descriptor
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
    ] as [GPUVertexBufferLayout];
    const vertexStageDescriptor: GPUVertexState = {
        module: shaderModules.vertex,
        entryPoint: "vertex_main",
        buffers: vertexBufferDescriptor,
    };

    // Constants
    const constants = { dt: settings.dt, M: settings.M, N: settings.N };
    
    // Pipelines
    const bound = createRenderPipeline(boundPipelineLayout, vertexStageDescriptor, shaderModules.bound, "set_bound", "r32float", constants, "line-list");
    const boundVec2 = createRenderPipeline(boundPipelineLayout, vertexStageDescriptor, shaderModules.bound, "set_bound_vec2", "rg32float", constants, "line-list");
    const source = createRenderPipeline(pipelineLayout, vertexStageDescriptor, shaderModules.source, "add_source", "r32float", constants, "triangle-list");
    const sourceVec2 = createRenderPipeline(pipelineLayout, vertexStageDescriptor, shaderModules.source, "add_source_vec2", "rg32float", constants, "triangle-list");
    const jacobi = createRenderPipeline(jacobiPipelineLayout, vertexStageDescriptor, shaderModules.jacobi, "jacobi", "r32float", constants, "triangle-list");
    const jacobiVec2 = createRenderPipeline(jacobiPipelineLayout, vertexStageDescriptor, shaderModules.jacobi, "jacobi_vec2", "rg32float", constants, "triangle-list");
    const advect = createRenderPipeline(pipelineLayout, vertexStageDescriptor, shaderModules.advect, "advect", "r32float", constants, "triangle-list");
    const advectVec2 = createRenderPipeline(pipelineLayout, vertexStageDescriptor, shaderModules.advect, "advect_vec2", "rg32float", constants, "triangle-list");
    const divergence = createRenderPipeline(pipelineLayout, vertexStageDescriptor, shaderModules.divergence, "divergence", "r32float", constants, "triangle-list");
    const subgrad = createRenderPipeline(pipelineLayout, vertexStageDescriptor, shaderModules.subgrad, "subtract_gradient", "rg32float", constants, "triangle-list");

    return {
        bound,
        boundVec2,
        source,
        sourceVec2,
        jacobi,
        jacobiVec2,
        advect,
        advectVec2,
        divergence,
        subgrad,
    }
}

function createRenderPassDescriptors(textureViews: TextureViews): RenderPassDescriptors {
    // Simulation render pass descriptors
    const velocity = [0,1,2].map(
        (i) => ({
            colorAttachments: [
                { loadOp: "clear", storeOp: "store", view: textureViews.velocity[i] },
            ],
        })
    ) as [GPURenderPassDescriptor, GPURenderPassDescriptor, GPURenderPassDescriptor];
    const density = [0,1,2].map(
        (i) => ({
            colorAttachments: [
                { loadOp: "clear", storeOp: "store", view: textureViews.density[i] },
            ],
        })
    ) as [GPURenderPassDescriptor, GPURenderPassDescriptor, GPURenderPassDescriptor];
    const scratch = [0,1,2].map(
        (i) => ({
            colorAttachments: [
                { loadOp: "clear", storeOp: "store", view: textureViews.scratch[i] },
            ],
        })
    ) as [GPURenderPassDescriptor, GPURenderPassDescriptor, GPURenderPassDescriptor];
    return {
        density,
        velocity,
        scratch
    };
}

function createRenderPipeline(
    layout: GPUPipelineLayout,
    vertex: GPUVertexState,
    module: GPUShaderModule,
    entryPoint: string,
    format: GPUTextureFormat,
    constants: Record<string, number>,
    topology: GPUPrimitiveTopology
): GPURenderPipeline {
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
    } as GPURenderPipelineDescriptor);
    return pipeline;
}