import type { Settings } from "../../types/settings.js";
import { Simulator } from "./simulator.js";
import type { SimulatorBackend } from "./backend.js";
import { SimulatorCompute } from "./compute.js";
import { SimulatorCpu } from "./cpu.js";
import { SimulatorFrag } from "./frag.js";

export class SimulatorFactory {
    static async create(settings: Settings, backend: SimulatorBackend = "compute"): Promise<Simulator> {
        switch (backend) {
            case "compute":
                return SimulatorCompute.build(settings);
            case "frag":
                return SimulatorFrag.build(settings);
            case "cpu":
                return SimulatorCpu.build(settings);
        }
    }
}
