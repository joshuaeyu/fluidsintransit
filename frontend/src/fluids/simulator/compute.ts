import type { Settings } from "../../types/settings.js";
import * as webGpuContext from "../context.js";
import { Simulator } from "./simulator.js";

type BindGroupLayouts = {
    indvTexture: GPUBindGroupLayout;
    velocityTexture: GPUBindGroupLayout;
    densityTexture: GPUBindGroupLayout;
    densityUniform: GPUBindGroupLayout;
    velocityUniform: GPUBindGroupLayout;
};

type BindGroups = {
    densityTextureViews: [GPUBindGroup, GPUBindGroup];
    velocityxTextureViews: [GPUBindGroup, GPUBindGroup];
    velocityyTextureViews: [GPUBindGroup, GPUBindGroup];
    densityStepTextureArrays: GPUBindGroup;
    velocityStepTextureArrays: GPUBindGroup;
    densityStepUniforms: GPUBindGroup;
    velocityStepUniforms: GPUBindGroup;
};

type Pipelines = {
    source: GPUComputePipeline;
    density: GPUComputePipeline;
    velocity: GPUComputePipeline;
};

type ShaderModules = {
    source: GPUShaderModule;
    density: GPUShaderModule;
    velocity: GPUShaderModule;
};

type Textures = {
    density: GPUTexture;
    velocityx: GPUTexture;
    velocityy: GPUTexture;
    scratch: GPUTexture;
};

type TextureViews = {
    density: [GPUTextureView, GPUTextureView];
    velocityx: [GPUTextureView, GPUTextureView];
    velocityy: [GPUTextureView, GPUTextureView];
};

type UniformBuffers = {
    densityDiffuse: GPUBuffer;
    velocityDiffuse: GPUBuffer;
    velocityProject: GPUBuffer;
};

type UniformArrays = {
    jacobi: Float32Array;
};


export class SimulatorCompute extends Simulator {
    // Fluid sim settings
    settings: Settings;
    // Compute settings
    private workgroupDim: number = 8;
    // Current target texture
    private densityOutIdx: number = 0;
    private velocityOutIdx: number = 0;
    // WebGPU resources
    private readonly bindGroupLayouts: BindGroupLayouts;
    private readonly bindGroups: BindGroups;
    private readonly pipelines: Pipelines;
    private readonly shaderModules: ShaderModules;
    private readonly textures: Textures;
    private readonly textureViews: TextureViews;
    private readonly uniformBuffers: UniformBuffers;
    private readonly uniformArrays: UniformArrays;
    
    private constructor(
        settings: Settings,
        bindGroupLayouts: BindGroupLayouts,
        bindGroups: BindGroups,
        pipelines: Pipelines,
        shaderModules: ShaderModules,
        textures: Textures,
        textureViews: TextureViews,
        uniformBuffers: UniformBuffers,
        uniformArrays: UniformArrays
    ) {
        super();
        this.settings = settings;
        this.bindGroupLayouts = bindGroupLayouts;
        this.bindGroups = bindGroups;
        this.pipelines = pipelines;
        this.shaderModules = shaderModules;
        this.textures = textures;
        this.textureViews = textureViews;
        this.uniformBuffers = uniformBuffers;
        this.uniformArrays = uniformArrays;
    }

    static async build(settings: Settings): Promise<SimulatorCompute> {
        const textures = createTextures(settings);
        const textureViews = createTextureViews(textures);
        
        const uniformArrays = createUniformArrays();
        const uniformBuffers = createUniformBuffers(uniformArrays);
        
        const bindGroupLayouts = createBindGroupLayouts();
        const bindGroups = createBindGroups(bindGroupLayouts, textures, textureViews, uniformBuffers);
        
        const shaderModules = await createShaderModules();
        const pipelines = createPipelines(settings, bindGroupLayouts, shaderModules);
        
        return new SimulatorCompute(
            settings,
            bindGroupLayouts,
            bindGroups,
            pipelines,
            shaderModules,
            textures,
            textureViews,
            uniformBuffers,
            uniformArrays,
        );
    }

    reset(): void {
        // Clear simulation data
        for (const tex of Object.values(this.textures)) {
            this.clearTexture(tex);
        }
        this.densityOutIdx = 0;
        this.velocityOutIdx = 0;
    }

