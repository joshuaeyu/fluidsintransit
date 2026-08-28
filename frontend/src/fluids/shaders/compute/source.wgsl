@group(0) @binding(0) var x_tex: texture_storage_2d<r32float, read_write>;
@group(1) @binding(0) var add_tex: texture_storage_2d<r32float, read_write>;

override dt: f32;
override M: u32;
override N: u32;

fn inBounds(global_id: vec3u) -> bool {
    return global_id.x < M+2 || global_id.y < N+2;
}

// Add source to existing value field
@compute @workgroup_size(8, 8)
fn add_source(
    @builtin(global_invocation_id) global_id : vec3u,
    @builtin(num_workgroups) num_workgroups : vec3u,
    @builtin(local_invocation_id) local_id : vec3u
) {
    let pos = global_id.xy;
    let a = textureLoad(x_tex, pos).r;
    let b = textureLoad(add_tex, pos).r;
    textureStore(x_tex, pos, vec4(a+b,0,0,0));
}