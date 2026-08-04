struct VertexData {
    position: vec3f,
    color: vec4f,   
};

struct VertexDataArray {
    vertexDataArray: array<VertexData>,
};



const TAU: f32 = 6.28318530717959;

@group(0) @binding(0) var<storage, read_write> vda: VertexDataArray;
@group(0) @binding(1) var<uniform> cp: ComplexParams;

fn apply_rotations(p: vec4f) -> vec4f {
    var out = p;

    // XW Rotation
    let c_xw = cos(cp.rot_xw); let s_xw = sin(cp.rot_xw);
    let xw_mat = mat2x2<f32>(c_xw, s_xw, -s_xw, c_xw);
    let res_xw = xw_mat * vec2f(out.x, out.w);
    out.x = res_xw.x; out.w = res_xw.y;

    // YW Rotation
    let c_yw = cos(cp.rot_yw); let s_yw = sin(cp.rot_yw);
    let yw_mat = mat2x2<f32>(c_yw, s_yw, -s_yw, c_yw);
    let res_yw = yw_mat * vec2f(out.y, out.w);
    out.y = res_yw.x; out.w = res_yw.y;

    // ZW Rotation
    let c_zw = cos(cp.rot_zw); let s_zw = sin(cp.rot_zw);
    let zw_mat = mat2x2<f32>(c_zw, s_zw, -s_zw, c_zw);
    let res_zw = zw_mat * vec2f(out.z, out.w);
    out.z = res_zw.x; out.w = res_zw.y;

    return out;
}

fn quat_mul(a: vec4f, b: vec4f) -> vec4f {
    
    return vec4f(
        a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,  // x
        a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,  // y
        a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,  // z
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z   // w (real part)
    );
}

fn apply_rotations_quaternion(q: vec4f, axis1: vec3f, angle1: f32, axis2: vec3f, angle2: f32) -> vec4f {
    
    let lh = angle1 * 0.5;
    
    let left_quat = vec4f(axis1 * sin(lh), cos(lh)); 
    
    
    let rh = angle2 * 0.5;
    let right_quat = vec4f(axis2 * sin(rh), cos(rh));
    
    return quat_mul(quat_mul(left_quat, q), right_quat);
}

fn get_p4d_capped(grid_pos: vec2u) -> vec4f {
    let res = f32(cp.resolution);
    let uv = (vec2f(grid_pos) / (res - 1.0)) * 2.0 - 1.0;
    let z = vec2f(
        (uv.x * cp.domain_size_x) + cp.shift_x,
        (uv.y * cp.domain_size_z) + cp.shift_z
    );
            
    let fz = c_func(z, cp.scale, u32(cp.funcSelection));
    let mag = length(fz);

    let limit = 5.0;
    let capped_fz = (fz / (mag + 1e-4)) * limit * tanh(mag / limit);

    return vec4f(z.x * cp.scale_re , capped_fz.x * cp.amp_re , z.y * cp.scale_im, capped_fz.y * cp.amp_im );
}



fn get_p4d_standard_riemann(grid_pos: vec2u) -> vec4f {
    let res = f32(cp.resolution);
    let g = vec2f(grid_pos) / (res - 1.0);

    // Parametrize the domain Riemann sphere
    let theta = g.x * TAU;   // [0, 2pi]
    let phi   = g.y * PI;    // [0, pi]
    let sin_phi = sin(phi);
    let s = vec3f(sin_phi * cos(theta), sin_phi * sin(theta), cos(phi));

    // Inverse stereographic (north pole = infinity), pole-guarded
    let denom_d = max(1.0 - s.z, 1e-6);
    var z = vec2f(s.x / denom_d, s.y / denom_d);

    z = vec2f(
        z.x * cp.domain_size_x * cp.scale_re + cp.domain_center_x + cp.shift_x,
        z.y * cp.domain_size_z * cp.scale_im + cp.domain_center_z + cp.shift_z
    );

    // Evaluate and project codomain to the Riemann sphere
    let w = c_func(z, cp.scale, u32(cp.funcSelection));
    let r2 = dot(w, w);
    if (r2 != r2 || r2 > 1e12) {
        return vec4f(0.0, 0.0, 1.0, 1.0);   // infinity -> north pole
    }
    let denom = 1.0 + r2;
    let p = vec3f((2.0 * w.x) / denom, (2.0 * w.y) / denom, (r2 - 1.0) / denom);
    return vec4f(p, 1.0);
}

