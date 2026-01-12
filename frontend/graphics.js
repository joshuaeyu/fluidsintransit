const canvas = document.getElementById("canvas");
const context = canvas.getContext("webgpu");

initWebGPU()
    .then(device => initRenderPipeline(device))
    .then(({device, renderCommandBuffer}) => render(device, renderCommandBuffer));

async function initWebGPU() {
    if (!navigator.gpu) {
        throw Error("WebGPU not supported.");
    }
    
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw Error("Couldn't request WebGPU adapter.");
    }
    
    const device = await adapter.requestDevice();
    if (!device) {
        throw Error("Couldn't request WebGPU device.");
    }

    context.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: "premultiplied",
    });

    return device;
}

async function initRenderPipeline(device) {
    // Screen quad vertex buffer
    const vertices = new Float32Array([
        -1, -1, 0, 1,     0, 0,
        -1, 1, 0, 1,     0, 1,
        1, -1, 0, 1,     1, 0,
        
        -1, 1, 0, 1,     0, 1,
        1, -1, 0, 1,     1, 0,
        1, 1, 0, 1,     1, 1,
    ]);
    const vertexBuffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices, 0, vertices.length);
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
    const shaderModule = device.createShaderModule({
        code: await fetch("render.wgsl", {cache: "reload"}).then(r => r.text()),
    })

    // Texture and sampler
    const imageData = new ImageData(
        new Uint8ClampedArray([
            0, 255, 0, 255,
            0, 0, 255, 255,
            255, 0, 0, 255,
            0, 0, 0, 255,
        ]),
        2, 2,
    );
    const texture = device.createTexture({
        format: "rgba8unorm",
        size: [imageData.width, imageData.height],
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
        { source: imageData },
        { texture: texture },
        [imageData.width, imageData.height],
    );
    const sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
    })

    // Texture/sampler bind group
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {},
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {},
            },
        ],
    });
    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: texture,
            },
            {
                binding: 1,
                resource: sampler,
            },
        ]
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
                    format: navigator.gpu.getPreferredCanvasFormat(),
                },
            ],
        },
        // layout: "auto",
        layout: device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        }),
    };

    const renderPipeline = device.createRenderPipeline(pipelineDescriptor);

    const commandEncoder = device.createCommandEncoder();

    const renderPassEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
            {
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "clear",
                storeOp: "store",
                view: context.getCurrentTexture().createView(),
            },
        ],
    });

    renderPassEncoder.setPipeline(renderPipeline);
    renderPassEncoder.setVertexBuffer(0, vertexBuffer);
    renderPassEncoder.setBindGroup(0, bindGroup);
    renderPassEncoder.draw(6);
    renderPassEncoder.end();

    renderCommandBuffer = commandEncoder.finish();

    return {device, renderCommandBuffer};
}

async function render(device, renderCommandBuffer) {
    device.queue.submit([renderCommandBuffer]);
}

async function initComputePipelines() {
    // Shader modules
    const shaderModule = device.createShaderModule({
        code: (await fetch("./compute.wgsl")).text(),
    })

    // Compute pipelines
    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [velocityBindGroupLayout, densityBindGroupLayout],
    });
    const linSolvePipeline = device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
            module: shaderModule,
            entryPoint: "lin_solve_single_iter",
        },
    });
    // other pipelines
}

async function testrun() {

}

