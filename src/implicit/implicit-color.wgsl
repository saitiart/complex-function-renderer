fn hsv2rgb(c: vec3f) -> vec3f {
    let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

fn get_color(p: vec4f) -> vec3f {
    let fz = vec2f(p.x, p.y); 
    
    let mag_fz = length(fz);
    let phase = atan2(p.y, p.x); 

    let hue_val = (phase + 3.14159265) / 6.2831853;
    
    let log_mag = log2(mag_fz + 1.0);

    return hsv2rgb(vec3f(hue_val, 1.0, 1.0));
}
