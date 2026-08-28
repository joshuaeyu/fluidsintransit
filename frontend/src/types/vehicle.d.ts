export type VehicleBatch = Record<number, Vehicle[]>;

export type Vehicle = {
    id: number;

    timestamp_fetch: number;
    timestamp: number;
    batch_id: number;

    trip_id: string | undefined;
    route_id: string | undefined;
    vehicle_id: string;
    vehicle_label: string;

    latitude: number;
    longitude: number;
    bearing: number | undefined;
    odometer: number | undefined;
    speed: number | undefined;

    apparent_velocity_lat: number | undefined;
    apparent_velocity_long: number | undefined;
};

export type VehicleType = "Bus" | "Cableway" | "Metro";