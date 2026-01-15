// import { fetchVehiclePositions } from "./app.js"
// import { initWebGPU } from "./webgpu.js"
// import { initSimulationPipelines } from "./fluids.js"
import { webGpuContext } from "./fluids/context.js";
import { SimulationApp } from "./fluids/simulation.js";
import { RenderApp } from "./fluids/render.js";

const canvas = document.getElementById("canvas");
await webGpuContext.init(canvas);

const simulationSettings = {
    M: 100, // Doesn't include boundary
    N: 100, // Doesn't include boundary
    dt: 0.001,
    diffusion: 1,
    viscosity: 1,
};

const renderSettings = {
    M: 100, // Doesn't include boundary
    N: 100, // Doesn't include boundary
};

const simulator = await SimulationApp.build(simulationSettings);
const renderer = await RenderApp.build(renderSettings);

const tv = await simulator.getDensityOutputTextureView();
await renderer.render(tv);