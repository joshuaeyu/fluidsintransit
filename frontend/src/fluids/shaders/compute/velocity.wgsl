@group(0) @binding(0) var velocityx_tex: texture_storage_2d_array<r32float, read_write>;
@group(0) @binding(1) var velocityy_tex: texture_storage_2d_array<r32float, read_write>;
@group(0) @binding(2) var scratch_tex: texture_storage_2d_array<r32float, read_write>;

override dt: f32;
override M: u32;
override N: u32;

struct JacobiUniforms {
    a: f32,
    c: f32
};
@group(1) @binding(0) var<uniform> diffuseUniforms: JacobiUniforms;
@group(1) @binding(1) var<uniform> projectUniforms: JacobiUniforms;

fn inBounds(global_id: vec3u) -> bool {
    return global_id.x < M+2 || global_id.y < N+2;
}

@compute @workgroup_size(8, 8)
fn main(
    @builtin(global_invocation_id) global_id : vec3u,
    @builtin(num_workgroups) num_workgroups : vec3u,
    @builtin(local_invocation_id) local_id : vec3u
) {
    velocity_step(global_id);
}

fn velocity_step(global_id: vec3u) {
    advect(global_id, 0, 1, 0);
    diffuse(global_id, 1, 0);
    project(global_id, 0, 1, 0, 1);
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
        let start_valx = textureLoad(velocityx_tex, start_pos, x0_idx);
        let start_valy = textureLoad(velocityy_tex, start_pos, x0_idx);
        // Write start_val to pos
        textureStore(velocityx_tex, pos, x_idx, start_valx);
        textureStore(velocityy_tex, pos, x_idx, start_valy);
    }
    storageBarrier();
}

fn jacobi(
    global_id: vec3u,
    x0_tex: texture_storage_2d_array<r32float, read_write>,
    x0_idx: u32,
    x_tex: texture_storage_2d_array<r32float, read_write>,
    x_idx: u32,
    a: f32,
    c: f32
) { 
    let pos = global_id.xy;
    let x0 = textureLoad(x0_tex, pos, x0_idx).r;
    let x_e = textureLoad(x_tex, pos+vec2(1,0), x_idx).r;
    let x_w = textureLoad(x_tex, pos-vec2(1,0), x_idx).r;
    let x_n = textureLoad(x_tex, pos+vec2(0,1), x_idx).r;
    let x_s = textureLoad(x_tex, pos-vec2(0,1), x_idx).r;
    let result = (x0 + a * (x_n + x_s + x_e + x_w)) / c;
    
    textureStore(x_tex, pos, x_idx, vec4f(result,0,0,0));
}

fn diffuse(
    global_id: vec3u,
    x0_idx: u32,
    x_idx: u32
) {
    for (var k = 0; k < 20; k++) {
        if (inBounds(global_id)) {
            jacobi(global_id, velocityx_tex, x0_idx, velocityx_tex, x_idx, diffuseUniforms.a, diffuseUniforms.c);
            jacobi(global_id, velocityy_tex, x0_idx, velocityy_tex, x_idx, diffuseUniforms.a, diffuseUniforms.c);
        }
        storageBarrier();
    }
}

fn project(
    global_id: vec3u,
    x0_idx: u32,
    x_idx: u32,
    div_idx: u32,
    p_idx: u32
) {
    let pos = global_id.xy;

    if (inBounds(global_id)) {
        // Compute divergence
        let u_e = textureLoad(velocityx_tex, pos+vec2(1,0), x0_idx).r;
        let u_w = textureLoad(velocityx_tex, pos-vec2(1,0), x0_idx).r;
        let v_n = textureLoad(velocityy_tex, pos+vec2(0,1), x0_idx).r;
        let v_s = textureLoad(velocityy_tex, pos-vec2(0,1), x0_idx).r;
        let result = -0.5 * (u_e - u_w + v_n - v_s) / sqrt(f32(M*N));
        textureStore(scratch_tex, pos, div_idx, vec4f(result,0,0,0));
    }
    storageBarrier();
    
    // Solve for pressure
    for (var k = 0; k < 20; k++) {
        if (inBounds(global_id)) {
            jacobi(global_id, scratch_tex, div_idx, scratch_tex, p_idx, projectUniforms.a, projectUniforms.c);
        }
        storageBarrier();
    }

    // Subtract pressure gradient
    if (inBounds(global_id)) {
        let p_e = textureLoad(scratch_tex, pos+vec2(1,0), p_idx).r;
        let p_w = textureLoad(scratch_tex, pos-vec2(1,0), p_idx).r;
        let p_n = textureLoad(scratch_tex, pos+vec2(0,1), p_idx).r;
        let p_s = textureLoad(scratch_tex, pos-vec2(0,1), p_idx).r;
        let resultx = textureLoad(velocityx_tex, pos, x0_idx).r - 0.5 * f32(M) * (p_e - p_w);
        let resulty = textureLoad(velocityy_tex, pos, x0_idx).r - 0.5 * f32(N) * (p_n - p_s);
        textureStore(velocityx_tex, pos, x_idx, vec4(resultx,0,0,0));
        textureStore(velocityy_tex, pos, x_idx, vec4(resulty,0,0,0));
    }
}