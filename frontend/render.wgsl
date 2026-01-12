struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@vertex
fn vertex_main (
    @location(0) position: vec4f,
    @location(1) uv: vec2f
) -> VertexOut {
    return VertexOut(uv, position);
}

@group(0) @binding(0) var density_map: texture_2d<f32>;
@group(0) @binding(1) var density_sampler: sampler;

@fragment
fn fragment_main(
    fragIn: VertexOut
) -> @location(0) vec4f {
    let density = textureSample(density_map, density_sampler, fragIn.uv);
    return density;
}