    async addDensitySource(sourceDataArray: Float32Array): Promise<void> {
        // Copy data
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.textures.density,
                origin: [0, 0, 1-this.densityOutIdx],
            }, 
            sourceDataArray, 
            {
                bytesPerRow: this.textures.density.width * 4,
            }, 
            {
                width: this.textures.density.width,
                height: this.textures.density.height,
        });
        // Add source
        const commandEncoder = webGpuContext.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.pipelines.source);
        passEncoder.setBindGroup(0, this.bindGroups.densityTextureViews[this.densityOutIdx] as GPUTextureView);
        passEncoder.setBindGroup(1, this.bindGroups.densityTextureViews[1-this.densityOutIdx] as GPUTextureView);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.workgroupDim), Math.ceil(this.settings.N+2)/this.workgroupDim); // Number of workgroups
        passEncoder.end();
        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    async addVelocitySource(sourceDataArray: Float32Array): Promise<void> {
        // Copy data
        const sourceDataX = sourceDataArray.filter((_,i) => i % 2 == 0);
        const sourceDataY = sourceDataArray.filter((_,i) => i % 2 == 1);
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.textures.velocityx,
                origin: [0, 0, 1-this.velocityOutIdx],
            }, 
            sourceDataX, 
            {
                bytesPerRow: this.textures.velocityx.width * 4,
            }, 
            {
                width: this.textures.velocityx.width,
                height: this.textures.velocityx.height,
        });
        webGpuContext.device.queue.writeTexture(
            { 
                texture: this.textures.velocityy,
                origin: [0, 0, 1-this.velocityOutIdx],
            }, 
            sourceDataY, 
            {
                bytesPerRow: this.textures.velocityy.width * 4,
            }, 
            {
                width: this.textures.velocityy.width,
                height: this.textures.velocityy.height,
        });
        // Add source
        const commandEncoder = webGpuContext.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.pipelines.source);
        passEncoder.setBindGroup(0, this.bindGroups.velocityxTextureViews[this.velocityOutIdx] as GPUTextureView);
        passEncoder.setBindGroup(1, this.bindGroups.velocityxTextureViews[1-this.velocityOutIdx] as GPUTextureView);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.workgroupDim), Math.ceil(this.settings.N+2)/this.workgroupDim); // Number of workgroups
        passEncoder.setBindGroup(0, this.bindGroups.velocityyTextureViews[this.velocityOutIdx] as GPUTextureView);
        passEncoder.setBindGroup(1, this.bindGroups.velocityyTextureViews[1-this.velocityOutIdx] as GPUTextureView);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.workgroupDim), Math.ceil(this.settings.N+2)/this.workgroupDim); // Number of workgroups
        passEncoder.end();
        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    async densityStep(): Promise<void> {
        // Uniforms (a, c, values for Jacobi diffusion solver)
        const a = this.settings.dt * this.settings.dissipation * this.settings.diffusivity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a / this.settings.dissipation;
        this.uniformArrays.jacobi.set([a, c]);
        webGpuContext.device.queue.writeBuffer(this.uniformBuffers.densityDiffuse, 0, this.uniformArrays.jacobi);
        
        // Compute
        const commandEncoder = webGpuContext.device.createCommandEncoder();

        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.pipelines.density); // Operation
        passEncoder.setBindGroup(0, this.bindGroups.densityStepTextureArrays);
        passEncoder.setBindGroup(1, this.bindGroups.densityStepUniforms);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.workgroupDim), Math.ceil(this.settings.N+2)/this.workgroupDim); // Number of workgroups
        passEncoder.end();

        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    async velocityStep(): Promise<void> {
        // Zero out scratch space
        this.clearTexture(this.textures.scratch);
        
        // Uniforms (a, c, values for Jacobi solver for diffusion and projection)
        const a = this.settings.dt * this.settings.viscosity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a;
        this.uniformArrays.jacobi.set([a, c]); // For diffusion
        webGpuContext.device.queue.writeBuffer(this.uniformBuffers.velocityDiffuse, 0, this.uniformArrays.jacobi);
        this.uniformArrays.jacobi.set([1, 4]); // For projection
        webGpuContext.device.queue.writeBuffer(this.uniformBuffers.velocityProject, 0, this.uniformArrays.jacobi);
        
        // Compute
        const commandEncoder = webGpuContext.device.createCommandEncoder();

        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.pipelines.velocity); // Operation
        passEncoder.setBindGroup(0, this.bindGroups.velocityStepTextureArrays);
        passEncoder.setBindGroup(1, this.bindGroups.velocityStepUniforms);
        passEncoder.dispatchWorkgroups(Math.ceil((this.settings.M+2)/this.workgroupDim), Math.ceil(this.settings.N+2)/this.workgroupDim); // Number of workgroups
        passEncoder.end();

        commandEncoder.copyTextureToTexture(
            { 
                origin: [0,0,1],
                texture: this.textures.velocityx,
            },
            { 
                origin: [0,0,0],
                texture: this.textures.velocityx,
            },
            {
                width: this.textures.velocityx.width,
                height: this.textures.velocityx.height,
            }
        );
        commandEncoder.copyTextureToTexture(
            { 
                origin: [0,0,1],
                texture: this.textures.velocityy,
            },
            { 
                origin: [0,0,0],
                texture: this.textures.velocityy,
            },
            {
                width: this.textures.velocityy.width,
                height: this.textures.velocityy.height,
            }
        );

        webGpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    getDensityOutputTextureView(): GPUTextureView {
        return this.textureViews.density[this.densityOutIdx] as GPUTextureView;
    }

    getVelocityOutputTextureView(): GPUTextureView {
        return this.textureViews.velocityy[this.velocityOutIdx] as GPUTextureView;
    }

    clearTexture(texture: GPUTexture) {
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
}

