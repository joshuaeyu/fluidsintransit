import { calcAdjustedX, calcAdjustedY, fetchBatchIds, fetchVehiclePositions, LATITUDE_SPAN, LONGITUDE_SPAN, getVehicleType } from "./api/client.js"
import * as webGpuContext from "./fluids/context.js";
import { Renderer } from "./fluids/render.js";
import type { Settings } from "./types/settings.js";
import type { Vehicle, VehicleBatch, VehicleType } from "./types/vehicle.js";
import { SimulatorFactory } from "./fluids/simulator/factory.js";
import { delay } from "./util/util.js";

// Simulation and rendering
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const hdr = false;
await webGpuContext.initialize(canvas, hdr);

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
} as Settings;

const simulator = await SimulatorFactory.create(settings, "frag");
const renderer = await Renderer.build(settings);

const densitySource = new Float32Array((settings.M+2) * (settings.N+2));
const velocitySource = new Float32Array((settings.M+2) * (settings.N+2) * 2);

const densityFactor = settings.M * settings.N / 10000;
const velocityFactorX = settings.M * settings.N * settings.M / 1000;
const velocityFactorY = settings.M * settings.N * settings.N / 1000;

// HTML
const settingsForm = document.getElementById("settings") as HTMLFormElement;
const simulationSettingsForm = document.getElementById("simulation-settings") as HTMLFormElement;
const simulationSettings = simulationSettingsForm.elements;
for (const field of simulationSettings) {
    field.addEventListener("change", () => { 
        initSimulationSettings();
    });
}
const vehicleSettingsForm = document.getElementById("vehicle-settings") as HTMLFormElement;
const playbackSettingsForm = document.getElementById("playback-settings") as HTMLFormElement;
const playbackMode = playbackSettingsForm.elements.namedItem("playback-mode") as RadioNodeList;
for (const radio of playbackMode) {
    radio.addEventListener("change", () => { 
        initUI(); 
        simulator.reset(); 
    });
}
const batchSettingsFieldset = document.getElementById("batch-settings") as HTMLFieldSetElement;
const batchIdSelect = document.getElementById("batch-id") as HTMLSelectElement;
batchIdSelect.addEventListener("change", initBatch);
const timelineInput = document.getElementById("timeline") as HTMLInputElement;
const timelineLabel = document.getElementById("timeline-label") as HTMLLabelElement;
const toggleSettingsButton = document.getElementById("toggle-settings") as HTMLButtonElement;
toggleSettingsButton.addEventListener("click", () => { 
    settingsForm.hidden = !settingsForm.hidden; 
    if (settingsForm.hidden) {
        toggleSettingsButton.textContent = "Show Settings";
    } else {
        toggleSettingsButton.textContent = "Hide Settings";
    }
})

// UI
let batchIds: string[];
let dataframes: VehicleBatch;
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
        
        let vehicles: Vehicle[];
        if (playbackMode.value === "live") {
            vehicles = await fetchVehiclePositions();
        } else if (playbackMode.value === "history") {    
            timelineInput.value = String(
                (Number(timelineInput.value) + 1) % Number(timelineInput.max)
            );
            const timestampFetch = Object.keys(dataframes!)[Number(timelineInput.value)];
            timelineLabel.textContent = (new Date(Number(timestampFetch) * 1000)).toLocaleString("en-us", { timeZone: "America/Los_Angeles", timeZoneName: "short" });
            vehicles = Object.values(dataframes!)[Number(timelineInput.value)]!;
        } else {
            throw new Error();
        }
        for (const vehicle of Object.values(vehicles)) {
            // Check if vehicle type should be rendered
            const vehicleType = getVehicleType(vehicle);
            const vehicleTypeCheckbox = vehicleSettingsForm.elements.namedItem(vehicleType.toLowerCase()) as HTMLInputElement;
            if (!vehicleTypeCheckbox.checked) {
                continue;
            }
            // Update density and velocity source arrays based on vehicle properties
            const x = Math.floor(calcAdjustedX(vehicle.longitude) * (settings.M + 2));
            const y = Math.floor(calcAdjustedY(vehicle.latitude) * (settings.N + 2));
            const idx = y * (settings.M+2) + x;
            densitySource[idx] = settings.density * densityFactor;
            velocitySource[2*idx] = settings.velocity * (vehicle.apparent_velocity_long as number) / LONGITUDE_SPAN * velocityFactorX;
            velocitySource[2*idx+1] = settings.velocity * (vehicle.apparent_velocity_lat as number) / LATITUDE_SPAN * velocityFactorY;
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
        const value = parseFloat((field as HTMLInputElement).value);
        if (isFinite(value) && value > 0) {
            const setSettingsValue = <K extends keyof Settings>(key: K, value: Settings[K]) => {
               settings[key] = value;
            };
            const key = (field as HTMLInputElement).name as keyof Settings;
            // settings[key as keyof Settings] = value;
            setSettingsValue(key, value);
        } else {
            const key = (field as HTMLInputElement).name;
            (field as HTMLInputElement).value = String(settings[key as keyof Settings]);
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
            option.textContent = (new Date(parseInt(batchId) * 1000)).toLocaleString("en-us", { timeZone: "America/Los_Angeles", timeZoneName: "short" });
            batchIdSelect.appendChild(option);
        }
        await initBatch();
    }
}

async function initBatch() {
    timelineInput.value = String(0);
    timelineLabel.textContent = (new Date(parseInt(batchIdSelect.value) * 1000)).toLocaleString("en-us", { timeZone: "America/Los_Angeles", timeZoneName: "short" });
    dataframes = await fetchVehiclePositions(parseInt(batchIdSelect.value));
    timelineInput.max = String(Object.keys(dataframes).length - 1);
}