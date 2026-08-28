import type { Vehicle, VehicleBatch, VehicleType } from "../types/vehicle.js";

// Document elements
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// San Francisco border coordinates
const NORTH_BORDER = 37.833;
const SOUTH_BORDER = 37.700;
const EAST_BORDER = -122.359;
const WEST_BORDER = -122.517;
export const LONGITUDE_SPAN = NORTH_BORDER - SOUTH_BORDER;
export const LATITUDE_SPAN = EAST_BORDER - WEST_BORDER;
// export const milesPerDegreeLatitude = 54.69;
// export const milesPerDegreeLongitude = 69.00;

// Coordinate functions
export function calcX(longitude: number): number {
    return (longitude - WEST_BORDER) / (EAST_BORDER - WEST_BORDER)
}
export function calcY(latitude: number): number {
    return 1 - (latitude - SOUTH_BORDER) / (NORTH_BORDER - SOUTH_BORDER)
}
export function calcAdjustedX(longitude: number): number {
    const x0 = calcX(longitude);
    if (canvas.width <= canvas.height) {
        return x0;
    } else {
        const offset = (canvas.width - canvas.height) / 2 / canvas.width;
        return x0 / (canvas.width / canvas.height) + offset;
    }
}
export function calcAdjustedY(latitude: number): number {
    const y0 = calcY(latitude);
    if (canvas.height <= canvas.width) {
        return y0;
    } else {
        const offset = (canvas.height - canvas.width) / 2 / canvas.height;
        return y0 / (canvas.height / canvas.width) + offset;
    }
}

// Vehicle functions
export function getVehicleType(vehicle: Vehicle): VehicleType {
    if (['CA', 'PH', 'PM'].indexOf(vehicle.route_id as string) !== -1) {
        return "Cableway";
    } else if (isAlpha((vehicle.route_id as string)[0] as string)) {
        return "Metro";
    } else {
        return "Bus";
    }
}
function isAlpha(char: string): boolean {
    return /^[A-Z]/.test(char);
}

// API calls
export async function fetchBatchIds(): Promise<string[]> {
    // Fetch batch ids
    let batch_ids;
    try {
        const request = new Request("http://localhost:8000/history/all_batch_ids");
        const response = await fetch(request);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status} ${response.statusText}`);
        }
        batch_ids = await response.json();
    } catch (e) {
        throw e;
    }

    return batch_ids;
}

export async function fetchVehiclePositions(batch_id: number): Promise<VehicleBatch>;
export async function fetchVehiclePositions(): Promise<Vehicle[]>;

export async function fetchVehiclePositions(batch_id: number | null = null): Promise<VehicleBatch | Vehicle[]> {
    // Fetch vehicle positions
    let vehicles;
    try {
        let url = "http://localhost:8000";
        if (batch_id) {
            url += `/history/batch/${batch_id}`;
        } else {
            url += "/live";
        }
        const request = new Request(url);
        const response = await fetch(request);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status} ${response.statusText}`);
        }
        vehicles = await response.json();
    } catch (e) {
        throw e;
    }

    return vehicles;
}