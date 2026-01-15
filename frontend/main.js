// import { fetchVehiclePositions } from "./app.js"
import { webGpuContext } from "./fluids/context.js";
import { RenderApp } from "./fluids/render.js";
import { SimulationApp } from "./fluids/simulation.js";
import { delay } from "./fluids/util.js";

const canvas = document.getElementById("canvas");
await webGpuContext.init(canvas, true);

const settings = {
    M: 1000, // Doesn't include boundary
    N: 1000, // Doesn't include boundary
    dt: 1,
    diffusivity: 0.000001,
    viscosity: 1,
    hdr: true,
};

const simulator = await SimulationApp.build(settings);
const renderer = await RenderApp.build(settings);

const densitySource = new Float32Array((settings.M+2) * (settings.N+2));
for (let i = 0; i < settings.N+2; i++) {
    for (let j = 0; j < settings.M+2; j++) {
        const idx = i * (settings.M+2) + j;
        if (0.01*settings.M < j && j < 0.05*settings.M && 0.01*settings.N < i && i < 0.05*settings.N) {
            densitySource[idx] = 5;
        } else if (0.65*settings.M < j && j < 0.70*settings.M && 0.65*settings.N < i && i < 0.70*settings.N) {
            densitySource[idx] = 10;
        }
    }
}
const velocitySource = new Float32Array((settings.M+2) * (settings.N+2) * 2);
for (let i = 0; i < settings.N+2; i++) {
    for (let j = 0; j < settings.M+2; j++) {
        const idx = i * (settings.M+2) + j;
        velocitySource[2*idx] = -0.0003;
        velocitySource[2*idx+1] = -0.0001;
    }
}

await simulator.addSourceDensity(densitySource);
await simulator.addSourceVelocity(velocitySource);
for (let i = 0; i < 10000; i++) {
    await simulator.densityStep();
    // await simulator.velocityStep();
    const tv = await simulator.getDensityOutputTextureView();
    renderer.render(tv);
    await delay(1);
}