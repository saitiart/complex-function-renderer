@binding(0) @group(0) var<uniform> mvp_mat : mat4x4f;

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) vColor: vec4f,
    @location(1) dist: f32, 
};

struct FragmentOutput {
    @location(0) color: vec4f,
};

@vertex
fn vs_main(@location(0) pos: vec4f, @location(1) color: vec4f) -> VertexOutput {
    var output: VertexOutput;
    let clip_pos = mvp_mat * pos;
    
    output.position = clip_pos;
    output.vColor = color;
    output.dist = clip_pos.w;
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    let near = 1.0;
    let far = 20.0;
    
    let alpha = 1.0 - saturate((in.dist - near) / (far - near));
    
    let color = in.vColor.rgb;
    let gamma_corrected = pow(color, vec3f(1.0 / 2.2)); 
    
    return FragmentOutput(vec4f(gamma_corrected, 1.0));
}