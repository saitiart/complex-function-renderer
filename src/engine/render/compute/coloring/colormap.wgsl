fn hsv2rgb(c: vec3f) -> vec3f {
    let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

fn get_color(p: vec4f) -> vec3f {
    let z = vec2f(
        p.x / cp.scale_re, 
        p.z / cp.scale_im
    );
    
    let fz = c_func(z, cp.scale, u32(cp.funcSelection));
    
    let mag_fz = length(fz);
    let phase = atan2(fz.y, fz.x);
    let hue_val = (phase + 3.14159265) / 6.2831853;
    
    let log_mag = log2(mag_fz + 1.0);
    let ring_density = 1.0;
    let spoke_density = 4.0;
    
    let rings = 0.5 + 0.5 * sin(log_mag * ring_density * 6.2831853);
    let spokes = 0.5 + 0.5 * sin(hue_val * spoke_density * 6.2831853);
    let checker = abs(rings - spokes);
    
    let brightness = mix(0.6, 1.0, checker);
    
    return hsv2rgb(vec3f(hue_val, 1.0, brightness));
}

fn get_color_from_fz(fz: vec2f) -> vec3f {
    let mag_fz = length(fz);
    let phase = atan2(fz.y, fz.x);
    let hue_val = (phase + 3.14159265) / 6.2831853;

    let log_mag = log2(mag_fz + 1.0);
    let ring_density = 2.0;
    let spoke_density = 8.0;

    let rings = 0.5 + 0.5 * sin(log_mag * ring_density * 6.2831853);
    let spokes = 0.5 + 0.5 * sin(hue_val * spoke_density * 6.2831853);
    let checker = abs(rings - spokes);

    let brightness = mix(0.6, 1.0, checker);

    return hsv2rgb(vec3f(hue_val, 1.0, brightness));
}