fn get_p4d_fiber_bundle(grid_pos: vec2u) -> vec4f {
    let res = f32(cp.resolution);
    let uv = (vec2f(grid_pos) / (res - 1.0)) * 2.0 - 1.0;

    // Domain z
    let z = vec2f(
        uv.x * cp.domain_size_x * cp.scale_re + cp.domain_center_x + cp.shift_x,
        uv.y * cp.domain_size_z * cp.scale_im + cp.domain_center_z + cp.shift_z
    );

    // Codomain w = f(z)
    let w = c_func(z, cp.scale, u32(cp.funcSelection));

    // S_z on the Riemann sphere
    let s = stereographic(z);

    // S_w on the Riemann sphere
    let t = stereographic(w);

    // Base point in R4
    let base = vec4f(s, 0.0);

    // Explicit frame Q_s : R3 -> Sigma_s
    let r = length(s.xy);

    var u1: vec4f;
    var u2: vec4f;
    let u3 = vec4f(0.0, 0.0, 0.0, 1.0);

    // Pole-safe branch
    if (r > 1e-6) {
        u1 = vec4f(
            -s.y / r,
             s.x / r,
             0.0,
             0.0
        );

        u2 = vec4f(
            -(s.x * s.z) / r,
            -(s.y * s.z) / r,
             r,
             0.0
        );
    } else {
        // At north/south pole: Sigma_s = {X3 = 0}
        u1 = vec4f(1.0, 0.0, 0.0, 0.0);
        u2 = vec4f(0.0, 1.0, 0.0, 0.0);
    }

    // Fiber point Q_s(S_w)
    let fiber = t.x * u1 + t.y * u2 + t.z * u3;

    // Optional fiber radius scaling
    let rho = 1.0;

    // Final affine 4D point
    return base + rho * fiber;
}


fn stereographic(w: vec2f) -> vec3f {
    let r2 = dot(w, w);
    let denom = 1.0 + r2;
    return vec3f(
        (2.0 * w.x) / denom,  
        (2.0 * w.y) / denom,  
        (r2 - 1.0) / denom    
    );
}

fn stereographic_4d_to_3d(p: vec4f) -> vec3f {
    let denom = 1.0 - p.w + 1e-6; 
    return vec3f(p.x, p.y, p.z) / denom;
}

fn get_p4d_sphere(grid_pos: vec2u) -> vec4f {
    let res = f32(cp.resolution);
    let uv = (vec2f(grid_pos) / (res - 1.0)) * 2.0 - 1.0;
    
    let z = vec2f(
        uv.x * cp.domain_size_x * cp.scale_re + cp.domain_center_x + cp.shift_x,
        uv.y * cp.domain_size_z * cp.scale_im + cp.domain_center_z + cp.shift_z
    );
    
    let fz = c_func(z, cp.scale, u32(cp.funcSelection));
    
    let v4 = vec4f(z.x, z.y, fz.x, fz.y);
    
    let r2 = dot(v4, v4);
       
    let denom = 1.0 + r2;
    
    return vec4f(
        (2.0 * v4.x) / denom,
        (2.0 * v4.y) / denom,
        (2.0 * v4.z) / denom,
        (2.0 * v4.w) / denom
    );
}

fn hopf_fibration(p4d: vec4f) -> vec3f {
    let len = length(p4d);
    if (len < 1e-6) {
        return vec3f(0.0, 0.0, -1.0);
    }
    let p = p4d / len; 
    
    let x = p.x;
    let y = p.y;
    let z = p.z;
    let w = p.w;
    
    return vec3f(
        2.0 * (x * z + y * w),          // Hopf X
        2.0 * (y * z - x * w),          // Hopf Y
        x * x + y * y - z * z - w * w   // Hopf Z
    );
}

fn get_hopf_fiber(grid_pos: vec2u) -> vec4f {
    let res = f32(cp.resolution);
    let uv = vec2f(grid_pos) / (res - 1.0); 
    
    let phi = uv.x * 6.28318;   
    let theta = uv.y * 3.14159; 
    let psi = cp.scale;

    return vec4f(
        cos(phi + psi) * sin(theta),
        sin(phi + psi) * sin(theta),
        cos(phi - psi) * cos(theta),
        sin(phi - psi) * cos(theta)
    );
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let i = id.x;
    let j = id.y;
    let resolution = u32(cp.resolution);
    if (id.x >= resolution || id.y >= resolution) { return; }

    var p4d: vec4f;
    var color: vec3f;
    var skip_post_rot = false;

        
    if (cp.funcSelection == 17.0) {
        // Hopf fiber
        p4d = get_hopf_fiber(id.xy);
        color = get_color(get_p4d_capped(id.xy));
    } else if (cp.show_fibration > 0.5) {
        // Fiber bundle
        p4d = get_p4d_fiber_bundle(id.xy);
        color = get_color(get_p4d_capped(id.xy));
    } else if (cp.use_riemann_sphere >= 0.5) {
        p4d = get_p4d_standard_riemann(id.xy);
        color = get_color(p4d);         
    } else {
        p4d = get_p4d_capped(id.xy);
        color = get_color(p4d);
    }

    // 2. Apply 4D Rotations (if applicable)
    var rotated_p4d: vec4f;
    
    rotated_p4d = select(
        apply_rotations(p4d),
        apply_rotations_quaternion(
            p4d,
            normalize(cp.quat_axis_left), cp.quat_angle_left,
            normalize(cp.quat_axis_right), cp.quat_angle_right
        ),
        cp.use_quaternion_rotation >= 0.5
    );

    // 3. Final 3D Projection
    var p3d: vec3f;
    if (cp.funcSelection == 17.0) {
        p3d = stereographic_4d_to_3d(rotated_p4d);
    } else {
        p3d = select(rotated_p4d.xyz, hopf_fibration(rotated_p4d), cp.use_hopf_projection >= 0.5);
    }

    // 4. Write to Buffer
    let idx = i + j * resolution;
    vda.vertexDataArray[idx].position = p3d;
    vda.vertexDataArray[idx].color = vec4f(color, 1.0);
}