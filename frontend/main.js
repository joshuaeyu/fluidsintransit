"use strict";

import { calcAdjustedX, calcAdjustedY, fetchBatchIds, fetchVehiclePositions } from "./app.js"
import { webGpuContext } from "./fluids/context.js";
import { RenderApp } from "./fluids/render.js";
import { SimulationApp } from "./fluids/simulation.js";
import { delay } from "./fluids/util.js";

// Simulation and rendering
const canvas = document.getElementById("canvas");
await webGpuContext.init(canvas, false);

const settings = {
    M: canvas.width - 2,
    N: canvas.height - 2,
    dt: 1,
    diffusivity: 0.0000001,
    dissipation: 0.9,
    viscosity: 0.0004,
    hdr: false,
};

const simulator = await SimulationApp.build(settings);
const renderer = await RenderApp.build(settings);

const densitySource = new Float32Array((settings.M+2) * (settings.N+2));
const velocitySource = new Float32Array((settings.M+2) * (settings.N+2) * 2);

// HTML
const settingsForm = document.getElementById("settings");
for (const radio of settingsForm.elements["playback-mode"]) {
    radio.addEventListener("change", initUI);
}
const batchSettingsFieldset = document.getElementById("batch-settings");
const batchIdSelect = document.getElementById("batch-id");
batchIdSelect.addEventListener("change", initBatch);
const timelineInput = document.getElementById("timeline");
const timelineLabel = document.getElementById("timeline-label");

// UI
let batchIds, dataframes;
await initUI();

async function initUI() {
    if (settingsForm.elements["playback-mode"].value === "live") {
        batchSettingsFieldset.hidden = true;
    } else if (settingsForm.elements["playback-mode"].value === "history") {
        batchSettingsFieldset.hidden = false;
        batchIds = await fetchBatchIds();
        batchIdSelect.innerHTML = "";
        for (const batchId of batchIds) {
            const option = document.createElement("option");
            option.value = batchId;
            option.textContent = batchId;
            option.textContent = (new Date(batchId * 1000)).toLocaleString("en-us", { timeZone: "America/Los_Angeles", timeZoneName: "short" });
            batchIdSelect.appendChild(option);
        }
        await initBatch();
    }
}

async function initBatch() {
    timelineInput.value = 0;
    timelineLabel.textContent = (new Date(batchIdSelect.value * 1000)).toLocaleString("en-us", { timeZone: "America/Los_Angeles", timeZoneName: "short" });
    dataframes = await fetchVehiclePositions(batchIdSelect.value);
    timelineInput.max = Object.keys(dataframes).length - 1;
}

// Main logic
for (let i = 0; i < 100000; i++) {
    await delay(10);
    if (document.hidden) {
        continue;
    }

    if (settingsForm.elements["playback-mode"].value === "live") {
        // ========== Live playback ==========
        if (i % 100 === 0) {
            densitySource.fill(0);
            velocitySource.fill(0);
            
            const vehicles = await fetchVehiclePositions();
            for (const vehicle of Object.values(vehicles)) {
                const x = Math.floor(calcAdjustedX(vehicle.longitude) * (settings.M + 2));
                const y = Math.floor(calcAdjustedY(vehicle.latitude) * (settings.N + 2));
                const idx = y * (settings.M+2) + x;
                densitySource[idx] = 100;
                velocitySource[2*idx] = vehicle.apparent_velocity_long * 100;
                velocitySource[2*idx+1] = vehicle.apparent_velocity_lat * 100;
            }
        }
        await simulator.addSourceVelocity(velocitySource);
        await simulator.addSourceDensity(densitySource);

        await simulator.velocityStep();
        await simulator.densityStep();

    } else if (settingsForm.elements["playback-mode"].value === "history") {
        // ========== History playback ==========
        while (!dataframes) {
            await delay(10);
        }
        
        if (i % 100 === 0) {
            densitySource.fill(0);
            velocitySource.fill(0);
            
            timelineInput.value = (parseInt(timelineInput.value) + 1) % timelineInput.max;
            const vehicles = Object.values(dataframes)[timelineInput.value];
            const timestampFetch = Object.keys(dataframes)[timelineInput.value];
            timelineLabel.textContent = (new Date(timestampFetch * 1000)).toLocaleString("en-us", { timeZone: "America/Los_Angeles", timeZoneName: "short" });
            for (const vehicle of Object.values(vehicles)) {
                const x = Math.floor(calcAdjustedX(vehicle.longitude) * (settings.M + 2));
                const y = Math.floor(calcAdjustedY(vehicle.latitude) * (settings.N + 2));
                const idx = y * (settings.M+2) + x;
                densitySource[idx] = 100;
                velocitySource[2*idx] = vehicle.apparent_velocity_long * 100;
                velocitySource[2*idx+1] = vehicle.apparent_velocity_lat * 100;
            }
        }
        await simulator.addSourceVelocity(velocitySource);
        await simulator.addSourceDensity(densitySource);

        await simulator.velocityStep();
        await simulator.densityStep();
    }

    // Render to canvas
    const tv = await simulator.getDensityOutputTextureView();
    // const tv = await simulator.getVelocityOutputTextureView();
    renderer.render(tv);
} 


