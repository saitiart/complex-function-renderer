struct VertexInput {
    @location(0) quad_pos: vec2f,
    @location(1) inst_pos: vec3f,
    @location(2) inst_color: vec4f,
    @builtin(instance_index) instance_idx: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) vColor: vec4f,
    @location(1) uv: vec2f,           
};

@binding(0) @group(0) var<uniform> mvp_mat: mat4x4f;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    let clip_pos = mvp_mat * vec4f(in.inst_pos, 1.0); 
    let overlap = 2.0; 
    
    let point_size = 0.003; 
    let offset = in.quad_pos * point_size * clip_pos.w * overlap;
    
    output.position = vec4f(clip_pos.xy + offset, clip_pos.zw);
    output.vColor = in.inst_color;
    output.uv = in.quad_pos; 
    
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let dist = length(in.uv);
    
    
    let alpha = 1.0 - smoothstep(0.85, 1.0, dist);
    
    if (alpha < 0.01) {
        discard;
    }
    
    let color = in.vColor.rgb;
    
    let gamma_corrected = pow(color, vec3f(1.0 / 2.2));
    
    return vec4f(gamma_corrected, alpha);
}