async function createShaderModules(): Promise<ShaderModules> {
    // Shader modules
    const source = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/compute/source.wgsl", {cache: "reload"}).then(r => r.text()),
    });
    const density = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/compute/density.wgsl", {cache: "reload"}).then(r => r.text()),
    });
    const velocity = webGpuContext.device.createShaderModule({
        code: await fetch("fluids/shaders/compute/velocity.wgsl", {cache: "reload"}).then(r => r.text()),
    });
    return {
        source,
        density,
        velocity
    };
}

function createUniformArrays(): UniformArrays {
    // Uniform buffers (JacobiUniforms) - a, c
    const jacobi = new Float32Array(2);
    return {
        jacobi
    };
}

function createUniformBuffers(uniformValues: UniformArrays): UniformBuffers {
    // Uniform buffers (JacobiUniforms) - a, c
    const densityDiffuse = webGpuContext.device.createBuffer({
        size: uniformValues.jacobi.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const velocityDiffuse = webGpuContext.device.createBuffer({
        size: uniformValues.jacobi.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const velocityProject = webGpuContext.device.createBuffer({
        size: uniformValues.jacobi.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    return {
        densityDiffuse,
        velocityDiffuse,
        velocityProject
    };
}

function createTextures(settings: Settings): Textures {
    const velocityx = webGpuContext.device.createTexture({
        dimension: "2d",
        format: "r32float",
        size: [settings.M + 2, settings.N + 2, 2],
        usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
        label: "velocityx",
    });
    const velocityy = webGpuContext.device.createTexture({
        dimension: "2d",
        format: "r32float",
        size: [settings.M + 2, settings.N + 2, 2],
        usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
        label: "velocityy",
    });
    const density = webGpuContext.device.createTexture({
        dimension: "2d",
        format: "r32float",
        size: [settings.M + 2, settings.N + 2, 2],
        usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
        label: "density",
    });
    const scratch = webGpuContext.device.createTexture({
        dimension: "2d",
        format: "r32float",
        size: [settings.M + 2, settings.N + 2, 2],
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
        label: "scratch",
    });

    return {
        density,
        velocityx,
        velocityy,
        scratch
    };
}

function createTextureViews(textures: Textures): TextureViews {
    const density = [0,1].map(
        (i) => textures.density.createView({ dimension: "2d", baseArrayLayer: i })
    ) as [GPUTextureView, GPUTextureView]
    const velocityx = [0,1].map(
        (i) => textures.velocityx.createView({ dimension: "2d", baseArrayLayer: i })
    ) as [GPUTextureView, GPUTextureView];
    const velocityy = [0,1].map(
        (i) => textures.velocityy.createView({ dimension: "2d", baseArrayLayer: i })
    ) as [GPUTextureView, GPUTextureView];
    // const scratch = [0,1].map(
    //     (i) => textures.scratch.createView({ dimension: "2d", baseArrayLayer: i })
    // );
    // if (velocityx.length != 2) {
    //     throw new Error();
    // }
    return {
        density,
        velocityx,
        velocityy
    };
}

function createBindGroupLayouts(): BindGroupLayouts {
    // Bind group layouts
    const indvTexture = webGpuContext.device.createBindGroupLayout({
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
    const velocityTexture = webGpuContext.device.createBindGroupLayout({
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
    const densityTexture = webGpuContext.device.createBindGroupLayout({
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
    const densityUniform = webGpuContext.device.createBindGroupLayout({
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
    const velocityUniform = webGpuContext.device.createBindGroupLayout({
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

    return {
        indvTexture,
        velocityTexture,
        densityTexture,
        densityUniform,
        velocityUniform
    };
}

function createBindGroups(bindGroupLayouts: BindGroupLayouts, textures: Textures, textureViews: TextureViews, uniformBuffers: UniformBuffers): BindGroups {
    // Bind groups
    const velocityxTextureViews = [0,1].map((i) => webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.indvTexture,
        entries: [
            { binding: 0, resource: textureViews.velocityx[i] as GPUTextureView },
        ],
    })) as [GPUTextureView, GPUTextureView];
    const velocityyTextureViews = [0,1].map((i) => webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.indvTexture,
        entries: [
            { binding: 0, resource: textureViews.velocityy[i] as GPUTextureView },
        ],
    })) as [GPUTextureView, GPUTextureView];
    const densityTextureViews = [0,1].map((i) => webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.indvTexture,
        entries: [
            { binding: 0, resource: textureViews.density[i] as GPUTextureView },
        ],
    })) as [GPUTextureView, GPUTextureView];
    // const scratchTextureViews = [0,1].map((i) => webGpuContext.device.createBindGroup({
    //     layout: bindGroupLayouts.indvTexture,
    //     entries: [
    //         { binding: 0, resource: textureViews.scratch[i] },
    //     ],
    // }));
    const velocityStepTextureArrays = webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.velocityTexture,
        entries: [
            { binding: 0, resource: textures.velocityx },
            { binding: 1, resource: textures.velocityy },
            { binding: 2, resource: textures.scratch },
        ],
    });
    const densityStepTextureArrays = webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.densityTexture,
        entries: [
            { binding: 0, resource: textures.velocityx },
            { binding: 1, resource: textures.velocityy },
            { binding: 2, resource: textures.density },
        ],
    });
    const velocityStepUniforms = webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.velocityUniform,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffers.velocityDiffuse } },
            { binding: 1, resource: { buffer: uniformBuffers.velocityProject } },
        ],
    });
    const densityStepUniforms = webGpuContext.device.createBindGroup({
        layout: bindGroupLayouts.densityUniform,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffers.densityDiffuse } },
        ],
    });
    
    return {
        densityTextureViews,
        velocityxTextureViews,
        velocityyTextureViews,
        densityStepTextureArrays,
        velocityStepTextureArrays,
        densityStepUniforms,
        velocityStepUniforms,
    };
}

