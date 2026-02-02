"use strict";

import { calcAdjustedX, calcAdjustedY, fetchBatchIds, fetchVehiclePositions, LATITUDE_SPAN, LONGITUDE_SPAN, getVehicleType, VehicleType } from "./client.js"
import { webGpuContext } from "./fluids/context.js";
import { RenderApp } from "./fluids/render.js";
import { SimulationApp } from "./fluids/simulation_frag.js";
import { delay } from "./util.js";

// Simulation and rendering
const canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const hdr = false;
await webGpuContext.init(canvas, hdr);

const settings = {
    // Fixed
    M: canvas.width - 2,
    N: canvas.height - 2,
    hdr: hdr,
    dt: 0.001,
    // Dynamic
    diffusivity: 0.00005,
    dissipation: 0.9,
    viscosity: 0.001,
    density: 20,
    velocity: 10, 
};

const simulator = await SimulationApp.build(settings);
const renderer = await RenderApp.build(settings);

const densitySource = new Float32Array((settings.M+2) * (settings.N+2));
const velocitySource = new Float32Array((settings.M+2) * (settings.N+2) * 2);

const densityFactor = settings.M * settings.N / 10000;
const velocityFactorX = settings.M * settings.N * settings.M / 1000;
const velocityFactorY = settings.M * settings.N * settings.N / 1000;

// HTML
const settingsForm = document.getElementById("settings");
const simulationSettingsForm = document.getElementById("simulation-settings");
const simulationSettings = simulationSettingsForm.elements;
for (const field of simulationSettings) {
    field.addEventListener("change", () => { 
        initSimulationSettings();
    });
}
const vehicleSettingsForm = document.getElementById("vehicle-settings");
const playbackSettingsForm = document.getElementById("playback-settings");
const playbackMode = playbackSettingsForm.elements["playback-mode"];
for (const radio of playbackMode) {
    radio.addEventListener("change", () => { 
        initUI(); 
        simulator.reset(); 
    });
}
const batchSettingsFieldset = document.getElementById("batch-settings");
const batchIdSelect = document.getElementById("batch-id");
batchIdSelect.addEventListener("change", initBatch);
const timelineInput = document.getElementById("timeline");
const timelineLabel = document.getElementById("timeline-label");
const toggleSettingsButton = document.getElementById("toggle-settings");
toggleSettingsButton.addEventListener("click", () => { 
    settingsForm.hidden = !settingsForm.hidden; 
    if (settingsForm.hidden) {
        toggleSettingsButton.textContent = "Show Settings";
    } else {
        toggleSettingsButton.textContent = "Hide Settings";
    }
})

// UI
let batchIds, dataframes;
initSimulationSettings();
await initUI();

// Main logic
let t = 0;
while (true) {
    await delay(10);
    if (document.hidden) {
        continue;
    }
    // const startTime = performance.now();

    // Add density and velocity sources every 100 frames
    if (t % 100 === 0) {
        densitySource.fill(0);
        velocitySource.fill(0);
        
        let vehicles;
        if (playbackMode.value === "live") {
            vehicles = await fetchVehiclePositions();
        } else if (playbackMode.value === "history") {    
            timelineInput.value = (parseInt(timelineInput.value) + 1) % timelineInput.max;
            const timestampFetch = Object.keys(dataframes)[timelineInput.value];
            timelineLabel.textContent = (new Date(timestampFetch * 1000)).toLocaleString("en-us", { timeZone: "America/Los_Angeles", timeZoneName: "short" });
            vehicles = Object.values(dataframes)[timelineInput.value];
        }
        for (const vehicle of Object.values(vehicles)) {
            switch (getVehicleType(vehicle)) {
                case VehicleType.Bus:
                    if (!vehicleSettingsForm.elements.bus.checked) {
                        continue;
                    }
                    break;
                case VehicleType.Metro:
                    if (!vehicleSettingsForm.elements.metro.checked) {
                        continue;
                    }
                    break;
                case VehicleType.Cableway:
                    if (!vehicleSettingsForm.elements.cableway.checked) {
                        continue;
                    }
                    break;
            }
            const x = Math.floor(calcAdjustedX(vehicle.longitude) * (settings.M + 2));
            const y = Math.floor(calcAdjustedY(vehicle.latitude) * (settings.N + 2));
            const idx = y * (settings.M+2) + x;
            densitySource[idx] = settings.density * densityFactor;
            velocitySource[2*idx] = settings.velocity * vehicle.apparent_velocity_long / LONGITUDE_SPAN * velocityFactorX;
            velocitySource[2*idx+1] = settings.velocity * vehicle.apparent_velocity_lat / LATITUDE_SPAN * velocityFactorY;
        }
    }

    // Simulate
    await simulator.addVelocitySource(velocitySource);
    await simulator.addDensitySource(densitySource);
    await simulator.velocityStep();
    await simulator.densityStep();

    // Render to canvas
    const tv = simulator.getDensityOutputTextureView();
    // const tv = simulator.getVelocityOutputTextureView();
    renderer.render(tv);
    
    t++;
} 

function initSimulationSettings() {
    for (const field of simulationSettings) {
        const value = parseFloat(field.value);
        if (isFinite(value) && value > 0) {
            settings[field.name] = value;
        } else {
            field.value = settings[field.name];
        }
    }
}

async function initUI() {
    if (playbackMode.value === "live") {
        batchSettingsFieldset.hidden = true;
    } else if (playbackMode.value === "history") {
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