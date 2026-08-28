@group(0) @binding(0) var velocityx_tex: texture_storage_2d_array<r32float, read>;
@group(0) @binding(1) var velocityy_tex: texture_storage_2d_array<r32float, read>;
@group(0) @binding(2) var density_tex: texture_storage_2d_array<r32float, read_write>;

// Overrides
override dt: f32;
override M: u32;
override N: u32;

struct JacobiUniforms {
    a: f32,
    c: f32
};
@group(1) @binding(0) var<uniform> diffuseUniforms: JacobiUniforms;

fn inBounds(global_id: vec3u) -> bool {
    return global_id.x < M+2 || global_id.y < N+2;
}

@compute @workgroup_size(8, 8)
fn main(
    @builtin(global_invocation_id) global_id : vec3u,
    @builtin(num_workgroups) num_workgroups : vec3u,
    @builtin(local_invocation_id) local_id : vec3u
) {
    density_step(global_id);
}

fn density_step(global_id: vec3u) {
    advect(global_id, 0, 1, 0);
    diffuse(global_id, 1, 0);
}

fn advect(
    global_id: vec3u, 
    x0_idx: u32,
    x_idx: u32,
    vel_idx: u32
) {
    if (inBounds(global_id)) {
        let pos = global_id.xy;
        // Read velocity at pos
        let velx = textureLoad(velocityx_tex, pos, vel_idx).r;
        let vely = textureLoad(velocityy_tex, pos, vel_idx).r;
        let vel = vec2f(velx, vely);
        // Backtrace to start_pos and read start_val
        let start_pos = vec2u(vec2f(pos) - dt * vel);
        let start_val = textureLoad(density_tex, start_pos, x0_idx);
        // Write start_val to pos
        textureStore(density_tex, pos, x_idx, start_val);
    }
    storageBarrier();
}

fn diffuse(
    global_id: vec3u,
    x0_idx: u32,
    x_idx: u32
) {
    for (var k = 0; k < 20; k++) {
        if (inBounds(global_id)) {
            jacobi(global_id, x0_idx, x_idx, diffuseUniforms.a, diffuseUniforms.c);
        }
        storageBarrier(); // Sync ops in storage address space. (workgroupBarrier() only impacts invocations in the current 8x8 workgroup.)
    }
}

fn jacobi(
    global_id: vec3u,
    x0_idx: u32,
    x_idx: u32,
    a: f32,
    c: f32
) { 
    let pos = global_id.xy;
    let x0 = textureLoad(density_tex, pos, x0_idx).r;
    let x_e = textureLoad(density_tex, pos+vec2(1,0), x_idx).r;
    let x_w = textureLoad(density_tex, pos-vec2(1,0), x_idx).r;
    let x_n = textureLoad(density_tex, pos+vec2(0,1), x_idx).r;
    let x_s = textureLoad(density_tex, pos-vec2(0,1), x_idx).r;
    let result = (x0 + a * (x_n + x_s + x_e + x_w)) / c;
    
    textureStore(density_tex, pos, x_idx, vec4f(result,0,0,0));
}