function createPipelines(settings: Settings, bindGroupLayouts: BindGroupLayouts, shaderModules: ShaderModules): Pipelines {
    // Compute pipelines
    const sourcePipelineLayout = webGpuContext.device.createPipelineLayout({
        bindGroupLayouts: [
            bindGroupLayouts.indvTexture, 
            bindGroupLayouts.indvTexture
        ],
    });
    const densityPipelineLayout = webGpuContext.device.createPipelineLayout({
        bindGroupLayouts: [
            bindGroupLayouts.densityTexture, 
            bindGroupLayouts.densityUniform
        ],
    });
    const velocityPipelineLayout = webGpuContext.device.createPipelineLayout({
        bindGroupLayouts: [
            bindGroupLayouts.velocityTexture, 
            bindGroupLayouts.velocityUniform
        ],
    });
    const constants = { dt: settings.dt, M: settings.M, N: settings.N };
    
    const source = createComputePipeline(sourcePipelineLayout, shaderModules.source, "add_source", constants);
    const density = createComputePipeline(densityPipelineLayout, shaderModules.density, "main", constants);
    const velocity = createComputePipeline(velocityPipelineLayout, shaderModules.velocity, "main", constants);

    return {
        source,
        density,
        velocity
    };
}

function createComputePipeline(
    layout: GPUPipelineLayout, 
    module: GPUShaderModule, 
    entryPoint: string, 
    constants: Record<string, number>
): GPUComputePipeline {
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